const winston = require('winston');
const path = require('path');

/**
 * Enhanced Logger with Structured Error Logging
 * Provides detailed error logging similar to: 
 * 2025-08-19 14:32:47 ERROR [500] GET https://api.example.com/orders/123456 - user=45721 - cause=DBTimeout
 */

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, method, url, statusCode, userId, cause, stack, ...meta }) => {
    // Base log format
    let logMessage = `${timestamp} ${level.toUpperCase()}`;

    // Add status code if available
    if (statusCode) {
      logMessage += ` [${statusCode}]`;
    }

    // Add HTTP method and URL if available
    if (method && url) {
      logMessage += ` ${method} ${url}`;
    }

    // Add user ID if available
    if (userId) {
      logMessage += ` - user=${userId}`;
    }

    // Add cause/error type if available
    if (cause) {
      logMessage += ` - cause=${cause}`;
    }

    // Add the main message
    logMessage += ` - ${message}`;

    // Add stack trace for errors
    if (stack) {
      logMessage += `\n${stack}`;
    }

    // Add any additional metadata
    if (Object.keys(meta).length > 0) {
      logMessage += ` - meta=${JSON.stringify(meta)}`;
    }

    return logMessage;
  })
);

// Simple format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} ${level}: ${message}`;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: 'english-lisu-dictionary',
    version: '1.0.0'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? structuredFormat : consoleFormat,
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      format: structuredFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10
    }),

    // Separate file for errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: structuredFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10
    }),

    // Daily rotating file for info logs
    new winston.transports.File({
      filename: path.join(logsDir, 'info.log'),
      level: 'info',
      format: structuredFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10
    })
  ],

  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: structuredFormat
    })
  ],

  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: structuredFormat
    })
  ]
});

/**
 * Enhanced logging methods with structured error support
 */

// Standard logging methods
const log = {
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  info: (message, meta = {}) => logger.info(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),

  // Structured API error logging
  apiError: (req, res, error, cause = null) => {
    const statusCode = res.statusCode || 500;
    const userId = req.user ? req.user.id : req.headers['user-id'] || 'anonymous';
    const url = req.originalUrl || req.url;
    const method = req.method;

    logger.error(error.message || 'API Error', {
      method,
      url,
      statusCode,
      userId,
      cause: cause || error.name || 'UnknownError',
      stack: error.stack,
      headers: req.headers,
      body: req.body,
      query: req.query,
      params: req.params
    });
  },

  // Database error logging
  dbError: (operation, error, context = {}) => {
    logger.error(`Database operation failed: ${operation}`, {
      cause: 'DBError',
      operation,
      errorCode: error.code,
      errorMessage: error.message,
      stack: error.stack,
      ...context
    });
  },

  // Authentication error logging
  authError: (req, error, cause = 'AuthError') => {
    const userId = req.user ? req.user.id : 'unauthenticated';
    const ip = req.ip || req.connection.remoteAddress;

    logger.error('Authentication failed', {
      method: req.method,
      url: req.originalUrl || req.url,
      userId,
      cause,
      ip,
      userAgent: req.headers['user-agent'],
      errorMessage: error.message,
      stack: error.stack
    });
  },

  // Validation error logging
  validationError: (req, errors, field = null) => {
    const userId = req.user ? req.user.id : 'anonymous';

    logger.warn('Validation failed', {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: 400,
      userId,
      cause: 'ValidationError',
      field,
      errors: Array.isArray(errors) ? errors : [errors],
      body: req.body
    });
  },

  // Request logging middleware
  requestLogger: (req, res, next) => {
    const start = Date.now();
    const userId = req.user ? req.user.id : 'anonymous';

    // Log the request
    logger.info('Request received', {
      method: req.method,
      url: req.originalUrl || req.url,
      userId,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    // Log the response when it finishes
    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;

      if (statusCode >= 400) {
        logger.warn('Request completed with error', {
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode,
          userId,
          duration: `${duration}ms`,
          cause: statusCode >= 500 ? 'ServerError' : 'ClientError'
        });
      } else {
        logger.info('Request completed successfully', {
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode,
          userId,
          duration: `${duration}ms`
        });
      }
    });

    next();
  },

  // Performance logging
  performance: (operation, duration, context = {}) => {
    const level = duration > 1000 ? 'warn' : 'info';
    logger.log(level, `Performance: ${operation} took ${duration}ms`, {
      operation,
      duration: `${duration}ms`,
      cause: duration > 1000 ? 'SlowOperation' : null,
      ...context
    });
  },

  // Security event logging
  security: (event, req, details = {}) => {
    const userId = req.user ? req.user.id : 'anonymous';
    const ip = req.ip || req.connection.remoteAddress;

    logger.warn(`Security event: ${event}`, {
      event,
      userId,
      ip,
      userAgent: req.headers['user-agent'],
      url: req.originalUrl || req.url,
      cause: 'SecurityEvent',
      ...details
    });
  },

  // Audit logging for admin actions
  audit: (userId, action, context = {}) => {
    logger.info(`Audit: ${action}`, {
      userId,
      action,
      category: 'audit',
      ...context
    });
  }
};

// Add raw winston logger methods for compatibility
Object.assign(log, {
  log: logger.log.bind(logger),
  query: logger.query.bind(logger),
  stream: logger.stream.bind(logger),
  add: logger.add.bind(logger),
  remove: logger.remove.bind(logger),
  clear: logger.clear.bind(logger),
  profile: logger.profile.bind(logger),
  startTimer: logger.startTimer.bind(logger)
});

module.exports = log;
