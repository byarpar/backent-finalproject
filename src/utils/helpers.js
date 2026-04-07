/**
 * Professional Utility Helper Functions
 * Comprehensive collection of utility functions for common operations
 */

const logger = require('./logger');
const { constants: { PAGINATION } } = require('../config');
const { ValidationError } = require('./index');



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
 * Safe integer parsing with default fallback and validation
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
 * Safe float parsing with default fallback
 */
const safeParseFloat = (value, defaultValue = 0.0) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
};

/**
 * Enhanced pagination helper with comprehensive metadata
 * Returns both camelCase and snake_case for backward compatibility
 */
const paginate = (page = 1, limit = PAGINATION.DEFAULT_LIMIT, total = 0) => {
  const safePage = Math.max(1, safeParseInt(page, PAGINATION.DEFAULT_PAGE));
  const safeLimit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(PAGINATION.MIN_LIMIT, safeParseInt(limit, PAGINATION.DEFAULT_LIMIT))
  );
  const offset = (safePage - 1) * safeLimit;
  const totalPages = Math.ceil(total / safeLimit) || 1;

  return {
    page: safePage,
    limit: safeLimit,
    offset,
    total,
    totalPages,
    total_pages: totalPages, // Legacy support
    hasNext: safePage < totalPages,
    has_next: safePage < totalPages, // Legacy support
    hasPrev: safePage > 1,
    has_prev: safePage > 1, // Legacy support
    nextPage: safePage < totalPages ? safePage + 1 : null,
    prevPage: safePage > 1 ? safePage - 1 : null
  };
};

/**
 * UUID validation helper (v4 format)
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

/**
 * Email validation
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return REGEX.EMAIL.test(email.trim());
};

/**
 * URL validation
 */
const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  return REGEX.URL.test(url.trim());
};

/**
 * Username validation
 */
const isValidUsername = (username) => {
  if (!username || typeof username !== 'string') return false;
  return REGEX.USERNAME.test(username.trim());
};

/**
 * Sanitize string input (remove dangerous characters)
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/\0/g, ''); // Remove null bytes
};

/**
 * Sanitize object by removing undefined/null values
 */
const sanitizeObject = (obj) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Deep clone an object
 */
const deepClone = (obj) => {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    logger.error('Deep clone failed', { error: error.message });
    return obj;
  }
};

/**
 * Generate random string (for tokens, codes, etc.)
 */
const generateRandomString = (length = 32, charset = 'alphanumeric') => {
  const charsets = {
    numeric: '0123456789',
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    hex: '0123456789abcdef'
  };

  const chars = charsets[charset] || charsets.alphanumeric;
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Generate verification code (numeric)
 */
const generateVerificationCode = (length = 6) => {
  return generateRandomString(length, 'numeric');
};

/**
 * Sleep/delay function
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Async error wrapper for route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Mask sensitive data (email, phone, etc.)
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return '';
  const [username, domain] = email.split('@');
  if (!domain) return email;

  const maskedUsername = username.length > 2
    ? username[0] + '*'.repeat(username.length - 2) + username[username.length - 1]
    : '*'.repeat(username.length);

  return `${maskedUsername}@${domain}`;
};

/**
 * Truncate string with ellipsis
 */
const truncate = (str, maxLength = 100, suffix = '...') => {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
};

/**
 * Convert string to slug (URL-friendly)
 */
const slugify = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Format file size in human-readable format
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Calculate time ago from timestamp
 */
const timeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1
  };

  for (const [name, secondsInInterval] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInInterval);
    if (interval >= 1) {
      return interval === 1 ? `1 ${name} ago` : `${interval} ${name}s ago`;
    }
  }

  return 'just now';
};

/**
 * Retry function with exponential backoff
 */
const retry = async (fn, maxAttempts = 3, delay = 1000, backoffMultiplier = 2) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      const waitTime = delay * Math.pow(backoffMultiplier, attempt - 1);
      logger.warn(`Retry attempt ${attempt} failed, retrying in ${waitTime}ms...`);
      await sleep(waitTime);
    }
  }
};

module.exports = {


  // Validation
  validateInput,
  isValidUUID,
  isValidId,
  isValidEmail,
  isValidUrl,
  isValidUsername,

  // Parsing
  safeParseInt,
  safeParseFloat,

  // Pagination
  paginate,

  // String utilities
  sanitizeString,
  sanitizeObject,
  maskEmail,
  truncate,
  slugify,

  // Generation
  generateRandomString,
  generateVerificationCode,

  // Object utilities
  deepClone,

  // Async utilities
  asyncHandler,
  sleep,
  retry,

  // Formatting
  formatFileSize,
  timeAgo
};
