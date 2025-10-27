const TagRepository = require('../repositories/TagRepository');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../utils/errors');

/**
 * TagService
 * Business logic layer for tag operations
 */
class TagService {
  /**
   * Get all tags with usage counts
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Tags with metadata
   */
  async getAllTags(options = {}) {
    const { limit, offset, minCount = 1 } = options;

    // Validate options
    if (limit && (limit < 1 || limit > 1000)) {
      throw new ValidationError('Limit must be between 1 and 1000');
    }

    if (offset && offset < 0) {
      throw new ValidationError('Offset must be non-negative');
    }

    if (minCount < 1) {
      throw new ValidationError('Minimum count must be at least 1');
    }

    const tags = await TagRepository.getAllTags({ limit, offset, minCount });

    logger.info(`Retrieved ${tags.length} tags`, { limit, offset, minCount });

    return {
      tags,
      total: tags.length
    };
  }

  /**
   * Get popular tags (most used)
   * @param {number} limit - Number of tags to return
   * @returns {Promise<Object>} Popular tags
   */
  async getPopularTags(limit = 10) {
    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100');
    }

    const tags = await TagRepository.getPopularTags(limit);

    logger.info(`Retrieved ${tags.length} popular tags`);

    return {
      tags,
      total: tags.length
    };
  }

  /**
   * Get trending tags (recently popular)
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Trending tags
   */
  async getTrendingTags(options = {}) {
    const { limit = 10, days = 7 } = options;

    // Validate options
    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100');
    }

    if (days < 1 || days > 365) {
      throw new ValidationError('Days must be between 1 and 365');
    }

    const tags = await TagRepository.getTrendingTags({ limit, days });

    logger.info(`Retrieved ${tags.length} trending tags (${days} days)`);

    return {
      tags,
      total: tags.length,
      period: `${days} days`
    };
  }

  /**
   * Search tags by name
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Object>} Matching tags
   */
  async searchTags(query, limit = 20) {
    // Validate query
    if (!query || query.trim().length === 0) {
      throw new ValidationError('Search query is required');
    }

    if (query.trim().length < 2) {
      throw new ValidationError('Search query must be at least 2 characters');
    }

    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100');
    }

    const tags = await TagRepository.searchTags(query.trim(), limit);

    return {
      tags,
      total: tags.length,
      query: query.trim()
    };
  }

  /**
   * Get tag details with recent discussions
   * @param {string} tagName - Tag name
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Tag details
   */
  async getTagDetails(tagName, options = {}) {
    // Validate tag name
    if (!tagName || tagName.trim().length === 0) {
      throw new ValidationError('Tag name is required');
    }

    const { limit = 10 } = options;

    // Validate limit
    if (limit < 1 || limit > 50) {
      throw new ValidationError('Limit must be between 1 and 50');
    }

    const tagDetails = await TagRepository.getTagDetails(tagName.trim().toLowerCase(), { limit });

    if (!tagDetails) {
      throw new NotFoundError(`Tag "${tagName}" not found`);
    }

    logger.info(`Retrieved details for tag "${tagName}"`);

    return tagDetails;
  }

  /**
   * Get related tags
   * @param {string} tagName - Tag name
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Object>} Related tags
   */
  async getRelatedTags(tagName, limit = 10) {
    // Validate tag name
    if (!tagName || tagName.trim().length === 0) {
      throw new ValidationError('Tag name is required');
    }

    // Validate limit
    if (limit < 1 || limit > 50) {
      throw new ValidationError('Limit must be between 1 and 50');
    }

    // Check if tag exists
    const tagDetails = await TagRepository.getTagDetails(tagName.trim().toLowerCase(), { limit: 1 });
    if (!tagDetails) {
      throw new NotFoundError(`Tag "${tagName}" not found`);
    }

    const tags = await TagRepository.getRelatedTags(tagName.trim().toLowerCase(), limit);

    return {
      tags,
      total: tags.length,
      baseTag: tagName.trim().toLowerCase()
    };
  }

  /**
   * Get tag statistics
   * @returns {Promise<Object>} Tag statistics
   */
  async getTagStatistics() {
    const stats = await TagRepository.getTagStatistics();

    logger.info('Retrieved tag statistics');

    return stats;
  }

  /**
   * Normalize tag name
   * @param {string} tagName - Raw tag name
   * @returns {string} Normalized tag name
   */
  normalizeTagName(tagName) {
    if (!tagName || typeof tagName !== 'string') {
      return '';
    }

    return tagName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[^a-z0-9-]/g, '') // Remove special characters except hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Validate and normalize multiple tags
   * @param {Array<string>} tags - Array of tag names
   * @returns {Array<string>} Normalized tags
   */
  validateAndNormalizeTags(tags) {
    if (!Array.isArray(tags)) {
      throw new ValidationError('Tags must be an array');
    }

    // Normalize and filter
    const normalizedTags = tags
      .map(tag => this.normalizeTagName(tag))
      .filter(tag => tag.length > 0)
      .filter((tag, index, self) => self.indexOf(tag) === index); // Remove duplicates

    // Limit to 10 tags
    if (normalizedTags.length > 10) {
      throw new ValidationError('Maximum 10 tags allowed');
    }

    // Validate tag length
    normalizedTags.forEach(tag => {
      if (tag.length < 2) {
        throw new ValidationError('Each tag must be at least 2 characters');
      }
      if (tag.length > 50) {
        throw new ValidationError('Each tag must be at most 50 characters');
      }
    });

    return normalizedTags;
  }
}

module.exports = new TagService();
