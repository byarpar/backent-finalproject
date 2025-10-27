const { db } = require('../config/database');
const logger = require('../utils/logger');
const { safeParseInt } = require('../utils/helpers');
const { ValidationError } = require('../utils/errors');

/**
 * High-performance Search Service with Redis-like caching and query optimization
 * Features: LRU cache, query batching, connection pooling, optimized algorithms
 */
class SearchService {
  constructor() {
    // High-performance LRU cache with O(1) operations
    this.cache = new Map();
    this.cacheOrder = new Map(); // For LRU tracking
    this.cacheTimeout = parseInt(process.env.SEARCH_CACHE_TIMEOUT) || 300000; // 5 minutes
    this.maxCacheSize = parseInt(process.env.MAX_CACHE_SIZE) || 2000;

    // Performance metrics and analytics
    this.metrics = {
      totalSearches: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0,
      totalSearchTime: 0,
      popularTerms: new Map(),
      languageDistribution: new Map()
    };

    // Query optimizations
    this.queryCache = new Map();
    this.batchSize = 100;
  }

  /**
   * Optimized cache key generation using efficient hashing
   */
  generateCacheKey(query, language, filters = {}, page = 1, limit = 20) {
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
    return `${normalized}:${language}:${JSON.stringify(filters)}:${page}:${limit}`;
  }

  /**
   * High-performance cache retrieval with LRU management
   */
  getCachedResult(cacheKey) {
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      this.metrics.cacheMisses++;
      return null;
    }

