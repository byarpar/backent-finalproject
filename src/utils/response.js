/**
 * API Response Formatter
 * Standardized response format for all API endpoints
 */

const { HTTP_STATUS, MESSAGES } = require('../config/constants');

/**
 * Success Response Format
 */
class SuccessResponse {
  constructor(data = null, message = MESSAGES.SUCCESS.RETRIEVED, metadata = {}) {
    this.success = true;
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();

    if (Object.keys(metadata).length > 0) {
      this.metadata = metadata;
    }
  }

  static create(data = null, message = MESSAGES.SUCCESS.RETRIEVED, metadata = {}) {
    return new SuccessResponse(data, message, metadata);
  }

  static created(data = null, message = MESSAGES.SUCCESS.CREATED) {
    return new SuccessResponse(data, message);
  }

  static updated(data = null, message = MESSAGES.SUCCESS.UPDATED) {
    return new SuccessResponse(data, message);
  }

  static deleted(message = MESSAGES.SUCCESS.DELETED) {
    return new SuccessResponse(null, message);
  }

  static paginated(data, pagination, message = MESSAGES.SUCCESS.RETRIEVED) {
    return new SuccessResponse(data, message, { pagination });
  }
}

/**
 * Error Response Format
 */
class ErrorResponse {
  constructor(error, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    this.success = false;
    this.error = {
      message: error.message || MESSAGES.ERROR.INTERNAL,
      type: error.errorType || error.name || 'Error',
      ...(error.details && { details: error.details }),
      ...(error.code && { code: error.code })
    };
    this.timestamp = new Date().toISOString();
    this.statusCode = statusCode;

    // Include stack trace in development
    if (process.env.NODE_ENV === 'development' && error.stack) {
      this.error.stack = error.stack;
    }
  }

  static create(error, statusCode) {
    return new ErrorResponse(error, statusCode);
  }
}

/**
 * Send success response
 */
const sendSuccess = (res, statusCode = HTTP_STATUS.OK, data = null, message = MESSAGES.SUCCESS.RETRIEVED, metadata = {}) => {
  const response = new SuccessResponse(data, message, metadata);
  return res.status(statusCode).json(response);
};

/**
 * Send error response
 */
const sendError = (res, error, statusCode = null) => {
  const code = statusCode || error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const response = new ErrorResponse(error, code);
  return res.status(code).json(response);
};

/**
 * Send created response (201)
 */
const sendCreated = (res, data, message = MESSAGES.SUCCESS.CREATED) => {
  return sendSuccess(res, HTTP_STATUS.CREATED, data, message);
};

/**
 * Send updated response (200)
 */
const sendUpdated = (res, data, message = MESSAGES.SUCCESS.UPDATED) => {
  return sendSuccess(res, HTTP_STATUS.OK, data, message);
};

/**
 * Send deleted response (200)
 */
const sendDeleted = (res, message = MESSAGES.SUCCESS.DELETED) => {
  return sendSuccess(res, HTTP_STATUS.OK, null, message);
};

/**
 * Send no content response (204)
 */
const sendNoContent = (res) => {
  return res.status(HTTP_STATUS.NO_CONTENT).send();
};

/**
 * Send paginated response
 */
const sendPaginated = (res, data, pagination, message = MESSAGES.SUCCESS.RETRIEVED) => {
  return sendSuccess(res, HTTP_STATUS.OK, data, message, { pagination });
};

/**
 * Legacy formatResponse (for backward compatibility)
 */
const formatResponse = (success, data, message = '') => {
  if (success) {
    return new SuccessResponse(data, message);
  } else {
    return new ErrorResponse({ message: data || message });
  }
};

/**
 * Legacy formatError (for backward compatibility)
 */
const formatError = (message, details = null) => {
  return new ErrorResponse({
    message,
    details: typeof details === 'string' ? { info: details } : details
  });
};

module.exports = {
  SuccessResponse,
  ErrorResponse,
  sendSuccess,
  sendError,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendNoContent,
  sendPaginated,
  formatResponse,
  formatError
};
