const NotificationRepository = require('../repositories/NotificationRepository');
const UserRepository = require('../repositories/UserRepository');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../utils/errors');

/**
 * NotificationService
 * Business logic layer for notification operations
 */
class NotificationService {
  /**
   * Get all notifications for a user with filtering and pagination
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Notifications with pagination
   */
  async getAllNotifications(filters) {
    const { userId, category, unreadOnly, limit, offset } = filters;

    // Validate category if provided
    if (category && !this._isValidCategory(category)) {
      throw new ValidationError(`Invalid category: ${category}`);
    }

    const result = await NotificationRepository.getAll({
      userId,
      category,
      unreadOnly: unreadOnly === 'true' || unreadOnly === true,
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0
    });

    // Process notifications (parse action_buttons JSON if string)
    result.data = result.data.map(notification => this._processNotification(notification));

    logger.info(`Retrieved ${result.data.length} notifications for user ${userId}`);

    return result;
  }

  /**
   * Get unread notification count for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of unread notifications
   */
  async getUnreadCount(userId) {
    const count = await NotificationRepository.getUnreadCount(userId);
    return count;
  }

  /**
   * Get notification counts by category for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Counts by category
   */
  async getCategoryCounts(userId) {
    const counts = await NotificationRepository.getCategoryCounts(userId);
    return counts;
  }

  /**
   * Mark a notification as read
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated notification
   */
  async markAsRead(notificationId, userId) {
    if (!notificationId) {
      throw new ValidationError('Notification ID is required');
    }

    const notification = await NotificationRepository.markAsRead(notificationId, userId);

    logger.info(`Notification ${notificationId} marked as read by user ${userId}`);

    return this._processNotification(notification);
  }

  /**
   * Mark all notifications as read for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of notifications updated
   */
  async markAllAsRead(userId) {
    const count = await NotificationRepository.markAllAsRead(userId);

    logger.info(`User ${userId} marked ${count} notifications as read`);

    return count;
  }

  /**
   * Delete a notification
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async deleteNotification(notificationId, userId) {
    if (!notificationId) {
      throw new ValidationError('Notification ID is required');
    }

    await NotificationRepository.delete(notificationId, userId);

    logger.info(`Notification ${notificationId} deleted by user ${userId}`);
  }

  /**
   * Delete all notifications for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of notifications deleted
   */
  async deleteAllNotifications(userId) {
    const count = await NotificationRepository.deleteAll(userId);

    logger.info(`User ${userId} deleted ${count} notifications`);

    return count;
  }

  /**
   * Create a notification
   * @param {Object} notificationData - Notification data
   * @returns {Promise<Object>} Created notification
   */
  async createNotification(notificationData) {
    // Validate required fields
    this._validateNotificationData(notificationData);

    // Enrich with actor details if actorId provided but no actor data
    let enrichedData = { ...notificationData };

    if (notificationData.actorId && !notificationData.actorName) {
      const actor = await UserRepository.findById(notificationData.actorId);
      if (actor) {
        enrichedData.actorName = actor.full_name || actor.username;
        enrichedData.actorAvatar = actor.profile_photo_url;
      }
    }

    const notification = await NotificationRepository.create(enrichedData);

    logger.info(`Notification created for user ${notificationData.userId}`, {
      type: notificationData.type,
      category: notificationData.category
    });

    return this._processNotification(notification);
  }

  /**
   * Create multiple notifications in bulk
   * @param {Array<Object>} notifications - Array of notification data objects
   * @returns {Promise<Array<Object>>} Created notifications
   */
  async createBulkNotifications(notifications) {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      throw new ValidationError('Notifications array is required');
    }

    // Validate all notifications
    notifications.forEach((notification, index) => {
      try {
        this._validateNotificationData(notification);
      } catch (error) {
        throw new ValidationError(`Notification at index ${index}: ${error.message}`);
      }
    });

    const created = await NotificationRepository.createBulk(notifications);

    logger.info(`Created ${created.length} notifications in bulk`);

