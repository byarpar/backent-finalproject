const express = require('express');
const SearchController = require('../controllers/searchController');
const { authenticate, optionalAuthenticate } = require('../middlewares/auth');
const { validate, schemas } = require('../validations/schemas');

const router = express.Router();

// ============================================
// Public Search Routes
// ============================================

/**
 * @route   GET /api/search
 * @desc    Basic search across words
 * @access  Public
 */
router.get('/',
  validate(schemas.search.basicSearch, 'query'),
  SearchController.basicSearch
);

/**
 * @route   GET /api/search/suggestions
 * @desc    Get search suggestions/autocomplete
 * @access  Public
 */
router.get('/suggestions',
  validate(schemas.search.suggestions, 'query'),
  SearchController.getSearchSuggestions
);

// ============================================
// Protected Search Routes
// ============================================

/**
 * @route   POST /api/search/advanced
 * @desc    Advanced search with multiple filters
 * @access  Private
 */
router.post('/advanced',
  authenticate,
  validate(schemas.search.advancedSearch),
  SearchController.advancedSearch
);

/**
 * @route   GET /api/search/history
 * @desc    Get user's search history
 * @access  Private
 */
router.get('/history',
  authenticate,
  SearchController.getSearchHistory
);

/**
 * @route   DELETE /api/search/history
 * @desc    Clear user's search history
 * @access  Private
 */
router.delete('/history',
  authenticate,
  SearchController.clearSearchHistory
);

/**
 * @route   GET /api/search/analytics
 * @desc    Get search analytics (Admin only)
 * @access  Admin
 */
router.get('/analytics',
  authenticate,
  SearchController.getSearchAnalytics
);

module.exports = router;
