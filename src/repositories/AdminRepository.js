/**
 * Admin Repository
 * Data access layer for admin-specific operations
 */

const BaseRepository = require('./BaseRepository');
const { NotFoundError } = require('../utils');
const logger = require('../utils/logger');

class AdminRepository extends BaseRepository {
  constructor() {
    super('admin'); // Not a real table, just for consistency
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    try {
      const stats = await Promise.all([
        this.db.query('SELECT COUNT(*) as total FROM users'),
        this.db.query('SELECT COUNT(*) as total FROM users WHERE is_active = true'),
        this.db.query('SELECT COUNT(*) as total FROM users WHERE is_active = false'),
        this.db.query('SELECT COUNT(*) as total FROM discussions'),
        this.db.query('SELECT COUNT(*) as total FROM answers')
      ]);

      const [totalUsers, activeUsers, inactiveUsers, totalDiscussions, totalAnswers] = stats;

      return {
        overview: {
          total_users: parseInt(totalUsers.rows[0]?.total || 0),
          active_users: parseInt(activeUsers.rows[0]?.total || 0),
          inactive_users: parseInt(inactiveUsers.rows[0]?.total || 0),
          total_discussions: parseInt(totalDiscussions.rows[0]?.total || 0),
          total_answers: parseInt(totalAnswers.rows[0]?.total || 0)
        },
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Error fetching dashboard stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all reports with filters
   */
  async getReports(filters = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        type,
        sortBy = 'created_at',
        order = 'desc'
      } = filters;

      let query = `
        SELECT 
          r.*,
          reporter.username as reporter_username,
          reporter.email as reporter_email,
          d.title as discussion_title,
          d.content as discussion_content,
          author.username as author_username,
          author.id as author_id
        FROM discussion_reports r
        LEFT JOIN users reporter ON r.reporter_id = reporter.id
        LEFT JOIN discussions d ON r.discussion_id = d.id
        LEFT JOIN users author ON d.author_id = author.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (status) {
        query += ` AND r.status = $${paramCount++}`;
        params.push(status);
      }

      if (type) {
        query += ` AND r.reason = $${paramCount++}`;
        params.push(type);
      }

      query += ` ORDER BY r.${sortBy} ${order.toUpperCase()}`;
      query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      params.push(parseInt(limit), offset);

      const result = await this.db.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM discussion_reports WHERE 1=1';
      const countParams = [];
      let countParamCount = 1;

      if (status) {
        countQuery += ` AND status = $${countParamCount++}`;
        countParams.push(status);
      }

      if (type) {
        countQuery += ` AND reason = $${countParamCount++}`;
        countParams.push(type);
      }

      const countResult = await this.db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      return {
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
          total_pages: Math.ceil(total / parseInt(limit)), // Legacy support
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      };
    } catch (error) {
      // If table doesn't exist, return empty data
      if (error.code === '42P01' || error.details?.code === '42P01') {
        logger.warn('discussion_reports table does not exist, returning empty data');
        return {
          data: [],
          pagination: {
            page: parseInt(filters.page || 1),
            limit: parseInt(filters.limit || 20),
            total: 0,
            totalPages: 0,
            total_pages: 0, // Legacy support
            hasNext: false,
            hasPrev: false
          }
        };
      }
      logger.error('Error fetching discussion reports', { error: error.message });
      throw error;
    }
  }

  /**
   * Resolve a report
   */
  async resolveReport(reportId, adminId, action, notes) {
    try {
      const result = await this.db.query(
        `UPDATE discussion_reports 
         SET status = 'resolved', 
             resolved_by = $1, 
             resolved_at = NOW(),
             resolution_notes = $2
         WHERE id = $3
         RETURNING *`,
        [adminId, notes, reportId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Report not found');
      }

      logger.info('Report resolved', { reportId, adminId, action });
      return result.rows[0];
    } catch (error) {
      logger.error('Error resolving report', { reportId, error: error.message });
      throw error;
    }
  }

  /**
   * Dismiss a report
   */
  async dismissReport(reportId, adminId) {
    try {
      const result = await this.db.query(
        `UPDATE discussion_reports 
         SET status = 'dismissed', 
             resolved_by = $1, 
             resolved_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [adminId, reportId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Report not found');
      }

      logger.info('Report dismissed', { reportId, adminId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error dismissing report', { reportId, error: error.message });
      throw error;
    }
  }

  /**
   * Get moderation history with filters
   */
  async getModerationHistory(filters = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        moderator_id,
        action_type,
        sortBy = 'created_at',
        order = 'desc'
      } = filters;

      let query = `
        SELECT 
          al.*,
          u.username as moderator_username,
          u.email as moderator_email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (moderator_id) {
        query += ` AND al.user_id = $${paramCount++}`;
        params.push(moderator_id);
      }

      if (action_type) {
        query += ` AND al.action = $${paramCount++}`;
        params.push(action_type);
      }

      query += ` ORDER BY al.${sortBy} ${order.toUpperCase()}`;
      query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      params.push(parseInt(limit), offset);

      const result = await this.db.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM audit_logs WHERE 1=1';
      const countParams = [];
      let countParamCount = 1;

      if (moderator_id) {
        countQuery += ` AND user_id = $${countParamCount++}`;
        countParams.push(moderator_id);
      }

      if (action_type) {
        countQuery += ` AND action = $${countParamCount++}`;
        countParams.push(action_type);
      }

      const countResult = await this.db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      // Format the response to match frontend expectations
      const formattedData = result.rows.map(row => ({
        id: row.id,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        created_at: row.created_at,
        metadata: row.metadata,
        moderator: row.user_id ? {
          id: row.user_id,
          name: row.moderator_username || 'System',
          email: row.moderator_email
        } : null
      }));

      return {
        data: formattedData,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
          total_pages: Math.ceil(total / parseInt(limit)), // Legacy support
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      };
    } catch (error) {
      logger.error('Error fetching moderation history', { error: error.message });
      throw error;
    }
  }

  /**
   * Log moderation action
   */
  async logModerationAction(actionData) {
    try {
      const {
        moderator_id,
        action_type,
        target_type,
        target_id,
        details
      } = actionData;

      const query = `
        INSERT INTO moderation_history (
          moderator_id, action_type, target_type, target_id, details, created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `;

      const result = await this.db.query(query, [
        moderator_id,
        action_type,
        target_type,
        target_id,
        JSON.stringify(details)
      ]);

      logger.info('Moderation action logged', {
        moderator_id,
        action_type,
        target_type,
        target_id
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error logging moderation action', { error: error.message });
      throw error;
    }
  }

  /**
   * Get system activity statistics
   */
  async getActivityStats(days = 7) {
    try {
      const query = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM (
          SELECT created_at FROM english WHERE created_at >= NOW() - INTERVAL '${days} days'
          UNION ALL
          SELECT created_at FROM lisu WHERE created_at >= NOW() - INTERVAL '${days} days'
          UNION ALL
          SELECT created_at FROM users WHERE created_at >= NOW() - INTERVAL '${days} days'
        ) combined
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `;

      const result = await this.db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching activity stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user growth statistics
   */
  async getUserGrowthStats(months = 6) {
    try {
      const query = `
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as new_users,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_users
        FROM users
        WHERE created_at >= NOW() - INTERVAL '${months} months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      `;

      const result = await this.db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching user growth stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Get top contributors
   */
  async getTopContributors(limit = 10) {
    try {
      const query = `
        SELECT 
          u.id,
          u.username,
          u.full_name,
          u.email,
          COALESCE(d.discussion_count, 0) + COALESCE(a.answer_count, 0) as contribution_count
        FROM users u
        LEFT JOIN (
          SELECT created_by, COUNT(*) as discussion_count 
          FROM discussions 
          WHERE created_by IS NOT NULL 
          GROUP BY created_by
        ) d ON u.id = d.created_by
        LEFT JOIN (
          SELECT created_by, COUNT(*) as answer_count 
          FROM answers 
          WHERE created_by IS NOT NULL 
          GROUP BY created_by
        ) a ON u.id = a.created_by
        WHERE (u.role = 'user' OR u.role = 'moderator')
        AND (COALESCE(d.discussion_count, 0) + COALESCE(a.answer_count, 0) > 0)
        ORDER BY contribution_count DESC
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching top contributors', { error: error.message });
      throw error;
    }
  }

  /**
   * Get pending verification count
   * Since is_verified column was removed, return 0
   */
  async getPendingVerificationCount() {
    try {
      // Since is_verified column no longer exists, always return 0
      return 0;
    } catch (error) {
      logger.error('Error fetching pending verification count', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AdminRepository();
