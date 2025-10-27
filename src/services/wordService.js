/**
 * Word Service
 * Handles word-related business logic
 */

const WordRepository = require('../repositories/WordRepository');
const logger = require('../utils/logger');
const { NotFoundError, ValidationError, AuthorizationError } = require('../utils/errors');
const { PARTS_OF_SPEECH } = require('../config/constants');

class WordService {
  /**
   * Get word by ID
   */
  async getWordById(wordId) {
    const word = await WordRepository.findById(wordId);
    if (!word) {
      throw new NotFoundError('Word');
    }
    return word;
  }

  /**
   * Create new word
   */
  async createWord(wordData, userId) {
    // Validate part of speech
    if (wordData.part_of_speech && !PARTS_OF_SPEECH.includes(wordData.part_of_speech)) {
      throw new ValidationError('Invalid part of speech', {
        field: 'part_of_speech',
        validValues: PARTS_OF_SPEECH
      });
    }

    const word = await WordRepository.create(wordData, userId);

    logger.info('Word created successfully', {
      wordId: word.id,
      english_word: word.english_word,
      userId
    });

    return word;
  }

  /**
   * Update word
   */
  async updateWord(wordId, wordData, userId, userRole) {
    const existingWord = await this.getWordById(wordId);

    // Check permissions
    if (existingWord.created_by !== userId && userRole !== 'admin' && userRole !== 'moderator') {
      throw new AuthorizationError('You can only edit your own words', {
        wordId,
        createdBy: existingWord.created_by,
        requestedBy: userId
      });
    }

    // Validate part of speech if provided
    if (wordData.part_of_speech && !PARTS_OF_SPEECH.includes(wordData.part_of_speech)) {
      throw new ValidationError('Invalid part of speech', {
        field: 'part_of_speech',
        validValues: PARTS_OF_SPEECH
      });
    }

    const updatedWord = await WordRepository.update(wordId, wordData);

    logger.info('Word updated successfully', {
      wordId,
      userId,
      updatedFields: Object.keys(wordData)
    });

    return updatedWord;
  }

  /**
   * Delete word
   */
  async deleteWord(wordId, userId, userRole) {
    const existingWord = await this.getWordById(wordId);

    // Check permissions
    if (existingWord.created_by !== userId && userRole !== 'admin') {
      throw new AuthorizationError('You can only delete your own words');
    }

    await WordRepository.delete(wordId);

    logger.info('Word deleted successfully', {
      wordId,
      english_word: existingWord.english_word,
      userId
    });

    return true;
  }

  /**
   * List words with filters
   */
  async listWords(options = {}) {
    const result = await WordRepository.list(options);
    return result;
  }

  /**
   * Search words
   */
  async searchWords(searchTerm, options = {}) {
    const result = await WordRepository.list({
      ...options,
      search: searchTerm
    });
    return result;
  }

  /**
   * Get similar words
   */
  async getSimilarWords(wordId, limit = 5) {
    await this.getWordById(wordId); // Validate word exists
    const similarWords = await WordRepository.findSimilar(wordId, limit);
    return similarWords;
  }

  /**
   * Get random words (word of the day, etc.)
   */
  async getRandomWords(count = 10) {
    const words = await WordRepository.getRandom(count);
    return words;
  }

  /**
   * Get word statistics
   */
  async getWordStatistics() {
    // TODO: Implement comprehensive statistics
    // - Total words
    // - Verified words
    // - Words by part of speech
    // - Recent additions
    return {
      totalWords: 0,
      verifiedWords: 0,
      pendingVerification: 0,
      byPartOfSpeech: {}
    };
  }

  /**
   * Verify word (admin/moderator only)
   */
  async verifyWord(wordId, userRole) {
    if (userRole !== 'admin' && userRole !== 'moderator') {
      throw new AuthorizationError('Only admins and moderators can verify words');
    }

    const word = await WordRepository.verify(wordId);

    logger.info('Word verified', { wordId, userRole });
    return word;
  }

  /**
   * Unverify word (admin/moderator only)
   */
  async unverifyWord(wordId, userRole) {
    if (userRole !== 'admin' && userRole !== 'moderator') {
      throw new AuthorizationError('Only admins and moderators can unverify words');
    }

    const word = await WordRepository.unverify(wordId);

    logger.info('Word unverified', { wordId, userRole });
    return word;
  }

  /**
   * Get words by user
   */
  async getWordsByUser(userId, options = {}) {
    const result = await WordRepository.list({
      ...options,
      created_by: userId
    });
    return result;
  }

  /**
   * Get verified words only
   */
  async getVerifiedWords(options = {}) {
    const result = await WordRepository.list({
      ...options,
      is_verified: true
    });
    return result;
  }

  /**
   * Get unverified words (for moderation)
   */
  async getUnverifiedWords(options = {}) {
    const result = await WordRepository.list({
      ...options,
      is_verified: false
    });
    return result;
  }

  /**
   * Get words with etymology
   */
  async getWordsWithEtymology(options = {}) {
    const result = await WordRepository.list({
      ...options,
      has_etymology: true
    });
    return result;
  }

  /**
   * Bulk import words (admin only)
   */
  async bulkImportWords(wordsData, userId, userRole) {
    if (userRole !== 'admin') {
      throw new AuthorizationError('Only admins can bulk import words');
    }

    const results = {
      success: [],
      failed: []
    };

    for (const wordData of wordsData) {
      try {
        const word = await this.createWord(wordData, userId);
        results.success.push({
          word: word.english_word,
          id: word.id
        });
      } catch (error) {
        results.failed.push({
          word: wordData.english_word,
          error: error.message
        });
      }
    }

    logger.info('Bulk import completed', {
      total: wordsData.length,
      success: results.success.length,
      failed: results.failed.length,
      userId
    });

    return results;
  }
}

module.exports = new WordService();
