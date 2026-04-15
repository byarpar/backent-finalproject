/**
 * Notification Controller
 */

const logger = require('../utils/logger');
const { successResponse, errorResponse, asyncHandler } = require('../utils');
const { db } = require('../config/database');

const extractFirstUuid = (value) => {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
};

/**
 * Create a notification (internal use)
 */
const createNotification = async (notificationData) => {
  try {
    const user_id = notificationData.user_id || notificationData.userId;
    const rawType = (notificationData.type || 'system').toString().toLowerCase();
    const type = rawType === 'up' || rawType === 'down' ? 'vote' : rawType;

    const actorName = notificationData.actorName || notificationData.actor_name;
    const message = notificationData.message || notificationData.content || null;

    const title = notificationData.title
      || (actorName && message ? `${actorName} ${message}` : message)
      || 'Notification';

    const related_id = notificationData.related_id
      || notificationData.relatedId
      || notificationData.targetId
      || extractFirstUuid(notificationData.targetLink)
      || null;

    const related_type = notificationData.related_type
      || notificationData.relatedType
      || notificationData.targetType
      || (() => {
        const link = notificationData.targetLink || '';
        if (link.includes('/discussions/')) return 'discussion';
        if (link.includes('/users/')) return 'user';
        return null;
      })();

    if (!user_id) {
      throw new Error('Notification recipient user_id is required');
    }

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
  const {
    page = 1,
    limit = 20,
    unread_only,
    is_read,
    type,
    search,
    sort = 'newest'
  } = req.query;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = ['user_id = $1'];
  const params = [userId];

  if (typeof is_read !== 'undefined') {
    params.push(is_read === 'true');
    where.push(`is_read = $${params.length}`);
  } else if (unread_only === 'true') {
    where.push('is_read = false');
  }

  if (type && type !== 'all') {
    params.push(type);
    where.push(`type = $${params.length}`);
  }

  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    where.push(`(
      COALESCE(title, '') ILIKE $${params.length}
      OR COALESCE(message, '') ILIKE $${params.length}
      OR COALESCE(type, '') ILIKE $${params.length}
    )`);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;
  const orderBy = sort === 'oldest' ? 'created_at ASC' : 'created_at DESC';

  const listParams = [...params, safeLimit, offset];

  const [notifications, countResult, unreadResult] = await Promise.all([
    db.query(
      `SELECT id, user_id, type, title, message, is_read, related_id, related_type, created_at, updated_at
       FROM notifications
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM notifications ${whereClause}`, params),
    db.query(`SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = false`, [userId])
  ]);

  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  return successResponse(res, {
    notifications: notifications.rows,
    total,
    unreadCount: unreadResult.rows[0]?.unread || 0,
    page: safePage,
    limit: safeLimit,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1
  }, 'Notifications retrieved');
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

  if (!result.rows[0]) return errorResponse(res, { message: 'Notification not found' }, 404);
  return successResponse(res, result.rows[0], 'Notification marked as read');
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
  return successResponse(res, null, 'All notifications marked as read');
});

/**
 * Delete notification
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  await db.query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [id, userId]);
  return successResponse(res, null, 'Notification deleted');
});

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
};