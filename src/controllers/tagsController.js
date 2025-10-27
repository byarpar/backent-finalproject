const tagService = require('../services/tagService');
const { sendSuccess, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/helpers');
const { HTTP_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * TagController v2
 * Clean HTTP request/response handling for tag operations
 * All business logic delegated to tagService
 */

/**
 * Get all tags with usage counts
 * @route GET /api/tags
 * @access Public
 */
const getAllTags = asyncHandler(async (req, res) => {
  const { limit, offset, minCount } = req.query;

  const options = {
    limit: limit ? parseInt(limit) : undefined,
    offset: offset ? parseInt(offset) : undefined,
    minCount: minCount ? parseInt(minCount) : 1
  };

  const result = await tagService.getAllTags(options);

  sendSuccess(res, HTTP_STATUS.OK, result, 'Tags retrieved successfully');
});

/**
 * Get popular tags
 * @route GET /api/tags/popular
 * @access Public
 */
const getPopularTags = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  const result = await tagService.getPopularTags(limit);

  sendSuccess(res, HTTP_STATUS.OK, result, 'Popular tags retrieved successfully');
});

/**
 * Get trending tags
 * @route GET /api/tags/trending
 * @access Public
 */
const getTrendingTags = asyncHandler(async (req, res) => {
  const { limit, days } = req.query;

  const options = {
    limit: limit ? parseInt(limit) : 10,
    days: days ? parseInt(days) : 7
  };

  const result = await tagService.getTrendingTags(options);

  sendSuccess(res, HTTP_STATUS.OK, result, 'Trending tags retrieved successfully');
});

/**
 * Search tags
 * @route GET /api/tags/search
 * @access Public
 */
const searchTags = asyncHandler(async (req, res) => {
  const { q: query, limit } = req.query;

  const searchLimit = limit ? parseInt(limit) : 20;

  const result = await tagService.searchTags(query, searchLimit);

  sendSuccess(res, HTTP_STATUS.OK, result, 'Tag search completed successfully');
});

/**
 * Get tag details
 * @route GET /api/tags/:tagName
 * @access Public
 */
const getTagDetails = asyncHandler(async (req, res) => {
  const { tagName } = req.params;
  const { limit } = req.query;

  const options = {
    limit: limit ? parseInt(limit) : 10
  };

  const tagDetails = await tagService.getTagDetails(tagName, options);

  logger.info(`Tag details retrieved`, { tagName });

  sendSuccess(res, HTTP_STATUS.OK, { tag: tagDetails }, 'Tag details retrieved successfully');
});

/**
 * Get related tags
 * @route GET /api/tags/:tagName/related
 * @access Public
 */
const getRelatedTags = asyncHandler(async (req, res) => {
  const { tagName } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  const result = await tagService.getRelatedTags(tagName, limit);

  sendSuccess(res, HTTP_STATUS.OK, result, 'Related tags retrieved successfully');
});

/**
 * Get tag statistics
 * @route GET /api/tags/stats
 * @access Public
 */
const getTagStatistics = asyncHandler(async (req, res) => {
  const stats = await tagService.getTagStatistics();

  sendSuccess(res, HTTP_STATUS.OK, { stats }, 'Tag statistics retrieved successfully');
});

module.exports = {
  getAllTags,
  getPopularTags,
  getTrendingTags,
  searchTags,
  getTagDetails,
  getRelatedTags,
  getTagStatistics
};
