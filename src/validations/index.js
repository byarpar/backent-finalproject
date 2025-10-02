const Joi = require('joi');

const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property], { abortEarly: false });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation Error',
        details: errorDetails
      });
    }

    next();
  };
};

// Validation schemas
const schemas = {
  // Auth schemas
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'Password is required'
    }),
    name: Joi.string().min(2).max(50).required().messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 50 characters',
      'any.required': 'Name is required'
    }),
    role: Joi.string().valid('user', 'admin').default('user')
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required().messages({
      'any.required': 'Current password is required'
    }),
    newPassword: Joi.string().min(6).required().messages({
      'string.min': 'New password must be at least 6 characters long',
      'any.required': 'New password is required'
    })
  }),

  // Word schemas
  createWord: Joi.object({
    english_word: Joi.string().trim().min(1).max(255).required().messages({
      'string.empty': 'English word cannot be empty',
      'string.max': 'English word cannot exceed 255 characters',
      'any.required': 'English word is required'
    }),
    lisu_translation: Joi.string().trim().min(1).required().messages({
      'string.empty': 'Lisu translation cannot be empty',
      'any.required': 'Lisu translation is required'
    }),
    part_of_speech: Joi.string().valid(
      'noun', 'verb', 'adjective', 'adverb', 'pronoun',
      'preposition', 'conjunction', 'interjection', 'article'
    ).messages({
      'any.only': 'Invalid part of speech'
    }),
    definition: Joi.string().trim().max(2000),
    example_usage: Joi.string().trim().max(1000),
    synonyms: Joi.string().trim().max(500),
    antonyms: Joi.string().trim().max(500),
    phonetic: Joi.string().trim().max(255)
  }),

  updateWord: Joi.object({
    english_word: Joi.string().trim().min(1).max(255),
    lisu_translation: Joi.string().trim().min(1),
    part_of_speech: Joi.string().valid(
      'noun', 'verb', 'adjective', 'adverb', 'pronoun',
      'preposition', 'conjunction', 'interjection', 'article'
    ),
    definition: Joi.string().trim().max(2000),
    example_usage: Joi.string().trim().max(1000),
    synonyms: Joi.string().trim().max(500),
    antonyms: Joi.string().trim().max(500),
    phonetic: Joi.string().trim().max(255)
  }).min(1),

  // Etymology schemas
  createEtymology: Joi.object({
    word_id: Joi.number().integer().positive().required(),
    origin: Joi.string().trim().max(1000),
    historical_development: Joi.string().trim().max(2000),
    first_recorded_date: Joi.date(),
    etymology_notes: Joi.string().trim().max(1000),
    linguistic_family: Joi.string().trim().max(255),
    related_words: Joi.string().trim().max(500)
  }),

  updateEtymology: Joi.object({
    origin: Joi.string().trim().max(1000),
    historical_development: Joi.string().trim().max(2000),
    first_recorded_date: Joi.date(),
    etymology_notes: Joi.string().trim().max(1000),
    linguistic_family: Joi.string().trim().max(255),
    related_words: Joi.string().trim().max(500)
  }).min(1),

  // Search schemas
  search: Joi.object({
    q: Joi.string().trim().min(1).max(255).required().messages({
      'string.empty': 'Search query cannot be empty',
      'string.max': 'Search query cannot exceed 255 characters',
      'any.required': 'Search query is required'
    }),
    language: Joi.string().valid('english', 'lisu', 'auto').default('auto'),
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0)
  }),

  // Pagination schema
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('created_at', 'updated_at', 'english_word', 'lisu_translation').default('created_at'),
    order: Joi.string().valid('ASC', 'DESC').default('DESC')
  })
};

module.exports = {
  validateRequest,
  schemas
};
