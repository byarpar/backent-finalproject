const logger = require('./logger');

/**
 * Response formatter with consistent structure and metadata
 */
const formatResponse = (success, data, message = null, meta = {}) => {
  const response = {
    success,
    timestamp: new Date().toISOString(),
    ...meta
  };

  if (message) response.message = message;
  if (data !== undefined) response.data = data;

  return response;
};

/**
 * Error formatter with detailed error information
 */
const formatError = (message, details = null, code = null) => {
  const error = {
    success: false,
    error: {
      message,
      timestamp: new Date().toISOString()
    }
  };

  if (details) error.error.details = details;
  if (code) error.error.code = code;

  return error;
};

/**
 * Advanced input validation with multiple rule types
 */
const validateInput = (rules) => {
  const errors = [];

  for (const [field, rule] of Object.entries(rules)) {
    const { value, required, type, minLength, maxLength, min, max, enum: enumValues, pattern } = rule;

    // Check if field is required
    if (required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    // Skip validation if field is not required and empty
    if (!required && (value === undefined || value === null || value === '')) {
      continue;
    }

    // Type validation
    if (type && typeof value !== type) {
      errors.push(`${field} must be of type ${type}`);
      continue;
    }

    // String validations
    if (type === 'string') {
      if (minLength && value.length < minLength) {
        errors.push(`${field} must be at least ${minLength} characters long`);
      }
      if (maxLength && value.length > maxLength) {
        errors.push(`${field} must be no more than ${maxLength} characters long`);
      }
      if (pattern && !pattern.test(value)) {
        errors.push(`${field} format is invalid`);
      }
    }

    // Number validations
    if (type === 'number') {
      if (min !== undefined && value < min) {
        errors.push(`${field} must be at least ${min}`);
      }
      if (max !== undefined && value > max) {
        errors.push(`${field} must be no more than ${max}`);
      }
    }

    // Enum validation
    if (enumValues && !enumValues.includes(value)) {
      errors.push(`${field} must be one of: ${enumValues.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Safe integer parsing with default fallback
 */
const safeParseInt = (value, defaultValue = 0) => {
  if (typeof value === 'number') return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
};

/**
 * Pagination helper for consistent pagination across the API
 */
const paginate = (page = 1, limit = 20, total = 0) => {
  const safePage = Math.max(1, safeParseInt(page, 1));
  const safeLimit = Math.min(100, Math.max(1, safeParseInt(limit, 20)));
  const offset = (safePage - 1) * safeLimit;
  const totalPages = Math.ceil(total / safeLimit);

  return {
    page: safePage,
    limit: safeLimit,
    offset,
    total,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1
  };
};

/**
 * UUID validation helper
 */
const isValidUUID = (value) => {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

/**
 * Flexible ID validation that works with both INTEGER and UUID formats
 */
const isValidId = (value) => {
  if (!value) return false;
  
  // Check if it's a valid integer
  const intValue = parseInt(value, 10);
  if (!isNaN(intValue) && intValue > 0 && intValue.toString() === value.toString()) {
    return true;
  }
  
  // If it's not a valid integer, check if it's a valid UUID
  if (typeof value === 'string') {
    return isValidUUID(value);
  }
  
  return false;
};

module.exports = {
  formatResponse,
  formatError,
  validateInput,
  safeParseInt,
  isValidUUID,
  isValidId,
  paginate
};
