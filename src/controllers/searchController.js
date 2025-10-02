const searchService = require('../services/searchService');
const { db } = require('../config/database');
const logger = require('../utils/logger');
const { formatResponse, formatError, validateInput, safeParseInt } = require('../utils/helpers');

/**
 * High-performance Search Controller with optimized request handling
 * Features: Input validation, efficient caching, optimized queries
 */
class SearchController {
  /**
   * Basic search with advanced caching and optimization
   */
  static async basicSearch(req, res) {
    const startTime = process.hrtime.bigint();

    try {
      // Input validation and sanitization
      const { q: query, language = 'auto', page = 1, limit = 20 } = req.query;

      // Validate input parameters
      const validation = validateInput({
        query: { value: query, required: true, minLength: 1, maxLength: 200 },
        language: { value: language, enum: ['auto', 'english', 'lisu'] },
        page: { value: page, type: 'number', min: 1, max: 1000 },
        limit: { value: limit, type: 'number', min: 1, max: 100 }
      });

      if (!validation.isValid) {
        return res.status(400).json(formatError('Invalid input', validation.errors));
      }

      // Execute search with optimized service
      const result = await searchService.search(
        query.trim(),
        language,
        safeParseInt(page, 1),
        safeParseInt(limit, 20),
        req.user
      );

      // Calculate response time
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;

      // Add performance metrics to response
      result.performance = {
        responseTime: `${responseTime.toFixed(2)}ms`,
        cached: result.cached || false,
        timestamp: new Date().toISOString()
      };

      res.json(formatResponse(true, result));

    } catch (error) {
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;

      logger.error('Basic search failed:', {
        error: error.message,
        query: req.query.q,
        responseTime: `${responseTime.toFixed(2)}ms`,
        userId: req.user?.id
      });

      res.status(500).json(formatError('Search failed', error.message));
    }
  }

  /**
   * Advanced search with complex filtering and optimization
   */
  static async advancedSearch(req, res) {
    const startTime = process.hrtime.bigint();

    try {
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

      // Validate that at least one search criterion is provided
      const searchFields = [english_word, lisu_translation, part_of_speech, definition];
      if (!searchFields.some(field => field && field.trim())) {
        return res.status(400).json(formatError(
          'No search criteria provided',
          'Please provide at least one search criterion'
        ));
      }

      // Build optimized query with prepared statements
      const { query, params } = this.buildAdvancedSearchQuery({
        english_word, lisu_translation, part_of_speech, definition,
        has_etymology, created_by, date_from, date_to, page, limit
      });

      // Execute search and count queries in parallel
      const [searchResult, countResult] = await Promise.all([
        db.query(query.search, params.search),
        db.query(query.count, params.count)
      ]);

      const total = safeParseInt(countResult.rows[0]?.total, 0);
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;

      const result = {
        results: searchResult.rows,
        meta: {
          query: q,
          page: safeParseInt(page, 1),
          limit: safeParseInt(limit, 10),
          total,
          totalPages: Math.ceil(total / safeParseInt(limit, 10)),
          hasNext: (safeParseInt(page, 1) * safeParseInt(limit, 10)) < total,
          hasPrev: safeParseInt(page, 1) > 1,
          responseTime
        }
      };

      res.json(formatResponse(true, result));

    } catch (error) {
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;

      logger.error('Advanced search failed:', {
        error: error.message,
        responseTime: `${responseTime.toFixed(2)}ms`,
        userId: req.user?.id,
        searchCriteria: req.body
      });

      res.status(500).json(formatError('Advanced search failed', error.message));
    }
  }

  /**
   * Optimized search suggestions with caching
   */
  static async getSearchSuggestions(req, res) {
    try {
      const { q: query, limit = 10 } = req.query;

      // Fast exit for invalid queries
      if (!query || query.length < 2) {
        return res.json(formatResponse(true, { suggestions: [] }));
      }

      // Validate input
      const validation = validateInput({
        query: { value: query, maxLength: 100 },
        limit: { value: limit, type: 'number', min: 1, max: 50 }
      });

      if (!validation.isValid) {
        return res.status(400).json(formatError('Invalid input', validation.errors));
      }

      const result = await searchService.getSuggestions(query.trim(), safeParseInt(limit, 10));
      res.json(formatResponse(true, result));

    } catch (error) {
      logger.error('Search suggestions failed:', {
        error: error.message,
        query: req.query.q
      });
      res.status(500).json(formatError('Failed to get suggestions', error.message));
    }
  }

