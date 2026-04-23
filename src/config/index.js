/**
 * Consolidated Configuration
 * Combined smaller configuration modules into a single file
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,

  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT, 10) || 5432,
  DB_NAME: process.env.DB_NAME || 'lisu_dict',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || '',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '24h',

  // OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

  // Email
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@lisudict.com',
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,

  // URLs
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:5000',

  // File uploads
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024, // 5MB
  UPLOAD_PATH: process.env.UPLOAD_PATH || path.join(__dirname, '../../uploads')
};

// Backward-compatible nested config expected by repository/service code.
env.auth = {
  bcryptRounds: env.BCRYPT_ROUNDS
};

// Validate required environment variables
const requiredVars = ['JWT_SECRET'];
const missingVars = requiredVars.filter(varName => !env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// =============================================================================
// APPLICATION CONSTANTS
// =============================================================================

const constants = {
  // User roles
  USER_ROLES: {
    USER: 'user',
    MODERATOR: 'moderator',
    ADMIN: 'admin'
  },

  // Discussion categories (must match DB CHECK constraint)
  DISCUSSION_CATEGORIES: {
    GENERAL: 'general',
    JAVASCRIPT: 'javascript',
    PYTHON: 'python',
    JAVA: 'java',
    CPP: 'cpp',
    CSHARP: 'csharp',
    PHP: 'php',
    GO: 'go',
    RUST: 'rust',
    OTHER: 'other'
  },

  // Vote types
  VOTE_TYPES: {
    UP: 'up',
    DOWN: 'down'
  },

  // Audit actions
  AUDIT_ACTIONS: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    REGISTER: 'REGISTER'
  },

  // Pagination defaults
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
  },

  // Content limits
  CONTENT_LIMITS: {
    DISCUSSION_TITLE_MIN: 5,
    DISCUSSION_TITLE_MAX: 200,
    DISCUSSION_CONTENT_MIN: 10,
    DISCUSSION_CONTENT_MAX: 10000,
    ANSWER_CONTENT_MIN: 5,
    ANSWER_CONTENT_MAX: 5000,
    USERNAME_MIN: 3,
    USERNAME_MAX: 30,
    PASSWORD_MIN: 8,
    PASSWORD_MAX: 128
  },

  // File upload constants
  UPLOAD: {
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
    MAX_IMAGES_PER_POST: 5
  },

  // Rate limiting
  RATE_LIMITS: {
    GENERAL: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // requests per window
    },
    AUTH: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10 // requests per window
    },
    UPLOAD: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 20 // requests per window
    }
  },

  // Cache TTL (in seconds)
  CACHE_TTL: {
    USER_PROFILE: 300, // 5 minutes
    DISCUSSIONS: 60, // 1 minute
    SEARCH_RESULTS: 180, // 3 minutes
    CATEGORIES: 3600 // 1 hour
  },

  // Email templates
  EMAIL_TEMPLATES: {
    WELCOME: 'welcome',
    VERIFICATION: 'verification',
    PASSWORD_RESET: 'password-reset',
    MENTION_NOTIFICATION: 'mention-notification'
  },

  // Notification types
  NOTIFICATION_TYPES: {
    MENTION: 'mention',
    REPLY: 'reply',
    VOTE: 'vote',
    FOLLOW: 'follow',
    SYSTEM: 'system'
  },

  // Status codes
  STATUS_CODES: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    VALIDATION_ERROR: 422,
    RATE_LIMIT_EXCEEDED: 429,
    INTERNAL_SERVER_ERROR: 500
  }
};

// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================

const dbConfig = {
  development: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  },

  production: {
    connectionString: env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  },

  test: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: `${env.DB_NAME}_test`,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  }
};

// =============================================================================
// CORS CONFIGURATION
// =============================================================================

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      env.CLIENT_URL,
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];

    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// =============================================================================
// FEATURE FLAGS
// =============================================================================

const features = {
  emailVerification: process.env.ENABLE_EMAIL_VERIFICATION === 'true',
  googleAuth: process.env.ENABLE_GOOGLE_AUTH === 'true',
  chat: process.env.ENABLE_CHAT === 'true',
  discussions: process.env.ENABLE_DISCUSSIONS === 'true',
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  env,
  constants,
  features,
  dbConfig: dbConfig[env.NODE_ENV] || dbConfig.development,
  corsOptions,
};