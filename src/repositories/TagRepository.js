const BaseRepository = require('./BaseRepository');
const logger = require('../utils/logger');

/**
 * TagRepository
 * Handles all tag-related database operations
 */
class TagRepository extends BaseRepository {
  constructor() {
    super('discussions'); // Tags are extracted from discussions table
  }

  /**
   * Get all tags with their usage counts
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Tags with usage counts
   */
  async getAllTags(options = {}) {
    const { limit, offset, minCount = 1 } = options;

    try {
      let query = `
        SELECT 
          UNNEST(tags) as tag_name,
          COUNT(*) as usage_count
        FROM discussions 
        WHERE tags IS NOT NULL 
          AND array_length(tags, 1) > 0
        GROUP BY UNNEST(tags)
        HAVING COUNT(*) >= $1
        ORDER BY usage_count DESC, tag_name ASC
      `;

      const params = [minCount];
      let paramIndex = 2;

      // Add pagination if provided
      if (limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(limit);
        paramIndex++;
      }

      if (offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(offset);
      }

      const result = await this.db.query(query, params);

      const tags = result.rows.map(row => ({
        name: row.tag_name,
        count: parseInt(row.usage_count)
      }));

      logger.info(`Retrieved ${tags.length} tags`);

      return tags;
    } catch (error) {
      logger.error('Error fetching all tags:', error);
      throw error;
    }
  }

