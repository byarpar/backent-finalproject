const express = require('express');
const WordController = require('../controllers/wordController');
const { authenticate, authorize, requireMinRole } = require('../middlewares/auth');
const { validate, schemas } = require('../validations/schemas');

const router = express.Router();

// ============================================
// Public Routes
// ============================================

/**
 * @route   GET /api/words
 * @desc    Get all words with pagination and filtering
 * @access  Public
 */
router.get('/',
  validate(schemas.word.listWords, 'query'),
  WordController.getAllWords
);

/**
 * @route   GET /api/words/search
 * @desc    Search words by English or Lisu text
 * @access  Public
 */
router.get('/search',
  validate(schemas.word.searchWords, 'query'),
  WordController.searchWords
);

/**
 * @route   GET /api/words/random
 * @desc    Get a random word (for word of the day)
 * @access  Public
 */
router.get('/random',
  WordController.getRandomWords
);

/**
 * @route   GET /api/words/:id
 * @desc    Get word by ID
 * @access  Public
 */
router.get('/:id',
  validate(schemas.common.params.id, 'params'),
  WordController.getWordById
);

/**
 * @route   GET /api/words/:id/similar
 * @desc    Get similar words
 * @access  Public
 */
router.get('/:id/similar',
  validate(schemas.common.params.id, 'params'),
  WordController.getSimilarWords
);

// ============================================
// Protected Routes - Authentication Required
// ============================================

/**
 * @route   POST /api/words
 * @desc    Create a new word
 * @access  Private (Authenticated users can contribute)
 */
router.post('/',
  authenticate,
  validate(schemas.word.createWord),
  WordController.createWord
);

/**
 * @route   PUT /api/words/:id
 * @desc    Update a word
 * @access  Private (Owner or Moderator+)
 */
router.put('/:id',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  validate(schemas.word.updateWord),
  WordController.updateWord
);

/**
 * @route   DELETE /api/words/:id
 * @desc    Delete a word
 * @access  Private (Owner or Moderator+)
 */
router.delete('/:id',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  WordController.deleteWord
);

// ============================================
// Moderator Routes
// ============================================

/**
 * @route   POST /api/words/:id/verify
 * @desc    Verify/approve a word
 * @access  Moderator+
 */
router.post('/:id/verify',
  authenticate,
  requireMinRole('moderator'),
  validate(schemas.common.params.id, 'params'),
  WordController.verifyWord
);

// ============================================
// Admin Routes
// ============================================

/**
 * @route   POST /api/words/bulk-import
 * @desc    Bulk import words from CSV/JSON
 * @access  Admin
 */
router.post('/bulk-import',
  authenticate,
  authorize('admin', 'super_admin'),
  validate(schemas.word.bulkImport),
  WordController.bulkImportWords
);

/**
 * @route   GET /api/words/statistics/overview
 * @desc    Get word statistics
 * @access  Admin
 */
router.get('/statistics/overview',
  authenticate,
  authorize('admin', 'super_admin'),
  WordController.getWordStatistics
);

module.exports = router;
