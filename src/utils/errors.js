/**
 * Custom Error Classes
 * Professional error handling with detailed error types and proper status codes
 */

const { HTTP_STATUS, ERROR_TYPES } = require('../config/constants');

/**
 * Base Application Error
 */
class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errorType = ERROR_TYPES.INTERNAL_ERROR, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.details = details;
    this.data = details; // Also store as data for consistency
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        type: this.errorType,
        message: this.message,
        statusCode: this.statusCode,
        details: this.details,
        data: this.data,
        timestamp: this.timestamp,
        ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
      }
    };
  }
}

/**
 * Validation Error (400)
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = {}) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_TYPES.VALIDATION_ERROR, details);
  }
}

/**
 * Authentication Error (401)
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details = {}) {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_TYPES.AUTHENTICATION_ERROR, details);
  }
}

/**
 * Authorization Error (403)
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access forbidden', details = {}) {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_TYPES.AUTHORIZATION_ERROR, details);
  }
}

/**
 * Not Found Error (404)
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource', details = {}) {
    super(`${resource} not found`, HTTP_STATUS.NOT_FOUND, ERROR_TYPES.NOT_FOUND_ERROR, details);
  }
}

/**
 * Conflict Error (409)
 */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details = {}) {
    super(message, HTTP_STATUS.CONFLICT, ERROR_TYPES.CONFLICT_ERROR, details);
  }
}

/**
 * Database Error (500)
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details = {}) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_TYPES.DATABASE_ERROR, details);
  }
}

/**
 * External Service Error (503)
 */
class ExternalServiceError extends AppError {
  constructor(service = 'External service', message = 'Service unavailable', details = {}) {
    super(`${service}: ${message}`, HTTP_STATUS.SERVICE_UNAVAILABLE, ERROR_TYPES.EXTERNAL_SERVICE_ERROR, details);
  }
}

/**
 * Rate Limit Error (429)
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details = {}) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_TYPES.RATE_LIMIT_ERROR, details);
  }
}

/**
 * Bad Request Error (400)
 */
class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = {}) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_TYPES.VALIDATION_ERROR, details);
  }
}

/**
 * Unprocessable Entity Error (422)
 */
class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable entity', details = {}) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_TYPES.VALIDATION_ERROR, details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  RateLimitError,
  BadRequestError,
  UnprocessableEntityError
};
