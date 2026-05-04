/**
 * Comprehensive Validation Schemas with Joi
 * Professional input validation for all API endpoints
 */

const Joi = require('joi');
// Add parts of speech array since it's missing from config
const PARTS_OF_SPEECH = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
  'conjunction', 'interjection', 'determiner', 'article'
];

const { constants: { USER_ROLES, CONTENT_LIMITS, PAGINATION, DISCUSSION_CATEGORIES } } = require('../config');
const { ValidationError } = require('../utils');

/**
 * Validation middleware factory
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    // Check if schema is defined
    if (!schema) {
      throw new Error(`Validation schema is undefined for source: ${source}`);
    }

    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, ''),
        type: detail.type
      }));

      throw new ValidationError('Validation failed', { errors: details });
    }

    // Replace request data with validated and sanitized values
    req[source] = value;
    next();
  };
};

// ============================================
// Common/Reusable Schemas
// ============================================

const commonSchemas = {
  id: Joi.alternatives().try(
    Joi.number().integer().positive(),
    Joi.string().uuid()
  ),

  email: Joi.string()
    .email()
    .lowercase()
    .trim()
    .max(255)
    .messages({
      'string.email': 'Please enter a valid email',
      'string.empty': 'Please enter your email',
      'string.max': 'Email is too long',
      'any.required': 'Please enter your email'
    }),

  password: Joi.string()
    .min(CONTENT_LIMITS.PASSWORD_MIN)
    .max(CONTENT_LIMITS.PASSWORD_MAX)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\-_#])/)
    .messages({
      'string.min': 'Password must be at least {#limit} characters',
      'string.max': 'Password is too long',
      'string.empty': 'Please enter your password',
      'string.pattern.base': 'Add uppercase, lowercase, number & special character',
      'any.required': 'Please enter your password'
    }),

  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .trim()
    .messages({
      'string.alphanum': 'Letters and numbers only',
      'string.min': 'Must be at least 3 characters',
      'string.max': 'Must be 30 characters or less',
      'string.empty': 'Please enter a username'
    }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
    limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
    sort: Joi.string().trim(),
    order: Joi.string().valid('ASC', 'DESC').default('DESC')
  }),

  params: {
    id: Joi.object({
      id: Joi.alternatives().try(
        Joi.number().integer().positive(),
        Joi.string().uuid()
      ).required()
    }),
    userId: Joi.object({
      userId: Joi.alternatives().try(
        Joi.number().integer().positive(),
        Joi.string().uuid()
      ).required()
    }),
    discussionId: Joi.object({
      discussionId: Joi.alternatives().try(
        Joi.number().integer().positive(),
        Joi.string().uuid()
      ).required()
    }),
    messageId: Joi.object({
      messageId: Joi.alternatives().try(
        Joi.number().integer().positive(),
        Joi.string().uuid()
      ).required()
    })
  }
};

// ============================================
// Authentication Schemas
// ============================================

const isDev = process.env.NODE_ENV === 'development';
const recaptchaField = isDev
  ? Joi.string().trim().allow('', null).optional()
  : Joi.string().trim().required().messages({
    'any.required': 'reCAPTCHA token is required',
    'string.empty': 'reCAPTCHA token is required'
  });

const authSchemas = {
  register: Joi.object({
    email: commonSchemas.email.required(),
    password: commonSchemas.password.required(),
    recaptchaToken: recaptchaField,
    username: commonSchemas.username.allow('').optional(),
    full_name: Joi.string().min(2).max(100).trim().required()
      .messages({
        'string.min': 'Name must be at least 2 characters',
        'string.max': 'Name is too long',
        'string.empty': 'Please enter your name',
        'any.required': 'Please enter your name'
      }),
    role: Joi.string().valid(...Object.values(USER_ROLES)).default(USER_ROLES.USER)
  }),

  login: Joi.object({
    email: commonSchemas.email.required(),
    recaptchaToken: recaptchaField,
    password: Joi.string().required()
      .messages({
        'any.required': 'Please enter your password',
        'string.empty': 'Please enter your password'
      })
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required()
      .messages({
        'any.required': 'Please enter current password',
        'string.empty': 'Please enter current password'
      }),
    newPassword: commonSchemas.password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
      .messages({
        'any.only': 'Passwords don\'t match',
        'any.required': 'Please confirm your password',
        'string.empty': 'Please confirm your password'
      })
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    newPassword: commonSchemas.password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
      .messages({
        'any.only': 'Passwords don\'t match',
        'any.required': 'Confirm password required',
        'string.empty': 'Confirm password required'
      })
  }),

  forgotPassword: Joi.object({
    email: commonSchemas.email.required(),
    recaptchaToken: recaptchaField
  }),

  verifyEmail: Joi.object({
    code: Joi.string().length(6).pattern(/^\d+$/).required(),
    email: commonSchemas.email.required()
  }),

  resendVerification: Joi.object({
    email: commonSchemas.email.required()
  }),

  restoreAccount: Joi.object({
    email: commonSchemas.email.required()
  }),

  checkDeletionStatus: Joi.object({
    email: commonSchemas.email.required()
  })
};

// ============================================
// User Schemas
// ============================================

const userSchemas = {
  updateProfile: Joi.object({
    username: commonSchemas.username.allow('').optional(),
    full_name: Joi.string().min(2).max(100).trim().allow(''),
    bio: Joi.string().max(500).allow('', null),
    location: Joi.string().max(100).allow('', null),
    native_language: Joi.string().max(50).allow('', null),
    profile_photo_base64: Joi.string().allow('', null).optional()
  }).min(1),

  updatePreferences: Joi.object({
    email_notifications: Joi.boolean(),
    language_preference: Joi.string().valid('en', 'lisu', 'zh', 'my', 'th')
  }).min(1),

  listUsers: commonSchemas.pagination.keys({
    role: Joi.string().valid(...Object.values(USER_ROLES)).optional(),
    isActive: Joi.boolean().optional(),
    search: Joi.string().max(100).optional(),
    orderBy: Joi.string().valid('created_at', 'email', 'username', 'full_name', 'activity').default('created_at'),
    order: Joi.string().valid('ASC', 'DESC').default('DESC')
  }),

  searchUsers: Joi.object({
    query: Joi.string().trim().min(1).max(100).required(),
    limit: Joi.number().integer().min(1).max(50).default(20)
  }),

  // Follow-related validation schemas
  getUserFollowers: commonSchemas.pagination.keys({
    orderBy: Joi.string().valid('created_at', 'username', 'full_name').default('created_at'),
    order: Joi.string().valid('ASC', 'DESC').default('DESC')
  }),

  getUserFollowing: commonSchemas.pagination.keys({
    orderBy: Joi.string().valid('created_at', 'username', 'full_name').default('created_at'),
    order: Joi.string().valid('ASC', 'DESC').default('DESC')
  }),

  updateRole: Joi.object({
    role: Joi.string().valid(...Object.values(USER_ROLES)).required()
  })
};

// ============================================
// Word Schemas
// ============================================

const wordSchemas = {
  createWord: Joi.object({
    english: Joi.string().trim().min(1).max(255).required(),
    lisu: Joi.string().trim().min(1).max(255).required(),
    part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH).optional(),
    meaning: Joi.string().max(1000).allow('', null),
    example: Joi.array().items(Joi.string().max(500)).max(10).default([]),
    synonyms: Joi.string().max(500).allow('', null),
    antonyms: Joi.string().max(500).allow('', null)
  }),

  updateWord: Joi.object({
    english: Joi.string().trim().min(1).max(255),
    lisu: Joi.string().trim().min(1).max(255),
    part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH),
    meaning: Joi.string().max(1000).allow('', null),
    example: Joi.array().items(Joi.string().max(500)).max(10),
    synonyms: Joi.string().max(500).allow('', null),
    antonyms: Joi.string().max(500).allow('', null)
  }).min(1),

  listWords: commonSchemas.pagination.keys({
    search: Joi.string().max(100),
    part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH),
    created_by: commonSchemas.id,
    sort: Joi.string().valid('created_at', 'updated_at', 'english', 'lisu').default('created_at')
  }),

  searchWords: Joi.object({
    query: Joi.string().trim().min(1).max(100).required(),
    language: Joi.string().valid('en', 'lisu', 'both').default('both'),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  bulkImport: Joi.object({
    words: Joi.array().items(Joi.object({
      english: Joi.string().trim().min(1).max(255).required(),
      lisu: Joi.string().trim().min(1).max(255).required(),
      part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH).optional(),
      meaning: Joi.string().max(1000).optional(),
      example: Joi.string().max(1000).optional(),
      synonyms: Joi.string().max(500).optional(),
      antonyms: Joi.string().max(500).optional()
    })).min(1).max(1000).required()
  }),
};

// ============================================
// Lisu Dictionary Schemas
// ============================================

const lisuSchemas = {
  createLisu: Joi.object({
    lisu_word: Joi.string().trim().min(1).max(255).required(),
    english: Joi.string().trim().min(1).max(255).required(),
    part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH).optional(),
    meaning: Joi.string().max(1000).allow('', null),
    example: Joi.string().max(1000).allow('', null),
    etymology: Joi.string().max(2000).allow('', null),
    related_words: Joi.string().max(1000).allow('', null),
    synonyms: Joi.string().max(500).allow('', null),
    antonyms: Joi.string().max(500).allow('', null)
  }).unknown(false),

  updateLisu: Joi.object({
    lisu_word: Joi.string().trim().min(1).max(255),
    english: Joi.string().trim().min(1).max(255),
    part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH),
    meaning: Joi.string().max(1000).allow('', null),
    example: Joi.string().max(1000).allow('', null),
    etymology: Joi.string().max(2000).allow('', null),
    related_words: Joi.string().max(1000).allow('', null),
    synonyms: Joi.string().max(500).allow('', null),
    antonyms: Joi.string().max(500).allow('', null)
  }).min(1),

  listLisu: commonSchemas.pagination.keys({
    search: Joi.string().max(100),
    part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH),
    created_by: Joi.string().uuid(),
    sort: Joi.string().valid('lisu_word', 'english', 'part_of_speech', 'created_at').default('created_at'),
    order: Joi.string().valid('ASC', 'DESC').default('DESC')
  }),

  searchLisu: Joi.object({
    query: Joi.string().trim().min(1).max(100).required(),
    language: Joi.string().valid('lisu', 'english', 'both').default('both'),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  bulkImportLisu: Joi.object({
    words: Joi.array().items(Joi.object({
      lisu_word: Joi.string().trim().min(1).max(255).required(),
      english: Joi.string().trim().min(1).max(255).required(),
      part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH).optional(),
      meaning: Joi.string().max(1000).optional(),
      example: Joi.string().max(1000).optional(),
      etymology: Joi.string().max(2000).optional(),
      related_words: Joi.string().max(1000).optional(),
      synonyms: Joi.string().max(500).optional(),
      antonyms: Joi.string().max(500).optional()
    })).min(1).max(1000).required()
  })
};

// ============================================
// Discussion Schemas
// ============================================

const discussionSchemas = {
  createDiscussion: Joi.object({
    title: Joi.string().min(CONTENT_LIMITS.DISCUSSION_TITLE_MIN).max(CONTENT_LIMITS.DISCUSSION_TITLE_MAX).trim().required(),
    content: Joi.string().min(CONTENT_LIMITS.DISCUSSION_CONTENT_MIN).max(CONTENT_LIMITS.DISCUSSION_CONTENT_MAX).trim().required(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).default([]),
    category: Joi.string().max(50).optional()
  }),

  updateDiscussion: Joi.object({
    title: Joi.string().min(CONTENT_LIMITS.DISCUSSION_TITLE_MIN).max(CONTENT_LIMITS.DISCUSSION_TITLE_MAX).trim(),
    content: Joi.string().min(CONTENT_LIMITS.DISCUSSION_CONTENT_MIN).max(CONTENT_LIMITS.DISCUSSION_CONTENT_MAX).trim(),
    tags: Joi.array().items(Joi.string().max(50)).max(10),
    category: Joi.string().max(50)
  }).min(1),

  createAnswer: Joi.object({
    content: Joi.string().min(10).max(CONTENT_LIMITS.ANSWER_CONTENT_MAX).trim().required(),
    discussion_id: commonSchemas.id.required(),
    parent_answer_id: commonSchemas.id.allow(null).optional(),
    images: Joi.array().items(Joi.string()).optional()
  }),

  updateAnswer: Joi.object({
    content: Joi.string().min(10).max(CONTENT_LIMITS.ANSWER_CONTENT_MAX).trim().required()
  }),

  listDiscussions: commonSchemas.pagination.keys({
    category: Joi.string().max(50),
    tag: Joi.string().max(50),
    author_id: commonSchemas.id,
    search: Joi.string().max(100),
    sort: Joi.string().valid('latest', 'recent', 'popular', 'views', 'newest').default('latest'),
    sortBy: Joi.string().valid('latest', 'recent', 'popular', 'views', 'newest').default('latest'),
    filter: Joi.string().valid('all', 'answered', 'unanswered', 'no-answer', 'solved', 'my')
  }),

  vote: Joi.object({
    vote_type: Joi.string().valid('up', 'down').required()
  }),

  report: Joi.object({
    reason: Joi.string()
      .valid(
        // Frontend values
        'Spam', 'Harassment', 'Inappropriate Content', 'Off-topic', 'Other',
        // Backend normalized values (for backwards compatibility)
        'spam', 'inappropriate', 'offensive', 'other'
      )
      .required()
      .custom((value) => {
        // Normalize to lowercase backend values
        const mapping = {
          'Spam': 'spam',
          'Harassment': 'offensive',
          'Inappropriate Content': 'inappropriate',
          'Off-topic': 'other',
          'Other': 'other',
          // Already normalized values pass through
          'spam': 'spam',
          'inappropriate': 'inappropriate',
          'offensive': 'offensive',
          'other': 'other'
        };
        return mapping[value] || 'other';
      }),
    description: Joi.string().max(500).allow('', null).optional()
  })
};

// ============================================
// Search Schemas
// ============================================

const searchSchemas = {
  basicSearch: Joi.object({
    q: Joi.string().trim().min(1).max(100).required(),
    type: Joi.string().valid('words', 'discussions', 'all').default('all'),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  suggestions: Joi.object({
    query: Joi.string().trim().min(1).max(100).required(),
    limit: Joi.number().integer().min(1).max(10).default(5)
  }),

  search: Joi.object({
    q: Joi.string().trim().min(2).max(100).required(),
    language: Joi.string().valid('en', 'lisu', 'auto').default('auto'),
    type: Joi.string().valid('words', 'discussions', 'all').default('all'),
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0)
  }),

  advancedSearch: Joi.object({
    query: Joi.string().trim().min(2).max(100).required(),
    filters: Joi.object({
      part_of_speech: Joi.array().items(Joi.string().valid(...PARTS_OF_SPEECH)),
      is_verified: Joi.boolean(),
      created_after: Joi.date(),
      created_before: Joi.date()
    }).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

// ============================================
// Chat Schemas
// ============================================

const chatSchemas = {
  // Conversation Management
  listConversations: commonSchemas.pagination.keys({
    search: Joi.string().trim().optional(),
    unread_only: Joi.boolean().default(false)
  }),

  createConversation: Joi.object({
    participant_id: commonSchemas.id.required(),
    initial_message: Joi.string().trim().min(1).max(5000).optional()
  }),

  updateConversation: Joi.object({
    title: Joi.string().trim().min(1).max(100).optional(),
    is_group: Joi.boolean().optional()
  }),

  addParticipant: Joi.object({
    user_id: commonSchemas.id.required()
  }),

  removeParticipant: Joi.object({
    id: commonSchemas.id.required(),
    userId: commonSchemas.id.required()
  }),

  updateSettings: Joi.object({
    notifications_enabled: Joi.boolean().optional(),
    muted: Joi.boolean().optional()
  }),

  // Message Management
  listMessages: commonSchemas.pagination.keys({
    conversation_id: commonSchemas.id.optional(),
    before: Joi.date().optional(),
    after: Joi.date().optional()
  }),

  sendMessage: Joi.object({
    content: Joi.string().trim().min(1).max(5000).required(),
    attachments: Joi.array().items(Joi.string().uri()).max(5).optional(),
    reply_to: commonSchemas.id.optional()
  }),

  messageContent: Joi.object({
    content: Joi.string().trim().min(1).max(5000).required()
  }),

  updateMessage: Joi.object({
    messageId: commonSchemas.id.required()
  }),

  deleteMessage: Joi.object({
    messageId: commonSchemas.id.required()
  }),

  // Reactions
  reaction: Joi.object({
    emoji: Joi.string().trim().min(1).max(10).required()
  }),

  addReaction: Joi.object({
    messageId: commonSchemas.id.required()
  }),

  removeReaction: Joi.object({
    messageId: commonSchemas.id.required(),
    emoji: Joi.string().trim().min(1).max(10).required()
  }),

  // Search
  searchConversations: Joi.object({
    query: Joi.string().trim().min(1).max(100).required(),
    limit: Joi.number().integer().min(1).max(50).default(20)
  }),

  searchMessages: Joi.object({
    query: Joi.string().trim().min(1).max(100).required(),
    limit: Joi.number().integer().min(1).max(100).default(50)
  }),

  // Media
  listMedia: commonSchemas.pagination.keys({
    type: Joi.string().valid('image', 'video', 'document', 'all').default('all')
  })
};

// ============================================
// Admin Schemas
// ============================================

const adminSchemas = {
  // User Management
  listUsers: commonSchemas.pagination.keys({
    search: Joi.string().trim().optional(),
    role: Joi.string().valid(...Object.values(USER_ROLES)).optional(),
    is_active: Joi.boolean().optional()
  }),

  updateUserStatus: Joi.object({
    is_active: Joi.boolean().required()
  }),

  updateUserRole: Joi.object({
    role: Joi.string().valid(...Object.values(USER_ROLES)).required()
  }),

  // Word Management
  listWords: commonSchemas.pagination.keys({
    search: Joi.string().trim().optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
    part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH).optional()
  }),

  createWord: Joi.object({
    lisu_word: Joi.string().trim().min(1).max(100).required(),
    english_translation: Joi.string().trim().min(1).max(500).required(),
    part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH).required(),
    pronunciation: Joi.string().trim().max(200).optional(),
    example_sentence: Joi.string().trim().max(1000).optional(),
    notes: Joi.string().trim().max(1000).optional(),
    tags: Joi.array().items(Joi.string().trim()).optional()
  }),

  updateWord: Joi.object({
    lisu_word: Joi.string().trim().min(1).max(100).optional(),
    english_translation: Joi.string().trim().min(1).max(500).optional(),
    part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH).optional(),
    pronunciation: Joi.string().trim().max(200).optional(),
    example_sentence: Joi.string().trim().max(1000).optional(),
    notes: Joi.string().trim().max(1000).optional(),
    tags: Joi.array().items(Joi.string().trim()).optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected').optional()
  }),

  bulkImport: Joi.object({
    words: Joi.array().items(Joi.object({
      english: Joi.string().trim().min(1).max(255).required(),
      lisu: Joi.string().trim().min(1).max(255).required(),
      part_of_speech: Joi.string().valid(...PARTS_OF_SPEECH).optional(),
      meaning: Joi.string().max(1000).optional(),
      example: Joi.string().max(1000).optional(),
      synonyms: Joi.string().max(500).optional(),
      antonyms: Joi.string().max(500).optional()
    })).min(1).max(1000).required()
  }),

  exportWords: Joi.object({
    format: Joi.string().valid('json', 'csv', 'xlsx').default('json'),
    status: Joi.string().valid('all', 'approved', 'pending', 'rejected').default('all')
  }),

  // Reports & Moderation
  listReports: commonSchemas.pagination.keys({
    status: Joi.string().valid('pending', 'resolved', 'dismissed').optional(),
    type: Joi.string().valid('discussion', 'answer', 'word', 'user').optional()
  }),

  resolveReport: Joi.object({
    action: Joi.string().valid('approve', 'reject', 'delete', 'ban').required(),
    notes: Joi.string().trim().max(500).optional()
  }),

  moderationHistory: commonSchemas.pagination.keys({
    user_id: commonSchemas.id.optional(),
    action_type: Joi.string().valid('approve', 'reject', 'delete', 'ban', 'warn').optional(),
    start_date: Joi.date().optional(),
    end_date: Joi.date().greater(Joi.ref('start_date')).optional()
  }),

  // Statistics
  statistics: Joi.object({
    start_date: Joi.date().optional(),
    end_date: Joi.date().greater(Joi.ref('start_date')).optional(),
    metric: Joi.string().valid('users', 'words', 'discussions', 'all').default('all')
  })
};

// ============================================
// Answer Schemas
// ============================================

const answerSchemas = {
  createAnswer: Joi.object({
    discussion_id: commonSchemas.id.required(),
    content: Joi.string().min(10).max(5000).required(),
    parent_answer_id: commonSchemas.id.allow(null).optional(),
    images: Joi.array().items(Joi.string()).optional()
  }),

  updateAnswer: Joi.object({
    content: Joi.string().min(10).max(5000).required()
  }),

  vote: Joi.object({
    vote_type: Joi.string().valid('up', 'down').required()
  }),

  getByDiscussion: Joi.object({
    discussionId: commonSchemas.id.required()
  }),

  listAnswers: commonSchemas.pagination
};

// ============================================
// Notification Schemas
// ============================================

const notificationSchemas = {
  create: Joi.object({
    type: Joi.string().required(),
    title: Joi.string().max(255).required(),
    message: Joi.string().max(1000).required(),
    link: Joi.string().uri().optional()
  }),

  markAsRead: Joi.object({
    ids: Joi.array().items(commonSchemas.id).min(1).optional()
  }),

  updatePreferences: Joi.object({
    email_enabled: Joi.boolean().optional(),
    push_enabled: Joi.boolean().optional()
  }),

  listNotifications: commonSchemas.pagination.keys({
    is_read: Joi.boolean().optional(),
    type: Joi.string().optional()
  }),

  list: commonSchemas.pagination.keys({
    is_read: Joi.boolean().optional(),
    type: Joi.string().optional()
  })
};

// ============================================
// Tag Schemas
// ============================================

const tagSchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    description: Joi.string().max(500).optional()
  }),

  search: Joi.object({
    query: Joi.string().min(1).required(),
    limit: Joi.number().integer().min(1).max(50).default(10)
  }),

  listTags: commonSchemas.pagination.keys({
    search: Joi.string().max(100).optional(),
    type: Joi.string().valid('popular', 'trending', 'recent', 'all').default('all')
  }),

  popularTags: Joi.object({
    limit: Joi.number().integer().min(1).max(50).default(10),
    min_usage: Joi.number().integer().min(1).optional()
  }),

  list: commonSchemas.pagination.keys({
    type: Joi.string().valid('popular', 'trending', 'recent').optional()
  })
};

// ============================================
// Exports
// ============================================

module.exports = {
  validate,
  schemas: {
    auth: authSchemas,
    user: userSchemas,
    word: wordSchemas,
    lisu: lisuSchemas,
    discussion: discussionSchemas,
    search: searchSchemas,
    chat: chatSchemas,
    admin: adminSchemas,
    answer: answerSchemas,
    notification: notificationSchemas,
    tag: tagSchemas,
    common: commonSchemas
  }
};