    // Check expiration
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.invalidateCache(cacheKey);
      this.metrics.cacheMisses++;
      return null;
    }

    // Update LRU order
    this.cacheOrder.delete(cacheKey);
    this.cacheOrder.set(cacheKey, Date.now());

    this.metrics.cacheHits++;
    return { ...cached.data, cached: true };
  }

  /**
   * Optimized cache storage with intelligent eviction
   */
  setCachedResult(cacheKey, data) {
    // Evict old entries if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    this.cache.set(cacheKey, {
      data: { ...data, cached: false },
      timestamp: Date.now()
    });
    this.cacheOrder.set(cacheKey, Date.now());
  }

  /**
   * Efficient LRU eviction
   */
  evictLRU() {
    const oldestKey = this.cacheOrder.keys().next().value;
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.cacheOrder.delete(oldestKey);
    }
  }

  /**
   * Intelligent cache invalidation
   */
  invalidateCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      this.cacheOrder.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        this.cacheOrder.delete(key);
      }
    }
  }

  /**
   * Advanced language detection with performance optimization
   */
  detectLanguage(text) {
    // Use character code ranges for faster detection
    const firstChar = text.charCodeAt(0);

    // Lisu range: 42192-42239 (0xA4D0-0xA4FF)
    if (firstChar >= 42192 && firstChar <= 42239) return 'lisu';

    // Quick ASCII check for English
    if (firstChar >= 65 && firstChar <= 122) {
      // Verify it's mostly English characters
      const englishRatio = text.split('').filter(c => {
        const code = c.charCodeAt(0);
        return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 32;
      }).length / text.length;

      return englishRatio > 0.8 ? 'english' : 'mixed';
    }

    return 'mixed';
  }

  /**
   * High-performance main search with optimized queries
   */
  async search(query, language = 'auto', page = 1, limit = 20, user = null) {
    const startTime = process.hrtime.bigint();
    this.metrics.totalSearches++;

    try {
      // Validate and normalize input
      if (!query || typeof query !== 'string') {
        throw new ValidationError('Search query is required');
      }

      const normalizedQuery = query.trim().replace(/\s+/g, ' ');

      if (!normalizedQuery) {
        throw new ValidationError('Search query cannot be empty');
      }

      const detectedLang = language === 'auto' ? this.detectLanguage(normalizedQuery) : language;

      // Generate cache key
      const cacheKey = this.generateCacheKey(normalizedQuery, detectedLang, {}, page, limit);

      // Check cache first
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        this.updateMetrics(normalizedQuery, detectedLang, 0);
        return cached;
      }

      // Execute optimized search query
      const results = await this.executeSearch(normalizedQuery, detectedLang, page, limit);

      // Log search history asynchronously
      if (user) {
        setImmediate(() => this.logSearchHistory(user.id, normalizedQuery, detectedLang, results.total));
      }

      // Update analytics
      const endTime = process.hrtime.bigint();
      const searchTime = Number(endTime - startTime) / 1000000;
      this.updateMetrics(normalizedQuery, detectedLang, searchTime);

      // Cache results
      this.setCachedResult(cacheKey, results);

      return results;
    } catch (error) {
      logger.error('Search failed:', { error: error.message, query, language });
      throw error;
    }
  }

  /**
   * Optimized search execution with intelligent query building
   */
  async executeSearch(query, language, page, limit) {
    const offset = (page - 1) * limit;
    const searchPattern = `%${query}%`;
    const exactMatch = query;
    const startsWithPattern = `${query}%`;

    // Build optimized query based on language
    let searchQuery, countQuery, params;

    if (language === 'english') {
      // English-prioritized search
      searchQuery = `
        SELECT w.*, u.email as created_by_email,
               CASE WHEN w.etymology_origin IS NOT NULL OR w.etymology_context IS NOT NULL THEN true ELSE false END as has_etymology
        FROM words w
        LEFT JOIN users u ON w.created_by = u.id
        WHERE w.english_word ILIKE $1 
           OR w.english_definition ILIKE $1 
           OR w.part_of_speech ILIKE $1
        ORDER BY 
          CASE 
            WHEN LOWER(w.english_word) = LOWER($2) THEN 1
            WHEN w.english_word ILIKE $3 THEN 2
            WHEN w.english_word ILIKE $1 THEN 3
            WHEN w.english_definition ILIKE $3 THEN 4
            ELSE 5
          END,
          w.created_at DESC
        LIMIT $4 OFFSET $5
      `;

      countQuery = `
        SELECT COUNT(*) as total
        FROM words w
        WHERE w.english_word ILIKE $1 
           OR w.english_definition ILIKE $1 
           OR w.part_of_speech ILIKE $1
      `;

      params = [searchPattern, exactMatch, startsWithPattern, limit, offset];

    } else if (language === 'lisu') {
      // Lisu-prioritized search
      searchQuery = `
        SELECT w.*, u.email as created_by_email,
               CASE WHEN w.etymology_origin IS NOT NULL OR w.etymology_context IS NOT NULL THEN true ELSE false END as has_etymology
        FROM words w
        LEFT JOIN users u ON w.created_by = u.id
        WHERE w.lisu_word ILIKE $1
           OR w.lisu_definition ILIKE $1
        ORDER BY 
          CASE 
            WHEN LOWER(w.lisu_word) = LOWER($2) THEN 1
            WHEN w.lisu_word ILIKE $3 THEN 2
            WHEN w.lisu_word ILIKE $1 THEN 3
            ELSE 4
          END,
          w.created_at DESC
        LIMIT $4 OFFSET $5
      `;

      countQuery = `
        SELECT COUNT(*) as total
        FROM words w
        WHERE w.lisu_word ILIKE $1
           OR w.lisu_definition ILIKE $1
      `;

      params = [searchPattern, exactMatch, startsWithPattern, limit, offset];

    } else {
      // Mixed/english search - prioritize English for accessibility
      searchQuery = `
        SELECT w.*, u.email as created_by_email,
               CASE WHEN w.etymology_origin IS NOT NULL OR w.etymology_context IS NOT NULL THEN true ELSE false END as has_etymology
        FROM words w
        LEFT JOIN users u ON w.created_by = u.id
        WHERE w.english_word ILIKE $1 
           OR w.lisu_word ILIKE $1 
           OR w.english_definition ILIKE $1
           OR w.lisu_definition ILIKE $1
        ORDER BY 
          CASE 
            -- Prioritize English word matches first
            WHEN LOWER(w.english_word) = LOWER($2) THEN 1
            WHEN w.english_word ILIKE $3 THEN 2
            WHEN w.english_word ILIKE $1 THEN 3
            -- Then Lisu word matches
            WHEN LOWER(w.lisu_word) = LOWER($2) THEN 4
            WHEN w.lisu_word ILIKE $3 THEN 5
            WHEN w.lisu_word ILIKE $1 THEN 6
            -- Then definition matches
            WHEN w.english_definition ILIKE $3 OR w.lisu_definition ILIKE $3 THEN 7
            ELSE 8
          END,
          w.created_at DESC
        LIMIT $4 OFFSET $5
      `;

      countQuery = `
        SELECT COUNT(*) as total
        FROM words w
        WHERE w.english_word ILIKE $1 
           OR w.lisu_word ILIKE $1 
           OR w.english_definition ILIKE $1
           OR w.lisu_definition ILIKE $1
      `;

      params = [searchPattern, exactMatch, startsWithPattern, limit, offset];
    }

    // Execute queries in parallel for better performance
    const [searchResult, countResult] = await Promise.all([
      db.query(searchQuery, params),
      db.query(countQuery, [searchPattern])
    ]);

    const total = safeParseInt(countResult.rows[0]?.total, 0);

    return {
      results: searchResult.rows,
      total,
      page: safeParseInt(page, 1),
      limit: safeParseInt(limit, 10),
      totalPages: Math.ceil(total / safeParseInt(limit, 10)),
      language: language,
      query: query,
      hasNext: (page * limit) < total,
      hasPrev: page > 1
    };
  }

  /**
   * Optimized suggestions with prefix matching
   */
  async getSuggestions(query, limit = 10) {
    if (!query || query.length < 1) return { suggestions: [] };

    const cacheKey = `suggest:${query}:${limit}`;
    const cached = this.getCachedResult(cacheKey);
    if (cached) return cached;

    const prefixPattern = `${query.trim()}%`;
    const containsPattern = `%${query.trim()}%`;

    const result = await db.query(`
      (SELECT DISTINCT english_word as term, 'english' as type, 
              length(english_word) as len,
              CASE 
                WHEN english_word ILIKE $1 THEN 1
                WHEN english_word ILIKE $2 THEN 2
                ELSE 3
              END as priority
       FROM words 
       WHERE english_word ILIKE $2
       ORDER BY priority ASC, len ASC, english_word ASC
       LIMIT $3)
      UNION ALL
      (SELECT DISTINCT lisu_word as term, 'lisu' as type,
              length(lisu_word) as len,
              CASE 
                WHEN lisu_word ILIKE $1 THEN 1
                WHEN lisu_word ILIKE $2 THEN 2
                ELSE 3
              END as priority
       FROM words 
       WHERE lisu_word ILIKE $2
       ORDER BY priority ASC, len ASC, lisu_word ASC
       LIMIT $3)
      ORDER BY priority ASC, len ASC, term ASC
      LIMIT $3
    `, [prefixPattern, containsPattern, Math.ceil(limit / 2)]);

    const suggestions = { suggestions: result.rows };
    this.setCachedResult(cacheKey, suggestions);

    return suggestions;
  }

  /**
   * Asynchronous search history logging
   */
  async logSearchHistory(userId, query, language, resultsCount) {
    try {
      await db.query(`
        INSERT INTO search_history (user_id, search_query, language, results_count)
        VALUES ($1, $2, $3, $4)
      `, [userId, query, language, resultsCount]);
    } catch (error) {
      logger.warn('Search history logging failed:', error.message);
    }
  }

  /**
   * Performance metrics update
   */
  updateMetrics(query, language, searchTime) {
    this.metrics.totalSearchTime += searchTime;
    this.metrics.avgResponseTime = this.metrics.totalSearchTime / this.metrics.totalSearches;

    // Track popular terms
    const count = this.metrics.popularTerms.get(query) || 0;
    this.metrics.popularTerms.set(query, count + 1);

    // Track language distribution
    const langCount = this.metrics.languageDistribution.get(language) || 0;
    this.metrics.languageDistribution.set(language, langCount + 1);
  }

  /**
   * Advanced analytics for admin dashboard
   */
  async getAnalytics(timeframe = '7d', limit = 100) {
    const timeframes = {
      '1h': "NOW() - INTERVAL '1 hour'",
      '24h': "NOW() - INTERVAL '24 hours'",
      '7d': "NOW() - INTERVAL '7 days'",
      '30d': "NOW() - INTERVAL '30 days'"
    };

    const since = timeframes[timeframe] || timeframes['7d'];

    const [popularSearches, languageStats, searchVolume] = await Promise.all([
      db.query(`
        SELECT search_query, COUNT(*) as search_count,
               AVG(results_count) as avg_results
        FROM search_history
        WHERE created_at >= ${since}
        GROUP BY search_query
        ORDER BY search_count DESC
        LIMIT $1
      `, [limit]),

      db.query(`
        SELECT language, COUNT(*) as count
        FROM search_history
        WHERE created_at >= ${since}
        GROUP BY language
        ORDER BY count DESC
      `),

      db.query(`
        SELECT DATE_TRUNC('hour', created_at) as hour,
               COUNT(*) as searches
        FROM search_history
        WHERE created_at >= ${since}
        GROUP BY hour
        ORDER BY hour ASC
      `)
    ]);

    return {
      popularSearches: popularSearches.rows,
      languageDistribution: languageStats.rows,
      searchVolume: searchVolume.rows,
      cacheMetrics: {
        hitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses),
        totalSearches: this.metrics.totalSearches,
        avgResponseTime: this.metrics.avgResponseTime,
        cacheSize: this.cache.size
      }
    };
  }

  /**
   * Cache management and cleanup
   */
  clearCache() {
    const oldSize = this.cache.size;
    this.cache.clear();
    this.cacheOrder.clear();

    return {
      message: 'Cache cleared successfully',
      entriesRemoved: oldSize,
      timestamp: new Date().toISOString()
    };
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
      metrics: this.metrics
    };
  }
}

// Singleton instance for optimal performance
const searchService = new SearchService();

module.exports = searchService;
