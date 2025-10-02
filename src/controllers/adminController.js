const User = require('../models/User');
const Word = require('../models/Word');
const { db } = require('../config/database');
const searchService = require('../services/searchService');
const { logAction } = require('../middlewares/audit');
const logger = require('../utils/logger');
const { formatResponse, formatError, paginate, safeParseInt } = require('../utils/helpers');

class AdminController {
  // Get dashboard statistics
  static async getDashboardStats(req, res) {
    try {
      // Get basic statistics
      const stats = await Promise.all([
        // Total words
        db.query('SELECT COUNT(*) as total_words FROM words'),

        // Total etymology entries
        db.query('SELECT COUNT(*) as total_etymology FROM etymology'),

        // Total users
        db.query('SELECT COUNT(*) as total_users FROM users'),

        // Active users
        db.query('SELECT COUNT(*) as active_users FROM users WHERE is_active = true'),

        // Admin users
        db.query('SELECT COUNT(*) as admin_users FROM users WHERE role = \'admin\''),

        // Inactive users
        db.query('SELECT COUNT(*) as inactive_users FROM users WHERE is_active = false'),

        // Recent activity (last 7 days)
        db.query(`
          SELECT COUNT(*) as recent_words 
          FROM words 
          WHERE created_at >= NOW() - INTERVAL '7 days'
        `),

        // Words without etymology
        db.query(`
          SELECT COUNT(*) as words_without_etymology
          FROM words w
          LEFT JOIN etymology e ON w.id = e.word_id
          WHERE e.id IS NULL
        `),

        // Most active parts of speech
        db.query(`
          SELECT 
            part_of_speech,
            COUNT(*) as count
          FROM words
          WHERE part_of_speech IS NOT NULL
          GROUP BY part_of_speech
          ORDER BY count DESC
          LIMIT 10
        `),

        // Recent searches (last 24 hours)
        db.query(`
          SELECT 
            search_query as search_term,
            COUNT(*) as search_count
          FROM search_history
          WHERE created_at >= NOW() - INTERVAL '1 day'
          GROUP BY search_query
          ORDER BY search_count DESC
          LIMIT 10
        `)
      ]);

      const [
        totalWords,
        totalEtymology,
        totalUsers,
        activeUsers,
        adminUsers,
        inactiveUsers,
        recentWords,
        wordsWithoutEtymology,
        partOfSpeechStats,
        recentSearches
      ] = stats;

      const dashboardData = {
        overview: {
          total_words: safeParseInt(totalWords.rows[0]?.total_words, 0),
          total_etymology: safeParseInt(totalEtymology.rows[0]?.total_etymology, 0),
          total_users: safeParseInt(totalUsers.rows[0]?.total_users, 0),
          active_users: safeParseInt(activeUsers.rows[0]?.active_users, 0),
          admin_users: safeParseInt(adminUsers.rows[0]?.admin_users, 0),
          inactive_users: safeParseInt(inactiveUsers.rows[0]?.inactive_users, 0),
          recent_words: safeParseInt(recentWords.rows[0]?.recent_words, 0),
          words_without_etymology: safeParseInt(wordsWithoutEtymology.rows[0]?.words_without_etymology, 0)
        },
        part_of_speech_distribution: partOfSpeechStats.rows,
        recent_searches: recentSearches.rows,
        performance: {
          query_time: Date.now(),
          server_time: new Date().toISOString()
        }
      };

      res.json(formatResponse(true, { dashboard: dashboardData }));

    } catch (error) {
      logger.error('Get dashboard stats failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get dashboard statistics', error.message));
    }
  }

  // Get all users with pagination
  static async getAllUsers(req, res) {
    try {
      logger.info('getAllUsers called with query:', req.query);
      const { page = 1, limit = 10, search, role, status } = req.query;
      const { limit: limitNum, offset } = paginate(safeParseInt(page, 1), safeParseInt(limit, 10));

      let conditions = [];
      let params = [];
      let paramIndex = 1;

      // Add search filter
      if (search) {
        conditions.push(`(email ILIKE $${paramIndex} OR username ILIKE $${paramIndex} OR full_name ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Add role filter
      if (role) {
        conditions.push(`role = $${paramIndex}`);
        params.push(role);
        paramIndex++;
      }

      // Add status filter
      if (status === 'active' || status === 'inactive') {
        conditions.push(`is_active = $${paramIndex}`);
        params.push(status === 'active');
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
      logger.info('About to execute count query:', countQuery, 'with params:', params);
      const countResult = await db.query(countQuery, params);
      const total = safeParseInt(countResult.rows[0]?.total, 0);
      logger.info('Count query result:', total);

      // Get users
      const usersQuery = `
        SELECT id, email, username, full_name, role, is_active, created_at, updated_at
        FROM users
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limitNum, offset);
      const usersResult = await db.query(usersQuery, params);

      const currentPage = safeParseInt(page, 1);
      const totalPages = Math.ceil(total / limitNum);

      res.json(formatResponse(true, {
        users: usersResult.rows,
        pagination: {
          page: currentPage,
          limit: limitNum,
          total: total,
          totalPages: totalPages,
          // Frontend compatibility fields
          total_users: total,
          total_pages: totalPages,
          per_page: limitNum,
          has_prev: currentPage > 1,
          has_next: currentPage < totalPages
        }
      }));

    } catch (error) {
      logger.error('Get all users failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get users', error.message));
    }
  }

  // Get all words for admin management
  static async getAllWords(req, res) {
    try {
      const { page = 1, limit = 10, search, part_of_speech, has_etymology, sort_by = 'created_at', order = 'desc' } = req.query;
      const { limit: limitNum, offset } = paginate(safeParseInt(page, 1), safeParseInt(limit, 10));

      // Validate sort parameters
      const validSortFields = ['created_at', 'english_word', 'lisu_translation', 'part_of_speech'];
      const validSortOrders = ['asc', 'desc'];

      const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
      const sortOrder = validSortOrders.includes(order.toLowerCase()) ? order.toUpperCase() : 'DESC';

      let conditions = [];
      let params = [];
      let paramIndex = 1;

      // Add search filter
      if (search) {
        conditions.push(`(w.english_word ILIKE $${paramIndex} OR w.lisu_translation ILIKE $${paramIndex} OR w.definition ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Add part of speech filter
      if (part_of_speech) {
        conditions.push(`w.part_of_speech = $${paramIndex}`);
        params.push(part_of_speech);
        paramIndex++;
      }

      // Add etymology filter
      if (has_etymology === 'true') {
        conditions.push(`e.id IS NOT NULL`);
      } else if (has_etymology === 'false') {
        conditions.push(`e.id IS NULL`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT w.id) as total 
        FROM words w
        LEFT JOIN etymology e ON w.id = e.word_id
        LEFT JOIN users u ON w.created_by = u.id
        ${whereClause}
      `;
      const countResult = await db.query(countQuery, params);
      const total = safeParseInt(countResult.rows[0]?.total, 0);

      // Get words
      const wordsQuery = `
        SELECT 
          w.*,
          u.email as created_by_email,
          CASE WHEN e.id IS NOT NULL THEN true ELSE false END as has_etymology,
          COUNT(DISTINCT e.id) as etymology_count
        FROM words w
        LEFT JOIN etymology e ON w.id = e.word_id
        LEFT JOIN users u ON w.created_by = u.id
        ${whereClause}
        GROUP BY w.id, u.email, e.id
        ORDER BY w.${sortField} ${sortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limitNum, offset);
      const wordsResult = await db.query(wordsQuery, params);

      const currentPage = safeParseInt(page, 1);
      const totalPages = Math.ceil(total / limitNum);

      res.json(formatResponse(true, {
        words: wordsResult.rows,
        pagination: {
          page: currentPage,
          limit: limitNum,
          total: total,
          totalPages: totalPages,
          // Frontend compatibility fields
          total_words: total,
          total_pages: totalPages,
          per_page: limitNum,
          has_prev: currentPage > 1,
          has_next: currentPage < totalPages
        }
      }));

    } catch (error) {
      logger.error('Get all words failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get words', error.message));
    }
  }

  // Update user status (activate/deactivate)
  static async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { is_active } = req.body;

      // Validate input
      if (typeof is_active !== 'boolean') {
        return res.status(400).json(formatError(
          'Invalid status',
          'is_active must be a boolean value'
        ));
      }

      // Check if user exists
      const existingUser = await db.query(
        'SELECT id, email, role FROM users WHERE id = $1',
        [id]
      );

      if (existingUser.rows.length === 0) {
        return res.status(404).json(formatError('User not found'));
      }

      // Prevent deactivating yourself
      if (safeParseInt(id) === req.user.id && !is_active) {
        return res.status(400).json(formatError(
          'Cannot deactivate yourself',
          'You cannot deactivate your own account'
        ));
      }

      // Update user status
      const result = await db.query(
        'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role, is_active',
        [is_active, id]
      );

      const user = result.rows[0];

      logger.info('User status updated by admin', {
        userId: id,
        email: user.email,
        is_active,
        adminId: req.user.id
      });

      res.json(formatResponse(true, { user }, 'User status updated successfully'));

    } catch (error) {
      logger.error('Update user status failed:', { error: error.message });
      res.status(500).json(formatError('Failed to update user status', error.message));
    }
  }

  // Update user role (admin only)
  static async updateUserRole(req, res) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      // Validate input
      const validRoles = ['user', 'moderator', 'admin'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json(formatError(
          'Invalid role',
          'Role must be one of: user, moderator, admin'
        ));
      }

      // Check if user exists
      const existingUser = await db.query(
        'SELECT id, email, role FROM users WHERE id = $1',
        [id]
      );

      if (existingUser.rows.length === 0) {
        return res.status(404).json(formatError('User not found'));
      }

      // Prevent changing your own role from admin
      if (safeParseInt(id) === req.user.id && req.user.role === 'admin' && role !== 'admin') {
        return res.status(400).json(formatError(
          'Cannot change your own admin role',
          'You cannot remove admin privileges from your own account'
        ));
      }

      // Update user role
      const result = await db.query(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role, is_active',
        [role, id]
      );

      const user = result.rows[0];

      logger.info('User role updated by admin', {
        userId: id,
        email: user.email,
        oldRole: existingUser.rows[0].role,
        newRole: role,
        adminId: req.user.id
      });

      res.json(formatResponse(true, { user }, 'User role updated successfully'));

    } catch (error) {
      logger.error('Update user role failed:', { error: error.message });
      res.status(500).json(formatError('Failed to update user role', error.message));
    }
  }

  // Delete user (admin only)
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;

      // Check if user exists and is not the current admin
      if (safeParseInt(id) === req.user.id) {
        return res.status(400).json(formatError(
          'Cannot delete yourself',
          'You cannot delete your own admin account'
        ));
      }

      const existingUser = await db.query(
        'SELECT id, email, role FROM users WHERE id = $1',
        [id]
      );

      if (existingUser.rows.length === 0) {
        return res.status(404).json(formatError('User not found'));
      }

      // Delete user
      await db.query('DELETE FROM users WHERE id = $1', [id]);

      logger.info('User deleted by admin', {
        deletedUserId: id,
        deletedUserEmail: existingUser.rows[0].email,
        adminId: req.user.id
      });

      res.json(formatResponse(true, null, 'User deleted successfully'));

    } catch (error) {
      logger.error('Delete user failed:', { error: error.message });
      res.status(500).json(formatError('Failed to delete user', error.message));
    }
  }

  // Get audit logs
  static async getAuditLogs(req, res) {
    try {
      const { page = 1, limit = 20, action, entity, userId } = req.query;
      const { limit: limitNum, offset } = paginate(safeParseInt(page, 1), safeParseInt(limit, 20));

      let conditions = [];
      let params = [];
      let paramIndex = 1;

      // Add filters
      if (action) {
        conditions.push(`action = $${paramIndex}`);
        params.push(action);
        paramIndex++;
      }

      if (entity) {
        conditions.push(`entity_type = $${paramIndex}`);
        params.push(entity);
        paramIndex++;
      }

      if (userId) {
        conditions.push(`user_id = $${paramIndex}`);
        params.push(userId);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`;
      const countResult = await db.query(countQuery, params);
      const total = safeParseInt(countResult.rows[0]?.total, 0);

      // Get audit logs
      const logsQuery = `
        SELECT 
          al.*,
          u.email as user_email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limitNum, offset);
      const logsResult = await db.query(logsQuery, params);

      const currentPage = safeParseInt(page, 1);
      const totalPages = Math.ceil(total / limitNum);

      res.json(formatResponse(true, {
        audit_logs: logsResult.rows,
        pagination: {
          page: currentPage,
          limit: limitNum,
          total: total,
          totalPages: totalPages,
          // Frontend compatibility fields
          total_logs: total,
          total_pages: totalPages,
          per_page: limitNum,
          has_prev: currentPage > 1,
          has_next: currentPage < totalPages
        }
      }));

    } catch (error) {
      logger.error('Get audit logs failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get audit logs', error.message));
    }
  }

  // Advanced admin search
  static async adminSearch(req, res) {
    try {
      const { query, type = 'all', filters = {} } = req.body;

      if (!query || query.trim().length === 0) {
        return res.status(400).json(formatError(
          'Search query required',
          'Please provide a search query'
        ));
      }

      const results = {
        words: [],
        users: [],
        etymology: [],
        audit_logs: []
      };

      // Search words
      if (type === 'all' || type === 'words') {
        const wordsQuery = `
          SELECT w.*, u.email as created_by_email
          FROM words w
          LEFT JOIN users u ON w.created_by = u.id
          WHERE w.english_word ILIKE $1 
             OR w.lisu_translation ILIKE $1 
             OR w.definition ILIKE $1
          ORDER BY w.created_at DESC
          LIMIT 20
        `;
        const wordsResult = await db.query(wordsQuery, [`%${query}%`]);
        results.words = wordsResult.rows;
      }

      // Search users  
      if (type === 'all' || type === 'users') {
        const usersQuery = `
          SELECT id, email, role, is_active, created_at
          FROM users
          WHERE email ILIKE $1
          ORDER BY created_at DESC
          LIMIT 20
        `;
        const usersResult = await db.query(usersQuery, [`%${query}%`]);
        results.users = usersResult.rows;
      }

      // Search etymology
      if (type === 'all' || type === 'etymology') {
        const etymologyQuery = `
          SELECT e.*, w.english_word, w.lisu_translation
          FROM etymology e
          LEFT JOIN words w ON e.word_id = w.id
          WHERE e.origin ILIKE $1 
             OR e.historical_development ILIKE $1
             OR w.english_word ILIKE $1
          ORDER BY e.created_at DESC
          LIMIT 20
        `;
        const etymologyResult = await db.query(etymologyQuery, [`%${query}%`]);
        results.etymology = etymologyResult.rows;
      }

      res.json(formatResponse(true, { results }));

    } catch (error) {
      logger.error('Admin search failed:', { error: error.message });
      res.status(500).json(formatError('Failed to perform admin search', error.message));
    }
  }

  // Export data (admin only)
  static async exportData(req, res) {
    try {
      const { type } = req.params;

      let data;
      let filename;

      switch (type) {
        case 'words':
          const wordsResult = await db.query(`
            SELECT w.*, u.email as created_by_email
            FROM words w
            LEFT JOIN users u ON w.created_by = u.id
            ORDER BY w.created_at DESC
          `);
          data = wordsResult.rows;
          filename = `words_export_${new Date().toISOString().split('T')[0]}.json`;
          break;

        case 'etymology':
          const etymologyResult = await db.query(`
            SELECT e.*, w.english_word, w.lisu_translation, u.email as created_by_email
            FROM etymology e
            LEFT JOIN words w ON e.word_id = w.id
            LEFT JOIN users u ON e.created_by = u.id
            ORDER BY e.created_at DESC
          `);
          data = etymologyResult.rows;
          filename = `etymology_export_${new Date().toISOString().split('T')[0]}.json`;
          break;

        case 'users':
          const usersResult = await db.query(`
            SELECT id, email, role, is_active, created_at, updated_at
            FROM users
            ORDER BY created_at DESC
          `);
          data = usersResult.rows;
          filename = `users_export_${new Date().toISOString().split('T')[0]}.json`;
          break;

        default:
          return res.status(400).json(formatError(
            'Invalid export type',
            'Supported types: words, etymology, users'
          ));
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json({
        exportedAt: new Date().toISOString(),
        type,
        count: data.length,
        data
      });

      logger.info('Data exported by admin', {
        type,
        count: data.length,
        adminId: req.user.id
      });

    } catch (error) {
      logger.error('Export data failed:', { error: error.message });
      res.status(500).json(formatError('Failed to export data', error.message));
    }
  }

  // Get system health (admin only)
  static async getSystemHealth(req, res) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      };

      // Test database connection
      try {
        await db.query('SELECT 1');
        health.database = 'connected';
      } catch (dbError) {
        health.database = 'disconnected';
        health.status = 'unhealthy';
      }

      res.json(formatResponse(true, { health }));

    } catch (error) {
      logger.error('Get system health failed:', { error: error.message });
      res.status(500).json(formatError('Failed to get system health', error.message));
    }
  }

  // Bulk operations on words
  static async bulkWords(req, res) {
    try {
      const { action, wordIds } = req.body;
      const userId = req.user.id;

      if (!Array.isArray(wordIds) || wordIds.length === 0) {
        return res.status(400).json(formatError('Word IDs are required'));
      }

      let result;
      const timestamp = new Date();

      switch (action) {
        case 'delete':
          result = await db.query(
            'DELETE FROM words WHERE id = ANY($1::int[]) RETURNING id',
            [wordIds]
          );

          // Log the action - fix the logAction call
          try {
            await logAction(req.user.id, `Bulk deleted ${result.rowCount} words`, 'words', null, null, null, req);
          } catch (auditError) {
            logger.error('Audit logging failed:', auditError);
          }
          break;

        case 'activate':
          result = await db.query(
            'UPDATE words SET is_active = true, updated_at = $1 WHERE id = ANY($2::int[]) RETURNING id',
            [timestamp, wordIds]
          );
          break;

        case 'deactivate':
          result = await db.query(
            'UPDATE words SET is_active = false, updated_at = $1 WHERE id = ANY($2::int[]) RETURNING id',
            [timestamp, wordIds]
          );
          break;

        default:
          return res.status(400).json(formatError('Invalid action'));
      }

      res.json(formatResponse(true, {
        message: `Successfully ${action}d ${result.rowCount} words`,
        affected_count: result.rowCount
      }));

    } catch (error) {
      logger.error('Bulk words operation failed:', { error: error.message, action: req.body.action });
      res.status(500).json(formatError('Bulk operation failed', error.message));
    }
  }

  // Selected file: 
  static async importWords(req, res) {
    try {
      const { words, options = {} } = req.body;
      const userId = req.user.id;

      if (!Array.isArray(words) || words.length === 0) {
        return res.status(400).json(formatError('Words array is required'));
      }

      const {
        mode = 'skip', // 'skip', 'update', 'replace'
        validateOnly = false,
        clearDatabase = false
      } = options;

      let imported = 0;
      let skipped = 0;
      let updated = 0;
      const errors = [];

      // Clear database if requested
      if (clearDatabase && !validateOnly) {
        await db.query('DELETE FROM words');
        // Log the action
        try {
          await logAction(req.user.id, 'Cleared all words from database before import', 'words', null, null, null, req);
        } catch (auditError) {
          logger.error('Audit logging failed:', auditError);
        }
      }

      // If validate only, we'll process but not actually import
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        try {
          // Validation only mode - just check for errors
          if (validateOnly) {
            // Validate required fields
            if (!word.english_word || !word.lisu_translation) {
              errors.push({
                row: i + 1,
                word: word.english_word || 'Unknown',
                error: 'Missing required fields'
              });
            }
            continue;
          }

          // Check if word already exists
          const existing = await db.query(
            'SELECT id FROM words WHERE LOWER(english_word) = LOWER($1)',
            [word.english_word]
          );

          if (existing.rows.length > 0) {
            if (mode === 'skip') {
              skipped++;
              continue;
            } else if (mode === 'update' || mode === 'replace') {
              // Update existing word
              await db.query(`
                UPDATE words SET 
                  lisu_translation = $1,
                  part_of_speech = $2,
                  definition = $3,
                  example_usage = $4,
                  phonetic = $5,
                  synonyms = $6,
                  antonyms = $7,
                  updated_at = NOW()
                WHERE LOWER(english_word) = LOWER($8)
              `, [
                word.lisu_translation,
                word.part_of_speech || null,
                word.definition || null,
                word.example_usage || null,
                word.phonetic || null,
                word.synonyms || null,
                word.antonyms || null,
                word.english_word
              ]);
              updated++;
              continue;
            }
          }

          // Create new word
          await Word.create({
            english_word: word.english_word,
            lisu_translation: word.lisu_translation,
            part_of_speech: word.part_of_speech || null,
            definition: word.definition || null,
            example_usage: word.example_usage || null,
            phonetic: word.phonetic || null,
            synonyms: word.synonyms || null,
            antonyms: word.antonyms || null
          }, userId);

          imported++;
        } catch (wordError) {
          errors.push({
            row: i + 1,
            word: word.english_word,
            error: wordError.message
          });
        }
      }

      // Log the import action - fix the logAction call
      if (!validateOnly) {
        try {
          const actionMessage = clearDatabase
            ? `Replaced all words with ${imported} new words from Excel (${updated} updated, ${skipped} skipped)`
            : `Imported ${imported} words from Excel (${updated} updated, ${skipped} skipped)`;
          await logAction(req.user.id, actionMessage, 'words', null, null, null, req);
        } catch (auditError) {
          // Don't fail the import if audit logging fails
          logger.error('Audit logging failed:', auditError);
        }
      }

      const message = validateOnly
        ? `Validation completed: ${words.length - errors.length} valid words, ${errors.length} errors`
        : `Import completed: ${imported} words imported, ${updated} updated, ${skipped} skipped`;

      res.json(formatResponse(true, {
        message,
        imported,
        updated,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
        validateOnly
      }));

    } catch (error) {
      logger.error('Import words failed:', { error: error.message });
      res.status(500).json(formatError('Import failed', error.message));
    }
  }

  // Export words to Excel
  static async exportWords(req, res) {
    try {
      const {
        format = 'xlsx',
        include_etymology = false,
        include_metadata = true,
        fields,
        word_ids
      } = req.query;

      // Handle fields parameter - could be array or comma-separated string
      let selectedFields = ['english_word', 'lisu_translation', 'part_of_speech', 'definition']; // default

      if (fields) {
        if (Array.isArray(fields)) {
          selectedFields = fields;
        } else if (typeof fields === 'string') {
          selectedFields = fields.split(',');
        }
      }

      // Build the SELECT query based on requested fields
      const validFields = [
        'id', 'english_word', 'lisu_translation', 'part_of_speech',
        'definition', 'example_usage', 'phonetic', 'synonyms', 'antonyms',
        'created_at', 'updated_at'
      ];

      const safeFields = selectedFields.filter(field => validFields.includes(field));

      if (safeFields.length === 0) {
        return res.status(400).json(formatError('No valid fields specified'));
      }

      let query = `SELECT ${safeFields.join(', ')} FROM words`;
      let queryParams = [];

      // Filter by specific word IDs if provided
      if (word_ids) {
        const wordIdArray = Array.isArray(word_ids) ? word_ids : word_ids.split(',').map(id => parseInt(id));
        query += ' WHERE id = ANY($1::int[])';
        queryParams.push(wordIdArray);
      }

      query += ' ORDER BY english_word ASC';

      const result = await db.query(query, queryParams);
      const words = result.rows;

      const exportData = {
        words,
        metadata: include_metadata === 'true' ? {
          exported_at: new Date().toISOString(),
          exported_by: req.user.email,
          total_words: words.length,
          fields: safeFields,
          format
        } : undefined
      };

      // Add etymology data if requested
      if (include_etymology === 'true' && words.length > 0) {
        const wordIds = words.map(w => w.id);
        const etymologyResult = await db.query(`
          SELECT 
            e.*,
            w.english_word
          FROM etymology e
          JOIN words w ON e.word_id = w.id
          WHERE e.word_id = ANY($1::int[])
          ORDER BY w.english_word ASC
        `, [wordIds]);

        exportData.etymology = etymologyResult.rows;
      }

      // Log the export action - fix the logAction call
      try {
        await logAction(req.user.id, `Exported ${words.length} words to ${format.toUpperCase()}`, 'words', null, null, null, req);
      } catch (auditError) {
        // Don't fail the export if audit logging fails
        logger.error('Audit logging failed:', auditError);
      }

      res.json(formatResponse(true, exportData));

    } catch (error) {
      logger.error('Export words failed:', { error: error.message });
      res.status(500).json(formatError('Export failed', error.message));
    }
  }
}

module.exports = AdminController;
