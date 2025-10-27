const express = require('express');
const tagsController = require('../controllers/tagsController');
const { validate, schemas } = require('../validations/schemas');

const router = express.Router();

// ============================================
// Public Tag Routes
// ============================================

/**
 * @route   GET /api/tags
 * @desc    Get all tags with usage counts
 * @access  Public
 */
router.get('/',
  validate(schemas.tag.listTags, 'query'),
  tagsController.getAllTags
);

/**
 * @route   GET /api/tags/popular
 * @desc    Get popular tags
 * @access  Public
 */
router.get('/popular',
  validate(schemas.tag.popularTags, 'query'),
  tagsController.getPopularTags
);

/**
 * @route   GET /api/tags/trending
 * @desc    Get trending tags (recently popular)
 * @access  Public
 */
router.get('/trending',
  validate(schemas.tag.popularTags, 'query'),
  tagsController.getTrendingTags
);

/**
 * @route   GET /api/tags/search
 * @desc    Search tags by name
 * @access  Public
 */
router.get('/search',
  tagsController.searchTags
);

/**
 * @route   GET /api/tags/stats
 * @desc    Get tag statistics
 * @access  Public
 */
router.get('/stats',
  tagsController.getTagStatistics
);

/**
 * @route   GET /api/tags/:tagName
 * @desc    Get tag details with recent discussions
 * @access  Public
 */
router.get('/:tagName',
  tagsController.getTagDetails
);

/**
 * @route   GET /api/tags/:tagName/related
 * @desc    Get related tags
 * @access  Public
 */
router.get('/:tagName/related',
  tagsController.getRelatedTags
);

module.exports = router;
