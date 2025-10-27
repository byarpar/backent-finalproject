const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticate, authorize, requireMinRole } = require('../middlewares/auth');
const { validate, schemas } = require('../validations/schemas');

// Import notification routes
const notificationRoutes = require('./notifications');

// ============================================
// Nested Routes
// ============================================

// IMPORTANT: Notifications routes must come BEFORE :userId routes
// to prevent "notifications" from being interpreted as a userId
router.use('/notifications', notificationRoutes);

// ============================================
// Public Routes
// ============================================

/**
 * @route   GET /api/users
 * @desc    Get all users with pagination and filtering
 * @access  Public (Admin gets more details)
 */
router.get('/',
  validate(schemas.user.listUsers, 'query'),
  UserController.listUsers
);

/**
 * @route   GET /api/users/search
 * @desc    Search users by username, email, or full name
 * @access  Public
 */
router.get('/search',
  validate(schemas.user.searchUsers, 'query'),
  UserController.searchUsers
);

// ============================================
// Protected Routes - Authentication Required
// ============================================
// IMPORTANT: /me routes must come BEFORE /:userId routes
// to prevent "me" from being interpreted as a userId

/**
 * @route   GET /api/users/me/profile
 * @desc    Get current user's profile
 * @access  Private
 */
router.get('/me/profile',
  authenticate,
  UserController.getMyProfile
);

/**
 * @route   PUT /api/users/me/profile
 * @desc    Update current user's profile
 * @access  Private
 */
router.put('/me/profile',
  authenticate,
  validate(schemas.user.updateProfile),
  UserController.updateProfile
);

/**
 * @route   DELETE /api/users/me/account
 * @desc    Delete current user's account (soft delete)
 * @access  Private
 */
router.delete('/me/account',
  authenticate,
  UserController.deleteAccount
);

// ============================================
// Public Routes with Dynamic Parameters
// ============================================

/**
 * @route   GET /api/users/:userId
 * @desc    Get user profile by ID
 * @access  Public
 */
router.get('/:userId',
  validate(schemas.common.params.userId, 'params'),
  UserController.getUserProfile
);

/**
 * @route   GET /api/users/:userId/statistics
 * @desc    Get user statistics
 * @access  Public
 */
router.get('/:userId/statistics',
  validate(schemas.common.params.userId, 'params'),
  UserController.getUserStatistics
);

// ============================================
// Admin Routes - Admin Access Required
// ============================================

/**
 * @route   PUT /api/users/:userId/role
 * @desc    Update user role (Admin only)
 * @access  Admin
 */
router.put('/:userId/role',
  authenticate,
  authorize('admin', 'super_admin'),
  validate(schemas.common.params.userId, 'params'),
  validate(schemas.user.updateRole),
  UserController.updateUserRole
);

/**
 * @route   DELETE /api/users/:userId
 * @desc    Delete user account (Admin only)
 * @access  Admin
 */
router.delete('/:userId',
  authenticate,
  authorize('admin', 'super_admin'),
  validate(schemas.common.params.userId, 'params'),
  UserController.deleteAccount
);

module.exports = router;
