/**
 * User Controller
 * Professional controller for user management
 */

const userService = require('../services/userService');
const { sendSuccess, sendUpdated, sendDeleted, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/helpers');
const { HTTP_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

class UserController {
  /**
   * Get user profile by ID
   * GET /api/users/:userId
   */
  getUserProfile = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    logger.info('getUserProfile called with userId:', userId);
    const user = await userService.getUserProfile(userId);

    sendSuccess(res, HTTP_STATUS.OK, { user }, 'User profile retrieved');
  });

  /**
   * Get current user's full profile
   * GET /api/users/me
   */
  getMyProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const user = await userService.getUserById(userId);

    sendSuccess(res, HTTP_STATUS.OK, { user }, 'Profile retrieved');
  });

  /**
   * Update user profile
   * PUT /api/users/me
   */
  updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const updateData = req.body;

    const user = await userService.updateProfile(userId, updateData);

    sendUpdated(res, { user }, 'Profile updated successfully');
  });

  /**
   * Update profile photo
   * PUT /api/users/me/photo
   */
  updateProfilePhoto = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { photoUrl } = req.body;

    const user = await userService.updateProfilePhoto(userId, photoUrl);

    sendUpdated(res, { user }, 'Profile photo updated');
  });

  /**
   * Get user statistics
   * GET /api/users/:userId/statistics
   */
  getUserStatistics = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const stats = await userService.getUserStatistics(userId);

    sendSuccess(res, HTTP_STATUS.OK, { statistics: stats }, 'Statistics retrieved');
  });

  /**
   * Search users
   * GET /api/users/search
   */
  searchUsers = asyncHandler(async (req, res) => {
    const { q: searchTerm, page, limit } = req.query;

    const result = await userService.searchUsers(searchTerm, { page, limit });

    sendSuccess(res, HTTP_STATUS.OK, result, 'Users found');
  });

  /**
   * List all users (admin)
   * GET /api/users
   */
  listUsers = asyncHandler(async (req, res) => {
    const options = req.query;

    const result = await userService.listUsers(options);

    sendSuccess(res, HTTP_STATUS.OK, result, 'Users retrieved');
  });

  /**
   * Deactivate account
   * POST /api/users/me/deactivate
   */
  deactivateAccount = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    await userService.deactivateAccount(userId);

    sendSuccess(res, HTTP_STATUS.OK, null, 'Account deactivated');
  });

  /**
   * Delete account
   * DELETE /api/users/me
   */
  deleteAccount = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    await userService.deleteAccount(userId);

    sendDeleted(res, 'Account deleted successfully');
  });

  /**
   * Update user role (admin only)
   * PUT /api/users/:id/role
   */
  updateUserRole = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    const user = await userService.updateUserRole(id, role);

    sendUpdated(res, { user }, 'User role updated');
  });

  /**
   * Reactivate user account (admin only)
   * POST /api/users/:id/reactivate
   */
  reactivateAccount = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await userService.reactivateAccount(id);

    sendUpdated(res, { user }, 'Account reactivated');
  });

  /**
   * Get user's favorite words
   * GET /api/users/me/favorites
   */
  getFavoriteWords = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page, limit } = req.query;

    const result = await userService.getFavoriteWords(userId, { page, limit });

    sendSuccess(res, HTTP_STATUS.OK, result, 'Favorite words retrieved');
  });

  /**
   * Check username availability
   * GET /api/users/check-username/:username
   */
  checkUsernameAvailability = asyncHandler(async (req, res) => {
    const { username } = req.params;

    const result = await userService.checkUsernameAvailability(username);

    sendSuccess(res, HTTP_STATUS.OK, result, 'Username availability checked');
  });

  /**
   * Check email availability
   * GET /api/users/check-email/:email
   */
  checkEmailAvailability = asyncHandler(async (req, res) => {
    const { email } = req.params;

    const result = await userService.checkEmailAvailability(email);

    sendSuccess(res, HTTP_STATUS.OK, result, 'Email availability checked');
  });
}

module.exports = new UserController();
