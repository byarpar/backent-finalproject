/**
 * Application Constants
 * Centralized configuration for all constant values used throughout the application
 */

module.exports = {
  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    GONE: 410,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  },

  // User Roles
  USER_ROLES: {
    ADMIN: 'admin',
    MODERATOR: 'moderator',
    CONTRIBUTOR: 'contributor',
    USER: 'user',
    GUEST: 'guest'
  },

  // Role Hierarchy (for permission checking)
  ROLE_HIERARCHY: {
    admin: 4,
    moderator: 3,
    contributor: 2,
    user: 1,
    guest: 0
  },

  // Parts of Speech
  PARTS_OF_SPEECH: [
    'noun',
    'verb',
    'adjective',
    'adverb',
    'pronoun',
    'preposition',
    'conjunction',
    'interjection',
    'article',
    'determiner'
  ],

  // Pagination Defaults
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
    MIN_LIMIT: 1
  },

  // Sorting Options
  SORT_ORDER: {
    ASC: 'ASC',
    DESC: 'DESC'
  },

  // File Upload Configuration
  FILE_UPLOAD: {
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    UPLOAD_PATHS: {
      PROFILES: 'uploads/profiles',
      WORDS: 'uploads/words',
      TEMP: 'uploads/temp'
    }
  },

  // Email Types
  EMAIL_TYPES: {
    VERIFICATION: 'verification',
    PASSWORD_RESET: 'password_reset',
    WELCOME: 'welcome',
    NOTIFICATION: 'notification'
  },

  // Verification Code Configuration
  VERIFICATION: {
    CODE_LENGTH: 6,
    CODE_EXPIRY: 15 * 60 * 1000, // 15 minutes in milliseconds
    MAX_ATTEMPTS: 5
  },

  // JWT Configuration
  JWT: {
    ACCESS_TOKEN_EXPIRY: '7d',
    REFRESH_TOKEN_EXPIRY: '30d',
    ALGORITHM: 'HS256'
  },

  // Password Requirements
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBER: true,
    REQUIRE_SPECIAL: true
  },

  // Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: {
      GLOBAL: 100,
      AUTH: 5,
      API: 60,
      UPLOAD: 10
    }
  },

  // Cache TTL (Time To Live)
  CACHE_TTL: {
    SHORT: 60, // 1 minute
    MEDIUM: 300, // 5 minutes
    LONG: 3600, // 1 hour
    VERY_LONG: 86400 // 24 hours
  },

  // Discussion & Chat
  DISCUSSION: {
    TITLE_MIN_LENGTH: 5,
    TITLE_MAX_LENGTH: 200,
    CONTENT_MIN_LENGTH: 10,
    CONTENT_MAX_LENGTH: 10000,
    MAX_TAGS: 5
  },

  CHAT: {
    MESSAGE_MAX_LENGTH: 5000,
    MAX_ATTACHMENTS: 5,
    CONVERSATION_LIMIT: 50
  },

  // Search Configuration
  SEARCH: {
    MIN_QUERY_LENGTH: 2,
    MAX_QUERY_LENGTH: 100,
    DEFAULT_RESULTS_LIMIT: 20,
    MAX_RESULTS_LIMIT: 100
  },

  // Notification Types
  NOTIFICATION_TYPES: {
    MENTION: 'mention',
    REPLY: 'reply',
    LIKE: 'like',
    FOLLOW: 'follow',
    WORD_APPROVED: 'word_approved',
    WORD_REJECTED: 'word_rejected',
    MESSAGE: 'message',
    SYSTEM: 'system'
  },

  // Audit Actions
  AUDIT_ACTIONS: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LOGIN: 'login',
    LOGOUT: 'logout',
    VERIFY: 'verify',
    APPROVE: 'approve',
    REJECT: 'reject',
    EXPORT: 'export',
    IMPORT: 'import'
  },

  // Error Types
  ERROR_TYPES: {
    VALIDATION_ERROR: 'ValidationError',
    AUTHENTICATION_ERROR: 'AuthenticationError',
    AUTHORIZATION_ERROR: 'AuthorizationError',
    NOT_FOUND_ERROR: 'NotFoundError',
    CONFLICT_ERROR: 'ConflictError',
    DATABASE_ERROR: 'DatabaseError',
    EXTERNAL_SERVICE_ERROR: 'ExternalServiceError',
    RATE_LIMIT_ERROR: 'RateLimitError'
  },

  // Database Query Timeouts
  DB_TIMEOUTS: {
    SHORT: 5000,    // 5 seconds
    MEDIUM: 15000,  // 15 seconds
    LONG: 30000     // 30 seconds
  },

  // Regular Expressions
  REGEX: {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    USERNAME: /^[a-zA-Z0-9_-]{3,30}$/,
    URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    PHONE: /^\+?[1-9]\d{1,14}$/,
    HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  },

  // Supported Languages
  LANGUAGES: {
    ENGLISH: 'en',
    LISU: 'lisu',
    CHINESE: 'zh',
    BURMESE: 'my',
    THAI: 'th'
  },

  // API Response Messages
  MESSAGES: {
    SUCCESS: {
      CREATED: 'Resource created successfully',
      UPDATED: 'Resource updated successfully',
      DELETED: 'Resource deleted successfully',
      RETRIEVED: 'Resource retrieved successfully'
    },
    ERROR: {
      INTERNAL: 'An internal server error occurred',
      NOT_FOUND: 'Resource not found',
      UNAUTHORIZED: 'Authentication required',
      FORBIDDEN: 'Access forbidden',
      VALIDATION: 'Validation failed',
      DUPLICATE: 'Resource already exists'
    }
  },

  // Socket Events
  SOCKET_EVENTS: {
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',
    MESSAGE: 'message',
    TYPING: 'typing',
    ONLINE: 'user_online',
    OFFLINE: 'user_offline',
    NOTIFICATION: 'notification',
    ERROR: 'error'
  }
};
