const jwt = require('jsonwebtoken');
const { db } = require('../config/database');
const logger = require('../utils/logger');
const { formatError } = require('../utils/helpers');

/**
 * High-performance middleware collection with advanced security features
 * Features: JWT authentication, role-based access, request validation, audit logging
 */

/**
 * Enhanced JWT authentication middleware
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json(formatError('Access token required', 'No token provided'));
    }

    // TODO: Implement token blacklisting when needed
    // const isBlacklisted = await checkTokenBlacklist(token);
    // if (isBlacklisted) {
    //   return res.status(401).json(formatError('Token is invalid', 'Token has been revoked'));
    // }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get fresh user data with role information
    const userResult = await db.query(`
      SELECT u.id, u.email, u.role, u.is_active
      FROM users u 
      WHERE u.id = $1 AND u.is_active = true
    `, [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(401).json(formatError('User not found or inactive', 'Invalid token'));
    }

    const user = userResult.rows[0];

    // TODO: Update last activity when last_login column is added
    // await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    req.user = user;
    req.token = token;

    // Log successful authentication for audit
    logger.info('User authenticated:', {
      userId: user.id,
      email: user.email,
      role: user.role,
      endpoint: req.originalUrl,
      ip: req.ip
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed:', {
      error: error.message,
      token: req.headers.authorization?.substring(0, 20) + '...',
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json(formatError('Token expired', 'Please log in again'));
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json(formatError('Invalid token', 'Token is malformed'));
    }

    return res.status(401).json(formatError('Authentication failed', error.message));
  }
};

/**
 * Role-based authorization middleware
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(formatError('Authentication required', 'No user information'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Access denied - insufficient permissions:', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        endpoint: req.originalUrl
      });

      return res.status(403).json(formatError(
        'Access denied',
        `Required role: ${allowedRoles.join(' or ')}`
      ));
    }

    next();
  };
};

/**
 * Optional authentication middleware - doesn't block if no token
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without authentication
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get fresh user data with role information (same as authenticateToken)
    const userResult = await db.query(`
      SELECT u.id, u.email, u.role, u.is_active
      FROM users u 
      WHERE u.id = $1 AND u.is_active = true
    `, [decoded.userId]);

    if (userResult.rows.length > 0) {
      req.user = userResult.rows[0];
    }
  } catch (error) {
    // Log but don't block the request
    logger.warn('Invalid token in optional auth:', error.message);
  }

  next();
};

/**
 * Convenience middleware for admin role requirement
 */
const requireAdmin = requireRole('admin');

/**
 * Audit logging middleware
 */
const auditLog = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.info('Request received:', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function (body) {
    const responseTime = Date.now() - startTime;

    logger.info('Response sent:', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userId: req.user?.id,
      success: body?.success
    });

    return originalJson.call(this, body);
  };

  next();
};

module.exports = {
  authenticate: authenticateToken,
  authenticateToken,
  authorize: requireRole,
  requireRole,
  requireMinRole: requireRole, // Alias for backward compatibility
  optionalAuth,
  optionalAuthenticate: optionalAuth, // Alias for backward compatibility
  requireAdmin,
  auditLog
};
