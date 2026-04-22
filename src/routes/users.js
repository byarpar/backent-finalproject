const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticate, authorize } = require('../middlewares');
const { validate, schemas } = require('../validations/schemas');

// ============================================
// Public Routes
// ============================================

/**
 * @route   GET /lisudictionary.com/users
 * @desc    Get all users with pagination and filtering
 * @access  Public (Admin gets more details)
 */
router.get('/',
  validate(schemas.user.listUsers, 'query'),
  UserController.listUsers
);

/**
 * @route   GET /lisudictionary.com/users/search
 * @desc    Search users by username, email, or full name
 * @access  Public
 */
router.get('/search',
  validate(schemas.user.searchUsers, 'query'),
  UserController.searchUsers
);

/**
 * @route   GET /api/users/mention-suggestions
 * @desc    Get user suggestions for mentions
 * @access  Public
 */
router.get('/mention-suggestions',
  UserController.getMentionSuggestions
);

/**
 * @route   POST /api/users/lookup
 * @desc    Get multiple user UUIDs by usernames
 * @access  Public
 */
// TEMPORARILY DISABLED - missing method
// router.post('/lookup',
//   UserController.getUserUUIDsByUsernames
// );

/**
 * @route   GET /api/users/lookup/:username
 * @desc    Get user UUID by username
 * @access  Public
 */
// TEMPORARILY DISABLED - missing method  
// router.get('/lookup/:username',
//   UserController.getUserUUIDByUsername
// );

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
// Follow System Routes - Authentication Required
// ============================================

/**
 * @route   POST /api/users/:userId/follow
 * @desc    Follow a user
 * @access  Private
 */
router.post('/:userId/follow',
  authenticate,
  validate(schemas.common.params.userId, 'params'),
  UserController.followUser
);

/**
 * @route   DELETE /api/users/:userId/follow
 * @desc    Unfollow a user
 * @access  Private
 */
router.delete('/:userId/follow',
  authenticate,
  validate(schemas.common.params.userId, 'params'),
  UserController.unfollowUser
);

/**
 * @route   GET /api/users/:userId/follow-info
 * @desc    Get follow information for a user
 * @access  Private
 */
router.get('/:userId/follow-info',
  authenticate,
  validate(schemas.common.params.userId, 'params'),
  UserController.getFollowInfo
);

/**
 * @route   GET /api/users/:userId/followers
 * @desc    Get user's followers list
 * @access  Public
 */
router.get('/:userId/followers',
  validate(schemas.common.params.userId, 'params'),
  validate(schemas.user.getUserFollowers, 'query'),
  UserController.getUserFollowers
);

/**
 * @route   GET /api/users/:userId/following
 * @desc    Get user's following list
 * @access  Public
 */
router.get('/:userId/following',
  validate(schemas.common.params.userId, 'params'),
  validate(schemas.user.getUserFollowing, 'query'),
  UserController.getUserFollowing
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
  authorize('admin'),
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
  authorize('admin'),
  validate(schemas.common.params.userId, 'params'),
  UserController.deleteAccount
);

module.exports = router;