  /**
   * Get user search history with pagination
   */
  static async getSearchHistory(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const userId = req.user.id;

      const validation = validateInput({
        page: { value: page, type: 'number', min: 1, max: 1000 },
        limit: { value: limit, type: 'number', min: 1, max: 100 }
      });

      if (!validation.isValid) {
        return res.status(400).json(formatError('Invalid input', validation.errors));
      }

      const offset = (safeParseInt(page, 1) - 1) * safeParseInt(limit, 20);

      // Execute queries in parallel
      const [historyResult, countResult] = await Promise.all([
        db.query(`
          SELECT search_term, search_language, results_count, created_at
          FROM search_history
          WHERE user_id = $1
          ORDER BY created_at DESC
        `, [userId, safeParseInt(limit, 20), offset]),

        db.query(`
          SELECT COUNT(*) as total 
          FROM search_history 
          WHERE user_id = $1
        `, [userId])
      ]);

      const total = safeParseInt(countResult.rows[0]?.total, 0);

      res.json(formatResponse(true, {
        history: historyResult.rows,
        pagination: {
          page: safeParseInt(page, 1),
          limit: safeParseInt(limit, 20),
          total,
          totalPages: Math.ceil(total / safeParseInt(limit, 20)),
          hasNext: offset + safeParseInt(limit, 20) < total,
          hasPrev: safeParseInt(page, 1) > 1
        }
      }));

    } catch (error) {
      logger.error('Get search history failed:', {
        error: error.message,
        userId: req.user?.id
      });
      res.status(500).json(formatError('Failed to get search history', error.message));
    }
  }

  /**
   * Clear user search history
   */
  static async clearSearchHistory(req, res) {
    try {
      const userId = req.user.id;

      const result = await db.query(
        'DELETE FROM search_history WHERE user_id = $1 RETURNING COUNT(*)',
        [userId]
      );

      logger.info('Search history cleared', {
        userId,
        entriesRemoved: result.rowCount
      });

      res.json(formatResponse(true, {
        entriesRemoved: result.rowCount
      }, 'Search history cleared successfully'));

    } catch (error) {
      logger.error('Clear search history failed:', {
        error: error.message,
        userId: req.user?.id
      });
      res.status(500).json(formatError('Failed to clear search history', error.message));
    }
  }

  /**
   * Get search analytics for admin dashboard
   */
  static async getSearchAnalytics(req, res) {
    try {
      const { timeframe = '7d', limit = 100 } = req.query;

      const validation = validateInput({
        timeframe: { value: timeframe, enum: ['1h', '24h', '7d', '30d'] },
        limit: { value: limit, type: 'number', min: 1, max: 1000 }
      });

      if (!validation.isValid) {
        return res.status(400).json(formatError('Invalid input', validation.errors));
      }

      const analytics = await searchService.getAnalytics(timeframe, safeParseInt(limit, 10));
      res.json(formatResponse(true, analytics));

    } catch (error) {
      logger.error('Get search analytics failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get search analytics', error.message));
    }
  }

  /**
   * Build optimized advanced search query
   */
  static buildAdvancedSearchQuery(criteria) {
    const {
      english_word, lisu_translation, part_of_speech, definition,
      has_etymology, created_by, date_from, date_to, page, limit
    } = criteria;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    // Build WHERE conditions dynamically
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
      params.push(parseInt(created_by));
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

    const whereClause = conditions.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Optimized search query with relevance scoring
    const searchQuery = `
      SELECT w.*, u.email as created_by_email,
             CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_etymology
      FROM words w
      LEFT JOIN users u ON w.created_by = u.id
      LEFT JOIN etymology e ON w.id = e.word_id
      WHERE ${whereClause}
      ORDER BY w.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM words w
      LEFT JOIN etymology e ON w.id = e.word_id
      WHERE ${whereClause}
    `;

    return {
      query: {
        search: searchQuery,
        count: countQuery
      },
      params: {
        search: [...params, parseInt(limit), offset],
        count: params
      }
    };
  }
}

module.exports = SearchController;
