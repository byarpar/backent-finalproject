const notificationService = require('../services/notificationService');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/helpers');
const { HTTP_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * NotificationController v2
 * Clean HTTP request/response handling for notification operations
 * All business logic delegated to notificationService
 */

/**
 * Get notifications for the authenticated user
 * @route GET /api/users/notifications
 * @access Private
 */
const getNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    filter = 'all',
    limit = 20,
    offset = 0,
    unreadOnly = false
  } = req.query;

  const filters = {
    userId,
    category: filter,
    unreadOnly,
    limit,
    offset
  };

  const result = await notificationService.getAllNotifications(filters);

  sendSuccess(
    res,
    HTTP_STATUS.OK,
    { notifications: result.data },
    'Notifications retrieved successfully',
    result.pagination
  );
});

/**
 * Get unread notification count
 * @route GET /api/users/notifications/unread-count
 * @access Private
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const count = await notificationService.getUnreadCount(userId);

  sendSuccess(res, HTTP_STATUS.OK, { count }, 'Unread count retrieved successfully');
});

/**
 * Get notification counts by category
 * @route GET /api/users/notifications/counts
 * @access Private
 */
const getCategoryCounts = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const counts = await notificationService.getCategoryCounts(userId);

  sendSuccess(res, HTTP_STATUS.OK, { counts }, 'Category counts retrieved successfully');
});

/**
 * Mark a notification as read
 * @route PUT /api/users/notifications/:id/read
 * @access Private
 */
const markAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const notification = await notificationService.markAsRead(id, userId);

  logger.info(`Notification marked as read`, { notificationId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, { notification }, 'Notification marked as read');
});

/**
 * Mark all notifications as read
 * @route PUT /api/users/notifications/mark-all-read
 * @access Private
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const count = await notificationService.markAllAsRead(userId);

  logger.info(`All notifications marked as read`, { userId, count });

  sendSuccess(res, HTTP_STATUS.OK, { count }, 'All notifications marked as read');
});

/**
 * Delete a notification
 * @route DELETE /api/users/notifications/:id
 * @access Private
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  await notificationService.deleteNotification(id, userId);

  logger.info(`Notification deleted`, { notificationId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, null, 'Notification deleted successfully');
});

/**
 * Delete all notifications
 * @route DELETE /api/users/notifications
 * @access Private
 */
const deleteAllNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const count = await notificationService.deleteAllNotifications(userId);

  logger.info(`All notifications deleted`, { userId, count });

  sendSuccess(res, HTTP_STATUS.OK, { count }, 'All notifications deleted successfully');
});

/**
 * Create a notification (internal/admin use)
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async (notificationData) => {
  try {
    const notification = await notificationService.createNotification(notificationData);
    return notification;
  } catch (error) {
    logger.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Create multiple notifications in bulk (internal/admin use)
 * @param {Array<Object>} notifications - Array of notification data
 * @returns {Promise<Array<Object>>} Created notifications
 */
const createBulkNotifications = async (notifications) => {
  try {
    const created = await notificationService.createBulkNotifications(notifications);
    return created;
  } catch (error) {
    logger.error('Error creating bulk notifications:', error);
    throw error;
  }
};

/**
 * Get notification preferences
 * @route GET /api/users/notifications/preferences
 * @access Private
 */
const getNotificationPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const preferences = await notificationService.getNotificationPreferences(userId);

  sendSuccess(res, HTTP_STATUS.OK, { preferences }, 'Notification preferences retrieved successfully');
});

/**
 * Update notification preferences
 * @route PUT /api/users/notifications/preferences
 * @access Private
 */
const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { preferences } = req.body;

  const updated = await notificationService.updateNotificationPreferences(userId, preferences);

  logger.info(`Notification preferences updated`, { userId });

  sendSuccess(res, HTTP_STATUS.OK, { preferences: updated }, 'Notification preferences updated successfully');
});

module.exports = {
  getNotifications,
  getUnreadCount,
  getCategoryCounts,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  createNotification,
  createBulkNotifications,
  getNotificationPreferences,
  updateNotificationPreferences
};
