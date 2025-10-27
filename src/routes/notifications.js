const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/auth');
const { validate, schemas } = require('../validations/schemas');

// ============================================
// All notification routes require authentication
// ============================================

/**
 * @route   GET /api/users/notifications
 * @desc    Get all notifications for authenticated user
 * @access  Private
 * @query   filter (all|unread|mentions|replies|contributions|likes|follows|system)
 * @query   limit (default: 20)
 * @query   offset (default: 0)
 */
router.get('/',
  authenticate,
  validate(schemas.notification.listNotifications, 'query'),
  notificationController.getNotifications
);

/**
 * @route   GET /api/users/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Private
 */
router.get('/unread-count',
  authenticate,
  notificationController.getUnreadCount
);

/**
 * @route   GET /api/users/notifications/counts
 * @desc    Get notification counts by category
 * @access  Private
 */
router.get('/counts',
  authenticate,
  notificationController.getCategoryCounts
);

/**
 * @route   PUT /api/users/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/mark-all-read',
  authenticate,
  notificationController.markAllAsRead
);

/**
 * @route   PUT /api/users/notifications/:id/read
 * @desc    Mark a specific notification as read
 * @access  Private
 */
router.put('/:id/read',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  notificationController.markAsRead
);

/**
 * @route   DELETE /api/users/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:id',
  authenticate,
  validate(schemas.common.params.id, 'params'),
  notificationController.deleteNotification
);

/**
 * @route   DELETE /api/users/notifications
 * @desc    Delete all notifications
 * @access  Private
 */
router.delete('/',
  authenticate,
  notificationController.deleteAllNotifications
);

/**
 * @route   GET /api/users/notifications/preferences
 * @desc    Get notification preferences
 * @access  Private
 */
router.get('/preferences',
  authenticate,
  notificationController.getNotificationPreferences
);

/**
 * @route   PUT /api/users/notifications/preferences
 * @desc    Update notification preferences
 * @access  Private
 */
router.put('/preferences',
  authenticate,
  notificationController.updateNotificationPreferences
);

module.exports = router;
