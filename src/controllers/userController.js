/**
 * User Controller
 * Professional controller for user management
 */

const userService = require('../services/userService');
const { successResponse, errorResponse, sendSuccess, sendError, sendCreated, asyncHandler } = require('../utils');
const { constants: { STATUS_CODES: HTTP_STATUS } } = require('../config');
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

    sendSuccess(res, HTTP_STATUS.OK, { user }, 'Profile updated successfully');
  });

  /**x
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

  /**
   * Get user suggestions for mentions
   * GET /api/users/mention-suggestions
   */
  getMentionSuggestions = asyncHandler(async (req, res) => {
    try {
      const { query } = req.query;

      // Basic implementation - in a real app, this would search users by username/name
      const suggestions = await userService.searchUsers({
        query: query || '',
        limit: 10,
        activeOnly: true
      });

      return successResponse(res, 'Mention suggestions retrieved successfully', {
        suggestions: suggestions.users.map(user => ({
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          avatar: user.profile_picture_url
        }))
      });
    } catch (error) {
      logger.error('Error getting mention suggestions:', error);
      return errorResponse(res, 'Failed to get mention suggestions', 500);
    }
  });

  /**
   * Follow a user
   * POST /api/users/:userId/follow
   */
  followUser = asyncHandler(async (req, res) => {
    const followerId = req.user.id;
    const { userId: followingId } = req.params;

    const follow = await userService.followUser(followerId, followingId);

    sendSuccess(res, HTTP_STATUS.OK, { follow }, 'User followed successfully');
  });

  /**
   * Unfollow a user
   * DELETE /api/users/:userId/follow
   */
  unfollowUser = asyncHandler(async (req, res) => {
    const followerId = req.user.id;
    const { userId: followingId } = req.params;

    await userService.unfollowUser(followerId, followingId);

    sendSuccess(res, HTTP_STATUS.OK, null, 'User unfollowed successfully');
  });

  /**
   * Get follow information for a user
   * GET /api/users/:userId/follow-info
   */
  getFollowInfo = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user?.id || null;

    const followInfo = await userService.getFollowInfo(userId, currentUserId);

    sendSuccess(res, HTTP_STATUS.OK, followInfo, 'Follow info retrieved');
  });

  /**
   * Get followers for a user
   * GET /api/users/:userId/followers
   */
  getUserFollowers = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const safeLimit = Math.max(1, Number(limit) || 50);
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safeLimit;

    const followers = await userService.getUserFollowers(userId, { limit: safeLimit, offset });

    sendSuccess(res, HTTP_STATUS.OK, { followers, page: safePage, limit: safeLimit }, 'Followers retrieved');
  });

  /**
   * Get users a user follows
   * GET /api/users/:userId/following
   */
  getUserFollowing = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const safeLimit = Math.max(1, Number(limit) || 50);
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safeLimit;

    const following = await userService.getUserFollowing(userId, { limit: safeLimit, offset });

    sendSuccess(res, HTTP_STATUS.OK, { following, page: safePage, limit: safeLimit }, 'Following retrieved');
  });

  /**
   * Get multiple user UUIDs by usernames
   * POST /api/users/lookup
   */
  getUserUUIDsByUsernames = asyncHandler(async (req, res) => {
    try {
      const { usernames } = req.body;

      if (!Array.isArray(usernames)) {
        return errorResponse(res, 'Usernames must be an array', 400);
      }

      // Basic implementation - would call userService to lookup users
      const result = await userService.getUsersByUsernames(usernames);

      return successResponse(res, result, 'Users looked up successfully');
    } catch (error) {
      logger.error('Error looking up users by usernames:', error);
      return errorResponse(res, 'Failed to lookup users', 500);
    }
  });
}

module.exports = new UserController();
