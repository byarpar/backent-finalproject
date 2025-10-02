const logger = require('../utils/logger');

/**
 * Enhanced Error Handler Middleware with Structured Logging
 * Provides detailed error logging in the format:
 * 2025-08-19 14:32:47 ERROR [500] GET /api/orders/123456 - user=45721 - cause=DBTimeout
 */

// Database error mapping
const DB_ERROR_CAUSES = {
  '23505': 'DuplicateKey',
  '23503': 'ForeignKeyViolation',
  '23502': 'NotNullViolation',
  '23514': 'CheckViolation',
  '42P01': 'UndefinedTable',
  '42703': 'UndefinedColumn',
  '57014': 'QueryCanceled',
  '53300': 'TooManyConnections',
  '08006': 'ConnectionFailure',
  '08001': 'UnableToConnect',
  'ECONNREFUSED': 'DBConnectionRefused',
  'ENOTFOUND': 'DBHostNotFound',
  'ETIMEDOUT': 'DBTimeout'
};

// HTTP error mapping
const HTTP_ERROR_CAUSES = {
  400: 'BadRequest',
  401: 'Unauthorized', 
  403: 'Forbidden',
  404: 'NotFound',
  405: 'MethodNotAllowed',
  409: 'Conflict',
  422: 'ValidationError',
  429: 'RateLimitExceeded',
  500: 'InternalServerError',
  501: 'NotImplemented',
  502: 'BadGateway',
  503: 'ServiceUnavailable',
  504: 'GatewayTimeout'
};

/**
 * Determine error cause based on error type and code
 */
function determineErrorCause(error) {
  // Database errors
  if (error.code && DB_ERROR_CAUSES[error.code]) {
    return DB_ERROR_CAUSES[error.code];
  }
  
  // HTTP errors
  if (error.statusCode && HTTP_ERROR_CAUSES[error.statusCode]) {
    return HTTP_ERROR_CAUSES[error.statusCode];
  }
  
  // Known error types
  if (error.name) {
    switch (error.name) {
      case 'ValidationError': return 'ValidationError';
      case 'CastError': return 'InvalidDataType';
      case 'JsonWebTokenError': return 'InvalidToken';
      case 'TokenExpiredError': return 'TokenExpired';
      case 'SyntaxError': return 'InvalidJSON';
      case 'TypeError': return 'TypeError';
      case 'ReferenceError': return 'ReferenceError';
      default: return error.name;
    }
  }
  
  // Network/Connection errors
  if (error.message) {
    if (error.message.includes('timeout')) return 'Timeout';
    if (error.message.includes('connection')) return 'ConnectionError';
    if (error.message.includes('network')) return 'NetworkError';
    if (error.message.includes('permission')) return 'PermissionDenied';
  }
  
  return 'UnknownError';
}

/**
 * Enhanced error handler middleware
 */
const errorHandler = (error, req, res, next) => {
  // Default to 500 server error
  let statusCode = error.statusCode || error.status || 500;
  let message = error.message || 'Internal Server Error';
  
  // Determine the cause
  const cause = determineErrorCause(error);
  
  // Handle specific error types
  switch (error.name) {
    case 'ValidationError':
      statusCode = 400;
      message = 'Validation failed';
      break;
      
    case 'CastError':
      statusCode = 400;
      message = 'Invalid data format';
      break;
      
    case 'JsonWebTokenError':
      statusCode = 401;
      message = 'Invalid authentication token';
      break;
      
    case 'TokenExpiredError':
      statusCode = 401;
      message = 'Authentication token expired';
      break;
      
    case 'SyntaxError':
      if (error.message.includes('JSON')) {
        statusCode = 400;
        message = 'Invalid JSON format';
      }
      break;
  }
  
  // Set response status
  res.status(statusCode);
  
  // Log the error with structured format
  if (statusCode >= 500) {
    // Server errors - log as ERROR
    logger.apiError(req, res, error, cause);
  } else if (statusCode >= 400) {
    // Client errors - log as WARN
    logger.warn('Client error occurred', {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      userId: req.user ? req.user.id : 'anonymous',
      cause,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
  
  // Prepare error response
  const errorResponse = {
    success: false,
    error: {
      message,
      statusCode,
      cause,
      timestamp: new Date().toISOString()
    }
  };
  
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = error.stack;
    errorResponse.error.details = error.details || null;
  }
  
  // Add request ID if available
  if (req.requestId) {
    errorResponse.error.requestId = req.requestId;
  }
  
  // Send error response
  res.json(errorResponse);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  error.name = 'NotFoundError';
  
  // Log 404 errors
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: 404,
    userId: req.user ? req.user.id : 'anonymous',
    cause: 'NotFound',
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent']
  });
  
  next(error);
};

/**
 * Async error wrapper for route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Custom error classes
 */
class APIError extends Error {
  constructor(message, statusCode = 500, cause = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.cause = cause;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.field = field;
    Error.captureStackTrace(this, this.constructor);
  }
}

class DatabaseError extends Error {
  constructor(message, operation = null) {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = 500;
    this.operation = operation;
    Error.captureStackTrace(this, this.constructor);
  }
}

class AuthenticationError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
    Error.captureStackTrace(this, this.constructor);
  }
}

class AuthorizationError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  APIError,
  ValidationError,
  DatabaseError,
  AuthenticationError,
  AuthorizationError
};
