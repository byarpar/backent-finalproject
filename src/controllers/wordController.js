/**
 * Word Controller
 * Professional controller for word management
 */

const wordService = require('../services/wordService');
const { sendSuccess, sendCreated, sendUpdated, sendDeleted, sendPaginated } = require('../utils/response');
const { asyncHandler } = require('../utils/helpers');
const { HTTP_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

class WordController {
  /**
   * Get all words with pagination
   * GET /api/words
   */
  getAllWords = asyncHandler(async (req, res) => {
    const options = req.query;

    const result = await wordService.listWords(options);

    sendPaginated(res, { words: result.words }, result.pagination, 'Words retrieved');
  });

  /**
   * Get single word by ID
   * GET /api/words/:id
   */
  getWordById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const word = await wordService.getWordById(id);

    sendSuccess(res, HTTP_STATUS.OK, { word }, 'Word retrieved');
  });

  /**
   * Create new word
   * POST /api/words
   */
  createWord = asyncHandler(async (req, res) => {
    const wordData = req.body;
    const userId = req.user.id;

    const word = await wordService.createWord(wordData, userId);

    sendCreated(res, { word }, 'Word created successfully');
  });

  /**
   * Update word
   * PUT /api/words/:id
   */
  updateWord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const wordData = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const word = await wordService.updateWord(id, wordData, userId, userRole);

    sendUpdated(res, { word }, 'Word updated successfully');
  });

  /**
   * Delete word
   * DELETE /api/words/:id
   */
  deleteWord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    await wordService.deleteWord(id, userId, userRole);

    sendDeleted(res, 'Word deleted successfully');
  });

  /**
   * Search words
   * GET /api/words/search
   */
  searchWords = asyncHandler(async (req, res) => {
    const { query: searchTerm, ...options } = req.query;

    const result = await wordService.searchWords(searchTerm, options);

    sendPaginated(res, { words: result.words }, result.pagination, 'Search results');
  });

  /**
   * Get similar words
   * GET /api/words/:id/similar
   */
  getSimilarWords = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { limit = 5 } = req.query;

    const words = await wordService.getSimilarWords(id, limit);

    sendSuccess(res, HTTP_STATUS.OK, { words }, 'Similar words retrieved');
  });

  /**
   * Get random words (word of the day)
   * GET /api/words/random
   */
  getRandomWords = asyncHandler(async (req, res) => {
    const { count = 10 } = req.query;

    const words = await wordService.getRandomWords(count);

    sendSuccess(res, HTTP_STATUS.OK, { words }, 'Random words retrieved');
  });

  /**
   * Verify word (admin/moderator)
   * POST /api/words/:id/verify
   */
  verifyWord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userRole = req.user.role;

    const word = await wordService.verifyWord(id, userRole);

    sendUpdated(res, { word }, 'Word verified successfully');
  });

  /**
   * Unverify word (admin/moderator)
   * POST /api/words/:id/unverify
   */
  unverifyWord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userRole = req.user.role;

    const word = await wordService.unverifyWord(id, userRole);

    sendUpdated(res, { word }, 'Word unverified');
  });

  /**
   * Get verified words only
   * GET /api/words/verified
   */
  getVerifiedWords = asyncHandler(async (req, res) => {
    const options = req.query;

    const result = await wordService.getVerifiedWords(options);

    sendPaginated(res, { words: result.words }, result.pagination, 'Verified words retrieved');
  });

  /**
   * Get unverified words (for moderation)
   * GET /api/words/unverified
   */
  getUnverifiedWords = asyncHandler(async (req, res) => {
    const options = req.query;

    const result = await wordService.getUnverifiedWords(options);

    sendPaginated(res, { words: result.words }, result.pagination, 'Unverified words retrieved');
  });

  /**
   * Get words with etymology
   * GET /api/words/etymology
   */
  getWordsWithEtymology = asyncHandler(async (req, res) => {
    const options = req.query;

    const result = await wordService.getWordsWithEtymology(options);

    sendPaginated(res, { words: result.words }, result.pagination, 'Words with etymology retrieved');
  });

  /**
   * Get words by user
   * GET /api/words/user/:userId
   */
  getWordsByUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const options = req.query;

    const result = await wordService.getWordsByUser(userId, options);

    sendPaginated(res, { words: result.words }, result.pagination, 'User words retrieved');
  });

  /**
   * Get my contributed words
   * GET /api/words/me
   */
  getMyWords = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const options = req.query;

    const result = await wordService.getWordsByUser(userId, options);

    sendPaginated(res, { words: result.words }, result.pagination, 'Your words retrieved');
  });

  /**
   * Bulk import words (admin only)
   * POST /api/words/bulk-import
   */
  bulkImportWords = asyncHandler(async (req, res) => {
    const { words } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const result = await wordService.bulkImportWords(words, userId, userRole);

    sendSuccess(res, HTTP_STATUS.OK, result, 'Bulk import completed');
  });

  /**
   * Get word statistics
   * GET /api/words/statistics
   */
  getWordStatistics = asyncHandler(async (req, res) => {
    const stats = await wordService.getWordStatistics();

    sendSuccess(res, HTTP_STATUS.OK, { statistics: stats }, 'Statistics retrieved');
  });
}

module.exports = new WordController();
