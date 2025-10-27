const BaseRepository = require('./BaseRepository');
const logger = require('../utils/logger');
const { NotFoundError } = require('../utils/errors');

/**
 * NotificationRepository
 * Handles all notification-related database operations
 */
class NotificationRepository extends BaseRepository {
  constructor() {
    super('notifications');
  }

  /**
   * Get notifications for a user with advanced filtering
   * @param {Object} filters - Filter options
   * @param {string} filters.userId - User ID (required)
   * @param {string} filters.category - Category filter (all, mentions, replies, etc.)
   * @param {boolean} filters.unreadOnly - Only unread notifications
   * @param {number} filters.limit - Pagination limit
   * @param {number} filters.offset - Pagination offset
   * @returns {Promise<Object>} Notifications with pagination
   */
  async getAll(filters = {}) {
    const {
      userId,
      category = 'all',
      unreadOnly = false,
      limit = 20,
      offset = 0
    } = filters;

    try {
      // Build the base query
      let query = `
        SELECT 
          n.id,
          n.type,
          n.category,
          n.actor_id,
          n.actor_name,
          n.actor_avatar,
          n.message,
          n.target_title,
          n.target_link,
          n.secondary_message,
          n.action_buttons,
          n.is_read,
          n.created_at,
          n.updated_at,
          u.username as actor_username,
          u.full_name as actor_full_name,
          u.profile_photo_url as actor_profile_photo
        FROM notifications n
        LEFT JOIN users u ON n.actor_id = u.id
        WHERE n.user_id = $1
      `;

      const params = [userId];
      let paramIndex = 2;

      // Build WHERE conditions
      const { whereClause, finalParams, finalParamIndex } = this._buildWhereConditions(
        category,
        unreadOnly,
        params,
        paramIndex
      );

      if (whereClause) {
        query += whereClause;
      }

      // Order by created_at desc (newest first)
      query += ` ORDER BY n.created_at DESC`;

      // Add pagination
      query += ` LIMIT $${finalParamIndex} OFFSET $${finalParamIndex + 1}`;
      finalParams.push(parseInt(limit), parseInt(offset));

      // Execute query
      const result = await this.db.query(query, finalParams);

      // Get total count for pagination
      const total = await this._getFilteredCount(userId, category, unreadOnly);

      logger.info(`Retrieved ${result.rows.length} notifications for user ${userId}`, {
        category,
        unreadOnly,
        total
      });

      return {
        data: result.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + result.rows.length < total
        }
      };
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of unread notifications
   */
  async getUnreadCount(userId) {
    try {
      const result = await this.db.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
        [userId]
      );

      const count = parseInt(result.rows[0].count);
      logger.info(`User ${userId} has ${count} unread notifications`);

      return count;
    } catch (error) {
      logger.error('Error fetching unread count:', error);
      throw error;
    }
  }

  /**
   * Get notification counts by category for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Counts by category
   */
  async getCategoryCounts(userId) {
    try {
      const result = await this.db.query(
        `SELECT 
          category,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE is_read = false) as unread_count
        FROM notifications 
        WHERE user_id = $1
        GROUP BY category`,
        [userId]
      );

      // Initialize counts object with default categories
      const counts = {
        all: 0,
        unread: 0,
        mentions: 0,
        replies: 0,
        contributions: 0,
        votes: 0,
        follows: 0,
        system: 0
      };

      // Populate with actual counts
      result.rows.forEach(row => {
        counts[row.category] = parseInt(row.count);
        counts.all += parseInt(row.count);
        counts.unread += parseInt(row.unread_count);
      });

      logger.info(`Retrieved category counts for user ${userId}`, { counts });

      return counts;
    } catch (error) {
      logger.error('Error fetching category counts:', error);
      throw error;
    }
  }