    return created.map(notification => this._processNotification(notification));
  }

  /**
   * Get notification preferences for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Notification preferences
   */
  async getNotificationPreferences(userId) {
    const preferences = await NotificationRepository.getPreferences(userId);

    // Return default preferences if none exist
    if (!preferences || Object.keys(preferences).length === 0) {
      return this._getDefaultPreferences();
    }

    return preferences;
  }

  /**
   * Update notification preferences for a user
   * @param {string} userId - User ID
   * @param {Object} preferences - Notification preferences
   * @returns {Promise<Object>} Updated preferences
   */
  async updateNotificationPreferences(userId, preferences) {
    if (!preferences || typeof preferences !== 'object') {
      throw new ValidationError('Valid preferences object is required');
    }

    // Validate preference structure
    this._validatePreferences(preferences);

    const updated = await NotificationRepository.updatePreferences(userId, preferences);

    logger.info(`Notification preferences updated for user ${userId}`);

    return updated;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Validate notification data
   * @private
   */
  _validateNotificationData(data) {
    if (!data.userId) {
      throw new ValidationError('User ID is required');
    }

    if (!data.type) {
      throw new ValidationError('Notification type is required');
    }

    if (!data.category) {
      throw new ValidationError('Notification category is required');
    }

    if (!this._isValidCategory(data.category)) {
      throw new ValidationError(`Invalid category: ${data.category}`);
    }

    if (!data.message) {
      throw new ValidationError('Notification message is required');
    }

    if (!data.targetLink) {
      throw new ValidationError('Target link is required');
    }
  }

  /**
   * Check if category is valid
   * @private
   */
  _isValidCategory(category) {
    const validCategories = [
      'all',
      'unread',
      'mentions',
      'replies',
      'contributions',
      'votes',
      'follows',
      'system'
    ];

    return validCategories.includes(category);
  }

  /**
   * Process notification (parse JSON fields)
   * @private
   */
  _processNotification(notification) {
    // Parse action_buttons if it's a string
    if (notification.action_buttons && typeof notification.action_buttons === 'string') {
      try {
        notification.action_buttons = JSON.parse(notification.action_buttons);
      } catch (error) {
        logger.warn(`Failed to parse action_buttons for notification ${notification.id}`);
        notification.action_buttons = [];
      }
    }

    return notification;
  }

  /**
   * Get default notification preferences
   * @private
   */
  _getDefaultPreferences() {
    return {
      email: {
        enabled: true,
        mentions: true,
        replies: true,
        contributions: true,
        votes: true,
        follows: true,
        system: true
      },
      push: {
        enabled: true,
        mentions: true,
        replies: true,
        contributions: true,
        votes: false,
        follows: true,
        system: true
      },
      inApp: {
        enabled: true,
        mentions: true,
        replies: true,
        contributions: true,
        votes: true,
        follows: true,
        system: true
      }
    };
  }

  /**
   * Validate notification preferences structure
   * @private
   */
  _validatePreferences(preferences) {
    const validChannels = ['email', 'push', 'inApp'];
    const validCategories = ['mentions', 'replies', 'contributions', 'votes', 'follows', 'system'];

    // Validate each channel
    Object.keys(preferences).forEach(channel => {
      if (!validChannels.includes(channel)) {
        throw new ValidationError(`Invalid preference channel: ${channel}`);
      }

      const channelPrefs = preferences[channel];

      if (typeof channelPrefs !== 'object') {
        throw new ValidationError(`Preferences for ${channel} must be an object`);
      }

      // Validate enabled flag
      if (channelPrefs.enabled !== undefined && typeof channelPrefs.enabled !== 'boolean') {
        throw new ValidationError(`${channel}.enabled must be a boolean`);
      }

      // Validate category flags
      Object.keys(channelPrefs).forEach(key => {
        if (key !== 'enabled' && !validCategories.includes(key)) {
          throw new ValidationError(`Invalid preference category: ${key}`);
        }

        if (key !== 'enabled' && typeof channelPrefs[key] !== 'boolean') {
          throw new ValidationError(`${channel}.${key} must be a boolean`);
        }
      });
    });
  }
}

module.exports = new NotificationService();
