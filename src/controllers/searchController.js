const searchService = require('../services/searchService');
const { asyncHandler } = require('../middlewares/errorHandler');
const { sendSuccess } = require('../utils/response');
const { HTTP_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * SearchController v2
 * Professional search controller with performance metrics
 */
class SearchController {
  /**
   * Basic search
   * GET /api/search?q=word&language=auto&page=1&limit=20
   */
  static basicSearch = asyncHandler(async (req, res) => {
    const {
      q: query,
      language = 'auto',
      page = 1,
      limit = 20
    } = req.query;

    const userId = req.user?.id;

    const results = await searchService.search(
      query,
      language,
      parseInt(page),
      parseInt(limit),
      userId
    );

    logger.info(`Basic search: "${query}" - ${results.results.length} results in ${results.responseTime}ms`);

    sendSuccess(res, HTTP_STATUS.OK, results, 'Search completed successfully');
  });

  /**
   * Advanced search with multiple criteria
   * POST /api/search/advanced
   * Body: {
   *   english_word, lisu_translation, part_of_speech, definition,
   *   has_etymology, created_by, date_from, date_to, page, limit
   * }
   */
  static advancedSearch = asyncHandler(async (req, res) => {
    const {
      english_word,
      lisu_translation,
      part_of_speech,
      definition,
      has_etymology,
      created_by,
      date_from,
      date_to,
      page = 1,
      limit = 20
    } = req.body;

    const criteria = {
      english_word,
      lisu_translation,
      part_of_speech,
      definition,
      has_etymology,
      created_by,
      date_from,
      date_to
    };

    const results = await searchService.advancedSearch(
      criteria,
      parseInt(page),
      parseInt(limit)
    );

    logger.info(`Advanced search completed - ${results.results.length} results in ${results.responseTime}ms`);

    sendSuccess(res, HTTP_STATUS.OK, results, 'Advanced search completed successfully');
  });

  /**
   * Get search suggestions (autocomplete)
   * GET /api/search/suggestions?query=wor&limit=10
   */
  static getSearchSuggestions = asyncHandler(async (req, res) => {
    const {
      query,
      limit = 10
    } = req.query;

    const suggestions = await searchService.getSuggestions(
      query,
      parseInt(limit)
    );

    logger.info(`Returned ${suggestions.length} suggestions for "${query}"`);

    sendSuccess(res, HTTP_STATUS.OK, { suggestions }, 'Suggestions retrieved successfully');
  });

  /**
   * Get user's search history
   * GET /api/search/history?page=1&limit=20
   */
  static getSearchHistory = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 20
    } = req.query;

    const history = await searchService.getSearchHistory(
      userId,
      parseInt(page),
      parseInt(limit)
    );

    logger.info(`Retrieved search history for user ${userId}: ${history.history.length}/${history.total} entries`);

    sendSuccess(res, HTTP_STATUS.OK, history, 'Search history retrieved successfully');
  });

  /**
   * Clear user's search history
   * DELETE /api/search/history
   */
  static clearSearchHistory = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const result = await searchService.clearSearchHistory(userId);

    logger.info(`Cleared ${result.count} search history entries for user ${userId}`);

    sendSuccess(res, HTTP_STATUS.OK, result, 'Search history cleared successfully');
  });

  /**
   * Get search analytics (admin only)
   * GET /api/search/analytics?timeframe=7d&limit=10
   */
  static getSearchAnalytics = asyncHandler(async (req, res) => {
    const {
      timeframe = '7d',
      limit = 10
    } = req.query;

    const analytics = await searchService.getAnalytics(
      timeframe,
      parseInt(limit)
    );

    logger.info(`Retrieved search analytics for timeframe: ${timeframe}`);

    sendSuccess(res, HTTP_STATUS.OK, analytics, 'Search analytics retrieved successfully');
  });
}

module.exports = SearchController;
