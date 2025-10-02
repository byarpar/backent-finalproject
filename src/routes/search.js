const express = require('express');
const SearchController = require('../controllers/searchController');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

// Basic search
router.get('/',
  SearchController.basicSearch
);

// Advanced search
router.post('/advanced',
  authenticateToken,
  SearchController.advancedSearch
);

// Search suggestions/autocomplete
router.get('/suggestions',
  SearchController.getSearchSuggestions
);

// Get search history (authenticated users)
router.get('/history',
  authenticateToken,
  SearchController.getSearchHistory
);

// Clear search history (authenticated users)
router.delete('/history',
  authenticateToken,
  SearchController.clearSearchHistory
);

// Get search analytics (admin only)
router.get('/analytics',
  authenticateToken,
  SearchController.getSearchAnalytics
);

module.exports = router;
