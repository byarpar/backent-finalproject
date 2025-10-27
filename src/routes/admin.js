const express = require('express');
const AdminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validate, schemas } = require('../validations/schemas');
const { uploadSingle, handleUploadError } = require('../middlewares/upload');

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
  authorize('admin', 'super_admin'),
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
  authorize('admin', 'super_admin'),
  validate(schemas.admin.listUsers, 'query'),
  AdminController.getAllUsers
);

/**
 * @route   PUT /api/admin/users/:id/status
 * @desc    Update user status (active/inactive)
 * @access  Admin
 */
router.put('/users/:id/status',
  authenticate,
  authorize('admin', 'super_admin'),
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
  authorize('admin', 'super_admin'),
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
  authorize('admin', 'super_admin'),
  validate(schemas.common.params.id, 'params'),
  AdminController.deleteUser
);

// ============================================
// Word Management Routes
// ============================================

/**
 * @route   GET /api/admin/words
 * @desc    Get all words with admin filters
 * @access  Admin
 */
router.get('/words',
  authenticate,
  authorize('admin', 'super_admin'),
  validate(schemas.admin.listWords, 'query'),
  AdminController.getAllWords
);

/**
 * @route   POST /api/admin/words
 * @desc    Create new word (admin)
 * @access  Admin
 */
router.post('/words',
  authenticate,
  authorize('admin', 'super_admin'),
  validate(schemas.admin.createWord),
  AdminController.createWord
);

/**
 * @route   PUT /api/admin/words/:id
 * @desc    Update word (admin)
 * @access  Admin
 */
router.put('/words/:id',
  authenticate,
  authorize('admin', 'super_admin'),
  validate(schemas.common.params.id, 'params'),
  validate(schemas.admin.updateWord),
  AdminController.updateWord
);

/**
 * @route   POST /api/admin/words/bulk
 * @desc    Bulk import words from JSON
 * @access  Admin
 */
router.post('/words/bulk',
  authenticate,
  authorize('admin', 'super_admin'),
  validate(schemas.admin.bulkImport),
  AdminController.bulkWords
);

/**
 * @route   POST /api/admin/words/import
 * @desc    Import words from Excel/CSV file
 * @access  Admin
 */
router.post('/words/import',
  authenticate,
  authorize('admin', 'super_admin'),
  uploadSingle,
  handleUploadError,
  AdminController.importWords
);

/**
 * @route   POST /api/admin/words/export
 * @desc    Export words to Excel/CSV/JSON
 * @access  Admin
 */
router.post('/words/export',
  authenticate,
  authorize('admin', 'super_admin'),
  validate(schemas.admin.exportWords),
  AdminController.exportWords
);

/**
 * @route   GET /api/admin/words/template
 * @desc    Download import template file
 * @access  Admin
 */
router.get('/words/template',
  authenticate,
  authorize('admin', 'super_admin'),
  AdminController.downloadTemplate
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
  authorize('admin', 'super_admin'),
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
  authorize('admin', 'super_admin'),
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
  authorize('admin', 'super_admin'),
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
  authorize('admin', 'super_admin'),
  validate(schemas.admin.moderationHistory, 'query'),
  AdminController.getModerationHistory
);

module.exports = router;
