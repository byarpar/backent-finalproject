/**
 * Notification Controller
 */

const logger = require('../utils/logger');
const { successResponse, errorResponse, asyncHandler } = require('../utils');
const { db } = require('../config/database');

/**
 * Create a notification (internal use)
 */
const createNotification = async (notificationData) => {
  try {
    const { user_id, type, title, message, related_id, related_type } = notificationData;
    const result = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user_id, type, title, message || null, related_id || null, related_type || null]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Get notifications for a user
 */
const getNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 20, unread_only } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE user_id = $1';
  const params = [userId];

  if (unread_only === 'true') {
    whereClause += ' AND is_read = false';
  }

  const [notifications, countResult, unreadResult] = await Promise.all([
    db.query(
      `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [...params, limit, offset]
    ),
    db.query(`SELECT COUNT(*) FROM notifications ${whereClause}`, params),
    db.query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`, [userId])
  ]);

  return successResponse(res, 'Notifications retrieved', {
    notifications: notifications.rows,
    total: parseInt(countResult.rows[0].count),
    unreadCount: parseInt(unreadResult.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit)
  });
});

/**
 * Mark notification as read
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const result = await db.query(
    `UPDATE notifications SET is_read = true, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );

  if (!result.rows[0]) return errorResponse(res, 'Notification not found', 404);
  return successResponse(res, 'Notification marked as read', result.rows[0]);
});

/**
 * Mark all notifications as read
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await db.query(
    `UPDATE notifications SET is_read = true, updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
  return successResponse(res, 'All notifications marked as read');
});

/**
 * Delete notification
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  await db.query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [id, userId]);
  return successResponse(res, 'Notification deleted');
});

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
};