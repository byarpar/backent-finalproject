/**
 * Environment Configuration Validator
 * Validates and loads environment variables with proper type checking and defaults
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

/**
 * Get environment variable with type conversion and validation
 */
const getEnv = (key, defaultValue, type = 'string') => {
  const value = process.env[key];

  if (value === undefined || value === '') {
    if (defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return defaultValue;
  }

  switch (type) {
    case 'int':
      const intValue = parseInt(value, 10);
      if (isNaN(intValue)) {
        throw new Error(`Environment variable ${key} must be a valid integer`);
      }
      return intValue;

    case 'float':
      const floatValue = parseFloat(value);
      if (isNaN(floatValue)) {
        throw new Error(`Environment variable ${key} must be a valid number`);
      }
      return floatValue;

    case 'bool':
      return value.toLowerCase() === 'true' || value === '1';

    case 'array':
      return value.split(',').map(item => item.trim()).filter(Boolean);

    case 'json':
      try {
        return JSON.parse(value);
      } catch (error) {
        throw new Error(`Environment variable ${key} must be valid JSON`);
      }

    default:
      return value;
  }
};

/**
 * Validate required environment variables
 */
const validateRequiredVars = () => {
  const required = ['JWT_SECRET', 'SESSION_SECRET', 'DB_NAME', 'DB_USER'];

  const missing = required.filter(key => !process.env[key] || process.env[key] === '');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate JWT_SECRET length
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('Warning: JWT_SECRET should be at least 32 characters long for security');
  }

  // Validate SESSION_SECRET length
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    console.warn('Warning: SESSION_SECRET should be at least 32 characters long for security');
  }
};

/**
 * Application Configuration
 */
const config = {
  // Application
  app: {
    env: getEnv('NODE_ENV', 'development'),
    port: getEnv('PORT', 3001, 'int'),
    apiVersion: getEnv('API_VERSION', 'v1'),
    name: 'Lisu Dictionary API',
    version: require('../../package.json').version
  },

  // Frontend
  frontend: {
    url: getEnv('FRONTEND_URL', 'http://localhost:3000')
  },

  // Database
  database: {
    host: getEnv('DB_HOST', 'localhost'),
    port: getEnv('DB_PORT', 5432, 'int'),
    name: getEnv('DB_NAME'),
    user: getEnv('DB_USER'),
    password: getEnv('DB_PASSWORD', ''),

    pool: {
      min: getEnv('DB_POOL_MIN', 5, 'int'),
      max: getEnv('DB_POOL_MAX', 25, 'int'),
      idleTimeout: getEnv('DB_POOL_IDLE_TIMEOUT', 30000, 'int'),
      connectionTimeout: getEnv('DB_CONNECTION_TIMEOUT', 3000, 'int')
    },

    ssl: getEnv('NODE_ENV') === 'production'
  },

  // Authentication & Security
  auth: {
    jwtSecret: getEnv('JWT_SECRET'),
    jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '7d'),
    jwtRefreshExpiresIn: getEnv('JWT_REFRESH_EXPIRES_IN', '30d'),

    sessionSecret: getEnv('SESSION_SECRET'),
    sessionMaxAge: getEnv('SESSION_MAX_AGE', 86400000, 'int'),

    bcryptRounds: getEnv('BCRYPT_ROUNDS', 12, 'int'),

    google: {
      clientId: getEnv('GOOGLE_CLIENT_ID', ''),
      clientSecret: getEnv('GOOGLE_CLIENT_SECRET', ''),
      callbackUrl: getEnv('GOOGLE_CALLBACK_URL', 'http://localhost:3001/api/auth/google/callback')
    }
  },

  // Email
  email: {
    smtp: {
      host: getEnv('SMTP_HOST', 'smtp.gmail.com'),
      port: getEnv('SMTP_PORT', 587, 'int'),
      secure: getEnv('SMTP_SECURE', false, 'bool'),
      auth: {
        user: getEnv('SMTP_USER', ''),
        pass: getEnv('SMTP_PASSWORD', '')
      }
    },
    from: getEnv('EMAIL_FROM', 'noreply@lisudict.com'),
    fromName: getEnv('EMAIL_FROM_NAME', 'Lisu Dictionary')
  },

  // File Upload
  upload: {
    directory: getEnv('UPLOAD_DIR', 'uploads'),
    maxFileSize: getEnv('MAX_FILE_SIZE', 10485760, 'int'),
    allowedTypes: getEnv('ALLOWED_FILE_TYPES', 'image/jpeg,image/png,image/gif,image/webp', 'array')
  },

  // Rate Limiting
  rateLimit: {
    windowMs: getEnv('RATE_LIMIT_WINDOW_MS', 900000, 'int'),
    maxRequests: getEnv('RATE_LIMIT_MAX_REQUESTS', 100, 'int')
  },

  // Logging
  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
    filePath: getEnv('LOG_FILE_PATH', 'logs/app.log'),
    maxSize: getEnv('LOG_MAX_SIZE', '10m'),
    maxFiles: getEnv('LOG_MAX_FILES', 14, 'int')
  },

  // CORS
  cors: {
    origins: getEnv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001', 'array')
  },

  // Socket.IO
  socket: {
    pingTimeout: getEnv('SOCKET_PING_TIMEOUT', 60000, 'int'),
    pingInterval: getEnv('SOCKET_PING_INTERVAL', 25000, 'int')
  },

  // Cache (Redis - optional)
  cache: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: getEnv('REDIS_PORT', 6379, 'int'),
    password: getEnv('REDIS_PASSWORD', ''),
    ttl: getEnv('CACHE_TTL', 3600, 'int')
  },

  // Monitoring
  monitoring: {
    enableMetrics: getEnv('ENABLE_METRICS', true, 'bool'),
    slowQueryThreshold: getEnv('SLOW_QUERY_THRESHOLD', 1000, 'int')
  },

  // Feature Flags
  features: {
    emailVerification: getEnv('ENABLE_EMAIL_VERIFICATION', true, 'bool'),
    googleAuth: getEnv('ENABLE_GOOGLE_AUTH', true, 'bool'),
    chat: getEnv('ENABLE_CHAT', true, 'bool'),
    discussions: getEnv('ENABLE_DISCUSSIONS', true, 'bool')
  },

  // Helper Methods
  isDevelopment: () => getEnv('NODE_ENV', 'development') === 'development',
  isProduction: () => getEnv('NODE_ENV', 'development') === 'production',
  isTest: () => getEnv('NODE_ENV', 'development') === 'test'
};

// Validate configuration on load
try {
  validateRequiredVars();
} catch (error) {
  console.error('Configuration Error:', error.message);
  process.exit(1);
}

module.exports = config;