  /**
   * Mark a notification as read
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID (for ownership validation)
   * @returns {Promise<Object>} Updated notification
   */
  async markAsRead(notificationId, userId) {
    try {
      const result = await this.db.query(
        `UPDATE notifications 
         SET is_read = true, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND user_id = $2 
         RETURNING *`,
        [notificationId, userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Notification not found or access denied');
      }

      logger.info(`Notification ${notificationId} marked as read`, { userId });

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of notifications updated
   */
  async markAllAsRead(userId) {
    try {
      const result = await this.db.query(
        `UPDATE notifications 
         SET is_read = true, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $1 AND is_read = false
         RETURNING id`,
        [userId]
      );

      const count = result.rows.length;
      logger.info(`Marked ${count} notifications as read for user ${userId}`);

      return count;
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete a notification
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID (for ownership validation)
   * @returns {Promise<void>}
   */
  async delete(notificationId, userId) {
    try {
      const result = await this.db.query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
        [notificationId, userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Notification not found or access denied');
      }

      logger.info(`Notification ${notificationId} deleted`, { userId });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Delete all notifications for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of notifications deleted
   */
  async deleteAll(userId) {
    try {
      const result = await this.db.query(
        'DELETE FROM notifications WHERE user_id = $1 RETURNING id',
        [userId]
      );

      const count = result.rows.length;
      logger.info(`Deleted ${count} notifications for user ${userId}`);

      return count;
    } catch (error) {
      logger.error('Error deleting all notifications:', error);
      throw error;
    }
  }

  /**
   * Create a notification
   * @param {Object} notificationData - Notification data
   * @returns {Promise<Object>} Created notification
   */
  async create(notificationData) {
    const {
      userId,
      type,
      category,
      actorId = null,
      actorName = null,
      actorAvatar = null,
      message,
      targetTitle = null,
      targetLink,
      secondaryMessage = null,
      actionButtons = []
    } = notificationData;

    try {
      const result = await this.db.query(
        `INSERT INTO notifications (
          user_id, type, category, actor_id, actor_name, actor_avatar,
          message, target_title, target_link, secondary_message, action_buttons
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          userId,
          type,
          category,
          actorId,
          actorName,
          actorAvatar,
          message,
          targetTitle,
          targetLink,
          secondaryMessage,
          JSON.stringify(actionButtons)
        ]
      );

      logger.info(`Notification created for user ${userId}`, {
        type,
        category,
        notificationId: result.rows[0].id
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Create multiple notifications in bulk
   * @param {Array<Object>} notifications - Array of notification data objects
   * @returns {Promise<Array<Object>>} Created notifications
   */
  async createBulk(notifications) {
    if (!notifications || notifications.length === 0) {
      return [];
    }

    try {
      const values = [];
      const params = [];
      let paramIndex = 1;

      notifications.forEach((notification, index) => {
        const {
          userId,
          type,
          category,
          actorId = null,
          actorName = null,
          actorAvatar = null,
          message,
          targetTitle = null,
          targetLink,
          secondaryMessage = null,
          actionButtons = []
        } = notification;

        values.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, ` +
          `$${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, ` +
          `$${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`
        );

        params.push(
          userId,
          type,
          category,
          actorId,
          actorName,
          actorAvatar,
          message,
          targetTitle,
          targetLink,
          secondaryMessage,
          JSON.stringify(actionButtons)
        );

        paramIndex += 11;
      });

      const query = `
        INSERT INTO notifications (
          user_id, type, category, actor_id, actor_name, actor_avatar,
          message, target_title, target_link, secondary_message, action_buttons
        ) VALUES ${values.join(', ')}
        RETURNING *
      `;

      const result = await this.db.query(query, params);

      logger.info(`Created ${result.rows.length} notifications in bulk`);

      return result.rows;
    } catch (error) {
      logger.error('Error creating bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification preferences for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Notification preferences
   */
  async getPreferences(userId) {
    try {
      const result = await this.db.query(
        `SELECT 
          notification_preferences
        FROM users 
        WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const preferences = result.rows[0].notification_preferences || {};
      logger.info(`Retrieved notification preferences for user ${userId}`);

      return preferences;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error fetching notification preferences:', error);
      throw error;
    }
  }

  /**
   * Update notification preferences for a user
   * @param {string} userId - User ID
   * @param {Object} preferences - Notification preferences
   * @returns {Promise<Object>} Updated preferences
   */
  async updatePreferences(userId, preferences) {
    try {
      const result = await this.db.query(
        `UPDATE users 
         SET notification_preferences = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 
         RETURNING notification_preferences`,
        [JSON.stringify(preferences), userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      logger.info(`Updated notification preferences for user ${userId}`);

      return result.rows[0].notification_preferences;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error updating notification preferences:', error);
      throw error;
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Build WHERE conditions for notification filtering
   * @private
   */
  _buildWhereConditions(category, unreadOnly, params, paramIndex) {
    let whereClause = '';
    const finalParams = [...params];
    let finalParamIndex = paramIndex;

    // Filter by category
    if (category !== 'all' && category !== 'unread') {
      whereClause += ` AND n.category = $${finalParamIndex}`;
      finalParams.push(category);
      finalParamIndex++;
    }

    // Filter by unread status
    if (category === 'unread' || unreadOnly) {
      whereClause += ` AND n.is_read = false`;
    }

    return { whereClause, finalParams, finalParamIndex };
  }

  /**
   * Get filtered count for pagination
   * @private
   */
  async _getFilteredCount(userId, category, unreadOnly) {
    let countQuery = `
      SELECT COUNT(*) as total
      FROM notifications
      WHERE user_id = $1
    `;

    const countParams = [userId];
    let paramIndex = 2;

    // Apply same filters as main query
    if (category !== 'all' && category !== 'unread') {
      countQuery += ` AND category = $${paramIndex}`;
      countParams.push(category);
      paramIndex++;
    }

    if (category === 'unread' || unreadOnly) {
      countQuery += ` AND is_read = false`;
    }

    const countResult = await this.db.query(countQuery, countParams);
    return parseInt(countResult.rows[0].total);
  }
}

module.exports = new NotificationRepository();
