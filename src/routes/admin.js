const express = require('express');
const AdminController = require('../controllers/adminController');
const { authenticate, authorize, upload } = require('../middlewares');
const { validate, schemas } = require('../validations/schemas');

const router = express.Router();

// ============================================
// Admin Dashboard Routes
// ============================================

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard statistics
 * @access  Admin
 */
router.get('/dashboard',
  authenticate,
  authorize('admin'),
  AdminController.getDashboardStats
);

// ============================================
// User Management Routes
// ============================================

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with advanced filtering
 * @access  Admin
 */
router.get('/users',
  authenticate,
  authorize('admin'),
  validate(schemas.admin.listUsers, 'query'),
  AdminController.getAllUsers
);

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get single user with stats
 * @access  Admin
 */
router.get('/users/:id',
  authenticate,
  authorize('admin'),
  AdminController.getUser
);

/**
 * @route   PUT /api/admin/users/:id/status
 * @desc    Update user status (active/inactive)
 * @access  Admin
 */
router.put('/users/:id/status',
  authenticate,
  authorize('admin'),
  validate(schemas.common.params.id, 'params'),
  validate(schemas.admin.updateUserStatus),
  AdminController.updateUserStatus
);

/**
 * @route   PUT /api/admin/users/:id/role
 * @desc    Update user role
 * @access  Admin
 */
router.put('/users/:id/role',
  authenticate,
  authorize('admin'),
  validate(schemas.common.params.id, 'params'),
  validate(schemas.admin.updateUserRole),
  AdminController.updateUserRole
);

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete user (soft delete)
 * @access  Admin
 */
router.delete('/users/:id',
  authenticate,
  authorize('admin'),
  validate(schemas.common.params.id, 'params'),
  AdminController.deleteUser
);

// ============================================
// Reports Management Routes
// ============================================

/**
 * @route   GET /api/admin/reports
 * @desc    Get all user reports
 * @access  Admin
 */
router.get('/reports',
  authenticate,
  authorize('admin'),
  validate(schemas.admin.listReports, 'query'),
  AdminController.getReports
);

/**
 * @route   POST /api/admin/reports/:id/resolve
 * @desc    Resolve a report
 * @access  Admin
 */
router.post('/reports/:id/resolve',
  authenticate,
  authorize('admin'),
  validate(schemas.common.params.id, 'params'),
  validate(schemas.admin.resolveReport),
  AdminController.resolveReport
);

/**
 * @route   POST /api/admin/reports/:id/dismiss
 * @desc    Dismiss a report
 * @access  Admin
 */
router.post('/reports/:id/dismiss',
  authenticate,
  authorize('admin'),
  validate(schemas.common.params.id, 'params'),
  AdminController.dismissReport
);

// ============================================
// Moderation History Routes
// ============================================

/**
 * @route   GET /api/admin/moderation-history
 * @desc    Get moderation action history
 * @access  Admin
 */
router.get('/moderation-history',
  authenticate,
  authorize('admin'),
  validate(schemas.admin.moderationHistory, 'query'),
  AdminController.getModerationHistory
);

/**
 * @route   GET /api/admin/system-info
 * @desc    Get system health and configuration info
 * @access  Admin
 */
router.get('/system-info',
  authenticate,
  authorize('admin'),
  AdminController.getSystemInfo
);

/**
 * @route   GET /api/admin/discussion-stats
 * @desc    Get discussion stats
 * @access  Admin
 */
router.get('/discussion-stats',
  authenticate,
  authorize('admin'),
  AdminController.getDiscussionStats
);

/**
 * @route   GET /api/admin/categories-tags
 * @desc    Get categories and tags overview
 * @access  Admin
 */
router.get('/categories-tags',
  authenticate,
  authorize('admin'),
  AdminController.getCategoriesAndTags
);

/**
 * @route   GET /api/admin/analytics
 * @desc    Get analytics data for a time range
 * @access  Admin
 */
router.get('/analytics',
  authenticate,
  authorize('admin'),
  AdminController.getAnalytics
);

/**
 * @route   GET /api/admin/permissions
 * @desc    Get role permissions overview
 * @access  Admin
 */
router.get('/permissions',
  authenticate,
  authorize('admin'),
  AdminController.getPermissions
);

module.exports = router;
