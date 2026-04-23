/**
 * Consolidated Utilities
 * Combined smaller utility modules into a single file
 */

const mentionUtils = require('./mentionUtils');

// =============================================================================
// ERROR UTILITIES
// =============================================================================

class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden access') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details = null) {
    super(message, 429, 'RATE_LIMIT_ERROR', details);
  }
}

// =============================================================================
// RESPONSE UTILITIES
// =============================================================================

const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString()
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

const errorResponse = (res, error, statusCode = 500) => {
  const response = {
    success: false,
    message: error.message || 'Internal server error',
    timestamp: new Date().toISOString()
  };

  if (error.code) {
    response.code = error.code;
  }

  if (error.details) {
    response.details = error.details;
  }

  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.stack = error.stack;
  }

  return res.status(statusCode).json(response);
};

const paginatedResponse = (res, data, pagination, message = 'Success') => {
  return res.json({
    success: true,
    message,
    data,
    pagination,
    timestamp: new Date().toISOString()
  });
};

// Helper function for legacy sendSuccess calls
const sendSuccess = (res, statusCode, data, message) => {
  return successResponse(res, data, message, statusCode);
};

// Helper function for legacy sendCreated calls
const sendCreated = (res, data, message) => {
  return successResponse(res, data, message, 201);
};

// Helper function for legacy sendError calls
const sendError = (res, error, statusCode) => {
  return errorResponse(res, error, statusCode);
};

// =============================================================================
// MENTION UTILITIES
// =============================================================================

const extractMentions = (content) => {
  if (!content) return [];

  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push({
      username: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }

  return mentions;
};

const processMentions = async (content, db) => {
  const mentions = extractMentions(content);
  if (mentions.length === 0) return [];

  try {
    const usernames = mentions.map(m => m.username);
    const placeholders = usernames.map((_, i) => `$${i + 1}`).join(',');

    const result = await db.query(
      `SELECT id, username FROM users WHERE username = ANY(ARRAY[${placeholders}]) AND is_active = true`,
      usernames
    );

    const userMap = new Map(result.rows.map(user => [user.username, user.id]));

    return mentions
      .filter(mention => userMap.has(mention.username))
      .map(mention => ({
        ...mention,
        userId: userMap.get(mention.username)
      }));
  } catch (error) {
    console.error('Error processing mentions:', error);
    return [];
  }
};

const getMentionStats = async (userId, db) => {
  try {
    const [received, given] = await Promise.all([
      db.query(
        'SELECT COUNT(*) as count FROM mentions WHERE mentioned_user_id = $1',
        [userId]
      ),
      db.query(`
        SELECT COUNT(*) as count 
        FROM mentions m
        JOIN discussions d ON m.discussion_id = d.id 
        WHERE d.user_id = $1
      `, [userId])
    ]);

    return {
      mentionsReceived: parseInt(received.rows[0]?.count || 0),
      mentionsGiven: parseInt(given.rows[0]?.count || 0)
    };
  } catch (error) {
    console.error('Error getting mention stats:', error);
    return { mentionsReceived: 0, mentionsGiven: 0 };
  }
};

// =============================================================================
// HELPER UTILITIES
// =============================================================================

const generateSlug = (text, maxLength = 50) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, maxLength)
    .replace(/^-|-$/g, '');
};

const sanitizeHtml = (html) => {
  if (!html) return '';

  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return {
    isValid: password && password.length >= 8,
    requirements: {
      minLength: password && password.length >= 8,
      hasLowercase: /[a-z]/.test(password),
      hasUppercase: /[A-Z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    }
  };
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const throttle = (func, limit) => {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DatabaseError,
  AuthenticationError,
  RateLimitError,

  // Response utilities
  successResponse,
  errorResponse,
  paginatedResponse,
  sendSuccess,
  sendCreated,
  sendError,

  // Mention utilities
  extractMentions,
  processMentions,
  getMentionStats,
  normalizeMentions: mentionUtils.normalizeMentions,
  getMentionContext: mentionUtils.getMentionContext,
  replaceMentionsWithLinks: mentionUtils.replaceMentionsWithLinks,

  // Helper utilities
  generateSlug,
  sanitizeHtml,
  validateEmail,
  validatePassword,
  formatFileSize,
  debounce,
  throttle,
  deepClone,
  asyncHandler
};