  /**
   * Get popular tags (most used)
   * @param {number} limit - Number of tags to return
   * @returns {Promise<Array>} Popular tags
   */
  async getPopularTags(limit = 10) {
    try {
      const query = `
        SELECT 
          UNNEST(tags) as tag_name,
          COUNT(*) as usage_count
        FROM discussions 
        WHERE tags IS NOT NULL 
          AND array_length(tags, 1) > 0
        GROUP BY UNNEST(tags)
        ORDER BY usage_count DESC
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);

      const tags = result.rows.map(row => ({
        name: row.tag_name,
        count: parseInt(row.usage_count)
      }));

      logger.info(`Retrieved ${tags.length} popular tags`);

      return tags;
    } catch (error) {
      logger.error('Error fetching popular tags:', error);
      throw error;
    }
  }

  /**
   * Get trending tags (recently popular)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Trending tags
   */
  async getTrendingTags(options = {}) {
    const { limit = 10, days = 7 } = options;

    try {
      const query = `
        SELECT 
          UNNEST(tags) as tag_name,
          COUNT(*) as usage_count,
          MAX(created_at) as last_used
        FROM discussions 
        WHERE tags IS NOT NULL 
          AND array_length(tags, 1) > 0
          AND created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY UNNEST(tags)
        ORDER BY usage_count DESC, last_used DESC
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);

      const tags = result.rows.map(row => ({
        name: row.tag_name,
        count: parseInt(row.usage_count),
        lastUsed: row.last_used
      }));

      logger.info(`Retrieved ${tags.length} trending tags (${days} days)`);

      return tags;
    } catch (error) {
      logger.error('Error fetching trending tags:', error);
      throw error;
    }
  }

  /**
   * Search tags by name
   * @param {string} searchQuery - Search query
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} Matching tags
   */
  async searchTags(searchQuery, limit = 20) {
    try {
      const query = `
        SELECT 
          UNNEST(tags) as tag_name,
          COUNT(*) as usage_count
        FROM discussions 
        WHERE tags IS NOT NULL 
          AND array_length(tags, 1) > 0
        GROUP BY UNNEST(tags)
        HAVING UNNEST(tags) ILIKE $1
        ORDER BY usage_count DESC, tag_name ASC
        LIMIT $2
      `;

      const result = await this.db.query(query, [`%${searchQuery}%`, limit]);

      const tags = result.rows.map(row => ({
        name: row.tag_name,
        count: parseInt(row.usage_count)
      }));

      logger.info(`Tag search for "${searchQuery}" returned ${tags.length} results`);

      return tags;
    } catch (error) {
      logger.error('Error searching tags:', error);
      throw error;
    }
  }

  /**
   * Get tag details with recent discussions
   * @param {string} tagName - Tag name
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Tag details
   */
  async getTagDetails(tagName, options = {}) {
    const { limit = 10 } = options;

    try {
      // Get tag usage count
      const countQuery = `
        SELECT COUNT(*) as usage_count
        FROM discussions 
        WHERE tags @> ARRAY[$1]::text[]
      `;

      const countResult = await this.db.query(countQuery, [tagName]);
      const usageCount = parseInt(countResult.rows[0].usage_count);

      if (usageCount === 0) {
        return null;
      }

      // Get recent discussions with this tag
      const discussionsQuery = `
        SELECT 
          id,
          title,
          created_at,
          author_id,
          vote_count,
          answers_count
        FROM discussions 
        WHERE tags @> ARRAY[$1]::text[]
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const discussionsResult = await this.db.query(discussionsQuery, [tagName, limit]);

      logger.info(`Retrieved details for tag "${tagName}"`, { usageCount });

      return {
        name: tagName,
        count: usageCount,
        recentDiscussions: discussionsResult.rows
      };
    } catch (error) {
      logger.error('Error fetching tag details:', error);
      throw error;
    }
  }

  /**
   * Get related tags (tags that frequently appear together)
   * @param {string} tagName - Tag name
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} Related tags
   */
  async getRelatedTags(tagName, limit = 10) {
    try {
      const query = `
        WITH tag_discussions AS (
          SELECT UNNEST(tags) as other_tag
          FROM discussions
          WHERE tags @> ARRAY[$1]::text[]
            AND array_length(tags, 1) > 1
        )
        SELECT 
          other_tag as tag_name,
          COUNT(*) as co_occurrence_count
        FROM tag_discussions
        WHERE other_tag != $1
        GROUP BY other_tag
        ORDER BY co_occurrence_count DESC
        LIMIT $2
      `;

      const result = await this.db.query(query, [tagName, limit]);

      const tags = result.rows.map(row => ({
        name: row.tag_name,
        coOccurrenceCount: parseInt(row.co_occurrence_count)
      }));

      logger.info(`Retrieved ${tags.length} related tags for "${tagName}"`);

      return tags;
    } catch (error) {
      logger.error('Error fetching related tags:', error);
      throw error;
    }
  }

  /**
   * Get tag statistics
   * @returns {Promise<Object>} Tag statistics
   */
  async getTagStatistics() {
    try {
      const query = `
        WITH tag_counts AS (
          SELECT 
            UNNEST(tags) as tag_name,
            COUNT(*) as usage_count
          FROM discussions 
          WHERE tags IS NOT NULL 
            AND array_length(tags, 1) > 0
          GROUP BY UNNEST(tags)
        )
        SELECT 
          COUNT(*) as total_unique_tags,
          SUM(usage_count) as total_tag_usages,
          AVG(usage_count) as avg_usage_per_tag,
          MAX(usage_count) as max_usage,
          MIN(usage_count) as min_usage
        FROM tag_counts
      `;

      const result = await this.db.query(query);

      const stats = {
        totalUniqueTags: parseInt(result.rows[0].total_unique_tags) || 0,
        totalTagUsages: parseInt(result.rows[0].total_tag_usages) || 0,
        avgUsagePerTag: parseFloat(result.rows[0].avg_usage_per_tag) || 0,
        maxUsage: parseInt(result.rows[0].max_usage) || 0,
        minUsage: parseInt(result.rows[0].min_usage) || 0
      };

      logger.info('Retrieved tag statistics', stats);

      return stats;
    } catch (error) {
      logger.error('Error fetching tag statistics:', error);
      throw error;
    }
  }
}

module.exports = new TagRepository();
