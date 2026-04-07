/**
 * Consolidated Middlewares
 * Combined smaller middleware modules into a single file
 */

const { db } = require('../config/database');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// =============================================================================
// AUDIT MIDDLEWARE
// =============================================================================

const logAction = async (userId, action, tableName, recordId, oldValues = null, newValues = null, req = null) => {
  try {
    const ipAddress = req ? (req.ip || req.connection?.remoteAddress || 'unknown') : null;
    const userAgent = req ? req.get('User-Agent') : null;

    const metadata = {};
    if (oldValues) metadata.oldValues = oldValues;
    if (newValues) metadata.newValues = newValues;

    await db.query(`
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      action,
      tableName,
      recordId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress,
      userAgent
    ]);

    logger.audit(userId, action, {
      table: tableName,
      recordId,
      metadata
    });
  } catch (error) {
    logger.error('Failed to log audit action:', {
      error: error.message,
      userId,
      action,
      tableName,
      recordId
    });
  }
};

const auditMiddleware = {
  logAction,

  create: (tableName) => async (req, res, next) => {
    const originalSend = res.send;

    res.send = function (data) {
      const result = originalSend.call(this, data);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(() => {
          const userId = req.user?.id;
          const recordId = res.locals.createdId || req.params.id;

          if (userId && recordId) {
            logAction(userId, 'CREATE', tableName, recordId, null, req.body, req)
              .catch(err => logger.error('Audit logging failed:', err));
          }
        });
      }

      return result;
    };

    next();
  }
};

// =============================================================================
// AUTH MIDDLEWARE
// =============================================================================

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const token = authHeader.substring(7);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
      throw jwtError;
    }

    const userResult = await db.query(
      'SELECT id, username, email, role, is_active, email_verified, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Email not verified',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed:', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        endpoint: req.originalUrl
      });

      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userResult = await db.query(
        'SELECT id, username, email, role, is_active, email_verified FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length > 0 && userResult.rows[0].is_active && userResult.rows[0].email_verified) {
        req.user = userResult.rows[0];
      } else {
        req.user = null;
      }
    } catch (jwtError) {
      req.user = null;
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    req.user = null;
    next();
  }
};

// =============================================================================
// UPLOAD MIDDLEWARE
// =============================================================================

const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads');
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: fileFilter
});

// =============================================================================
// ERROR HANDLER MIDDLEWARE
// =============================================================================

const errorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || error.status || 500;
  const cause = error.code || error.name || 'UnknownError';

  logger.error(`[${statusCode}] ${req.method} ${req.path}`, {
    cause,
    userId: req.user?.id,
    error: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
    code: cause,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Audit
  auditMiddleware,
  logAction,

  // Auth
  authenticate,
  authorize,
  optionalAuth,

  // Upload
  upload,

  // Error handling
  errorHandler,
  notFoundHandler
};