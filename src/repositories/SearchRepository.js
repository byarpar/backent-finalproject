const BaseRepository = require('./BaseRepository');
const logger = require('../utils/logger');

/**
 * SearchRepository
 * Handles all search-related database operations
 */
class SearchRepository extends BaseRepository {
  constructor() {
    super('words'); // Primary table for search
  }

  /**
   * Search words with basic query
   * @param {string} query - Search query
   * @param {string} language - Language preference (auto, english, lisu)
   * @param {number} page - Page number
   * @param {number} limit - Results per page
   * @returns {Promise<Object>} Search results with pagination
   */
  async searchWords(query, language, page, limit) {
    const offset = (page - 1) * limit;

    try {
      let searchQuery = `
        SELECT 
          w.*,
          u.username as created_by_username,
          u.full_name as created_by_name,
          CASE 
            WHEN w.english_word ILIKE $1 THEN 3
            WHEN w.lisu_translation ILIKE $1 THEN 2
            WHEN w.definition ILIKE $2 THEN 1
            ELSE 0
          END as relevance_score
        FROM words w
        LEFT JOIN users u ON w.created_by = u.id
        WHERE 
          w.english_word ILIKE $2
          OR w.lisu_translation ILIKE $2
          OR w.definition ILIKE $2
      `;

      const params = [query, `%${query}%`];
      let paramIndex = 3;

      // Language-specific filtering
      if (language === 'english') {
        searchQuery += ` AND w.english_word IS NOT NULL`;
      } else if (language === 'lisu') {
        searchQuery += ` AND w.lisu_translation IS NOT NULL`;
      }

      searchQuery += `
        ORDER BY relevance_score DESC, w.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const result = await this.db.query(searchQuery, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total
        FROM words w
        WHERE 
          w.english_word ILIKE $1
          OR w.lisu_translation ILIKE $1
          OR w.definition ILIKE $1
      `;

      const countParams = [`%${query}%`];

      if (language === 'english') {
        countQuery += ` AND w.english_word IS NOT NULL`;
      } else if (language === 'lisu') {
        countQuery += ` AND w.lisu_translation IS NOT NULL`;
      }

      const countResult = await this.db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      logger.info(`Search completed: "${query}" (${language}) - ${result.rows.length}/${total} results`);

      return {
        results: result.rows,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error searching words:', error);
      throw error;
    }
  }

  /**
   * Advanced search with multiple criteria
   * @param {Object} criteria - Search criteria
   * @param {number} page - Page number
   * @param {number} limit - Results per page
   * @returns {Promise<Object>} Search results with pagination
   */
  async advancedSearch(criteria, page, limit) {
    const offset = (page - 1) * limit;

    try {
      const { conditions, params } = this._buildAdvancedSearchConditions(criteria);

      if (conditions.length === 0) {
        return {
          results: [],
          total: 0,
          page,
          limit,
          total_pages: 0
        };
      }

      const whereClause = conditions.join(' AND ');
      let paramIndex = params.length + 1;

      // Search query
      const searchQuery = `
        SELECT 
          w.*,
          u.username as created_by_username,
          u.full_name as created_by_name,
          CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_etymology
        FROM words w
        LEFT JOIN users u ON w.created_by = u.id
        LEFT JOIN etymology e ON w.id = e.word_id
        WHERE ${whereClause}
        ORDER BY w.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const searchParams = [...params, limit, offset];
      const result = await this.db.query(searchQuery, searchParams);

      // Count query
      const countQuery = `
        SELECT COUNT(*) as total
        FROM words w
        LEFT JOIN etymology e ON w.id = e.word_id
        WHERE ${whereClause}
      `;

      const countResult = await this.db.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      logger.info(`Advanced search completed - ${result.rows.length}/${total} results`);

      return {
        results: result.rows,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error in advanced search:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions (autocomplete)
   * @param {string} query - Search query
   * @param {number} limit - Maximum suggestions
   * @returns {Promise<Array>} Suggestions
   */
  async getSuggestions(query, limit) {
    try {
      const searchQuery = `
        SELECT DISTINCT
          english_word,
          lisu_translation,
          part_of_speech
        FROM words
        WHERE 
          english_word ILIKE $1
          OR lisu_translation ILIKE $1
        ORDER BY 
          CASE 
            WHEN english_word ILIKE $2 THEN 1
            WHEN lisu_translation ILIKE $2 THEN 2
            ELSE 3
          END,
          english_word ASC
        LIMIT $3
      `;

      const result = await this.db.query(searchQuery, [
        `%${query}%`,
        `${query}%`,
        limit
      ]);

      logger.info(`Generated ${result.rows.length} suggestions for "${query}"`);

      return result.rows;
    } catch (error) {
      logger.error('Error getting search suggestions:', error);
      throw error;
    }
  }

  /**
   * Save search to history
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @param {string} language - Language used
   * @param {number} resultsCount - Number of results
   * @returns {Promise<Object>} Saved search history entry
   */
  async saveSearchHistory(userId, query, language, resultsCount) {
    try {
      const result = await this.db.query(
        `INSERT INTO search_history (user_id, search_query, language, results_count)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, query, language, resultsCount]
      );

      logger.info(`Search history saved for user ${userId}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Error saving search history:', error);
      throw error;
    }
  }

  /**
   * Get user search history
   * @param {string} userId - User ID
   * @param {number} page - Page number
   * @param {number} limit - Results per page
   * @returns {Promise<Object>} Search history with pagination
   */
  async getSearchHistory(userId, page, limit) {
    const offset = (page - 1) * limit;

    try {
      const [historyResult, countResult] = await Promise.all([
        this.db.query(
          `SELECT search_query, language, results_count, created_at
           FROM search_history
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        ),
        this.db.query(
          `SELECT COUNT(*) as total 
           FROM search_history 
           WHERE user_id = $1`,
          [userId]
        )
      ]);

      const total = parseInt(countResult.rows[0].total);

      return {
        history: historyResult.rows,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error getting search history:', error);
      throw error;
    }
  }

  /**
   * Clear user search history
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of entries removed
   */
  async clearSearchHistory(userId) {
    try {
      const result = await this.db.query(
        'DELETE FROM search_history WHERE user_id = $1',
        [userId]
      );

      logger.info(`Cleared ${result.rowCount} search history entries for user ${userId}`);

      return result.rowCount;
    } catch (error) {
      logger.error('Error clearing search history:', error);
      throw error;
    }
  }

  /**
   * Get search analytics
   * @param {string} timeframe - Time period (1h, 24h, 7d, 30d)
   * @param {number} limit - Maximum results
   * @returns {Promise<Object>} Analytics data
   */
  async getSearchAnalytics(timeframe, limit) {
    try {
      // Convert timeframe to interval
      const intervalMap = {
        '1h': '1 hour',
        '24h': '24 hours',
        '7d': '7 days',
        '30d': '30 days'
      };

      const interval = intervalMap[timeframe] || '7 days';

      // Get top searches
      const topSearchesQuery = `
        SELECT 
          search_query,
          COUNT(*) as search_count,
          AVG(results_count) as avg_results
        FROM search_history
        WHERE created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY search_query
        ORDER BY search_count DESC
        LIMIT $1
      `;

      const topSearchesResult = await this.db.query(topSearchesQuery, [limit]);

      // Get search volume over time
      const volumeQuery = `
        SELECT 
          DATE_TRUNC('hour', created_at) as time_bucket,
          COUNT(*) as search_count
        FROM search_history
        WHERE created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY time_bucket
        ORDER BY time_bucket DESC
      `;

      const volumeResult = await this.db.query(volumeQuery);

      // Get language distribution
      const languageQuery = `
        SELECT 
          language,
          COUNT(*) as count
        FROM search_history
        WHERE created_at >= NOW() - INTERVAL '${interval}'
        GROUP BY language
      `;

      const languageResult = await this.db.query(languageQuery);

      // Get total statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total_searches,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(results_count) as avg_results_per_search
        FROM search_history
        WHERE created_at >= NOW() - INTERVAL '${interval}'
      `;

      const statsResult = await this.db.query(statsQuery);

      logger.info(`Retrieved search analytics for ${timeframe}`);

      return {
        topSearches: topSearchesResult.rows,
        searchVolume: volumeResult.rows,
        languageDistribution: languageResult.rows,
        statistics: statsResult.rows[0]
      };
    } catch (error) {
      logger.error('Error getting search analytics:', error);
      throw error;
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Build WHERE conditions for advanced search
   * @private
   */
  _buildAdvancedSearchConditions(criteria) {
    const {
      english_word,
      lisu_translation,
      part_of_speech,
      definition,
      has_etymology,
      created_by,
      date_from,
      date_to
    } = criteria;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (english_word?.trim()) {
      conditions.push(`w.english_word ILIKE $${paramIndex}`);
      params.push(`%${english_word.trim()}%`);
      paramIndex++;
    }

    if (lisu_translation?.trim()) {
      conditions.push(`w.lisu_translation ILIKE $${paramIndex}`);
      params.push(`%${lisu_translation.trim()}%`);
      paramIndex++;
    }

    if (part_of_speech) {
      conditions.push(`w.part_of_speech = $${paramIndex}`);
      params.push(part_of_speech);
      paramIndex++;
    }

    if (definition?.trim()) {
      conditions.push(`w.definition ILIKE $${paramIndex}`);
      params.push(`%${definition.trim()}%`);
      paramIndex++;
    }

    if (has_etymology !== undefined) {
      conditions.push(has_etymology ? `e.id IS NOT NULL` : `e.id IS NULL`);
    }

    if (created_by) {
      conditions.push(`w.created_by = $${paramIndex}`);
      params.push(created_by);
      paramIndex++;
    }

    if (date_from) {
      conditions.push(`w.created_at >= $${paramIndex}`);
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      conditions.push(`w.created_at <= $${paramIndex}`);
      params.push(date_to);
      paramIndex++;
    }

    return { conditions, params };
  }
}

module.exports = new SearchRepository();
