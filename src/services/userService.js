/**
 * User Service
 * Handles user-related business logic
 */

const UserRepository = require('../repositories/UserRepository');
const logger = require('../utils/logger');
const { NotFoundError, ValidationError, ConflictError } = require('../utils');
const { maskEmail } = require('../utils/helpers');

class UserService {
  /**
   * Get user by ID
   */
  async getUserById(userId) {
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }
    return user;
  }

  /**
   * Get user profile (safe public data)
   */
  async getUserProfile(userId) {
    try {
      const user = await this.getUserById(userId);

      // Return only public profile data
      return {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        bio: user.bio,
        location: user.location,
        native_language: user.native_language,
        profile_photo_url: user.profile_photo_url,
        role: user.role,
        created_at: user.created_at
      };
    } catch (error) {
      // User not found - let the error propagate to show proper 404
      logger.warn(`User profile requested for non-existent user: ${userId}`);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updateData) {
    // Validate user exists
    await this.getUserById(userId);

    // Prevent updating sensitive fields
    const allowedFields = [
      'username',
      'full_name',
      'bio',
      'location',
      'native_language',
      'dark_mode_preference'
    ];

    const filteredData = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    // Handle profile photo base64 update
    if (updateData.profile_photo_base64 !== undefined) {
      if (updateData.profile_photo_base64 === '' || updateData.profile_photo_base64 === null) {
        // Remove profile photo
        filteredData.profile_photo_url = null;
      } else if (typeof updateData.profile_photo_base64 === 'string') {
        // Update with new base64 image (store as-is or process if needed)
        filteredData.profile_photo_url = updateData.profile_photo_base64;
      }
    }

    if (Object.keys(filteredData).length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    // Check username uniqueness if updating username
    if (filteredData.username) {
      const existingUser = await UserRepository.findByUsername(filteredData.username);
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictError('Username is already taken', {
          field: 'username'
        });
      }
    }

    const updatedUser = await UserRepository.update(userId, filteredData);

    logger.info('User profile updated', {
      userId,
      updatedFields: Object.keys(filteredData)
    });

    return updatedUser;
  }

  /**
   * Update profile photo
   */
  async updateProfilePhoto(userId, photoUrl) {
    await this.getUserById(userId);

    const updatedUser = await UserRepository.update(userId, {
      profile_photo_url: photoUrl
    });

    logger.info('Profile photo updated', { userId, photoUrl });
    return updatedUser;
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(userId) {
    try {
      await this.getUserById(userId);

      const stats = await UserRepository.getStatistics(userId);

      // Calculate reputation score
      // Formula: discussions * 5 + answers * 2 + words * 3
      const discussionsStarted = parseInt(stats.discussions_started || 0);
      const answersPosted = parseInt(stats.answers_posted || 0);
      const wordsContributed = parseInt(stats.words_contributed || 0);

      const reputation = (discussionsStarted * 5) + (answersPosted * 2) + (wordsContributed * 3);

      return {
        wordsContributed,
        discussionsStarted,
        answersPosted,
        favoritesCount: parseInt(stats.favorites_count || 0),
        savedDiscussionsCount: parseInt(stats.saved_discussions_count || 0),
        reputation,
        // Voting statistics
        upvotedDiscussions: parseInt(stats.upvoted_discussions || 0),
        downvotedDiscussions: parseInt(stats.downvoted_discussions || 0),
        upvotedAnswers: parseInt(stats.upvoted_answers || 0),
        downvotedAnswers: parseInt(stats.downvoted_answers || 0),
        // Additional stats for badges
        total_discussions: discussionsStarted,
        total_messages: answersPosted,
        discussion_count: discussionsStarted,
        reply_count: answersPosted,
        total_contributions: wordsContributed
      };
    } catch (error) {
      // If user not found, return zero statistics
      if (error.statusCode === 404) {
        logger.warn(`Statistics requested for non-existent user: ${userId}`);
        return {
          wordsContributed: 0,
          discussionsStarted: 0,
          answersPosted: 0,
          favoritesCount: 0,
          reputation: 0,
          total_discussions: 0,
          total_messages: 0,
          discussion_count: 0,
          reply_count: 0,
          total_contributions: 0
        };
      }
      throw error;
    }
  }

  /**
   * Search users
   */
  async searchUsers(searchTerm, options = {}) {
    const { page = 1, limit = 10 } = options;

    const result = await UserRepository.list({
      page,
      limit,
      search: searchTerm,
      isActive: true
    });

    // Mask email addresses in search results
    result.users = result.users.map(user => ({
      ...user,
      email: maskEmail(user.email)
    }));

    return result;
  }

  /**
   * Deactivate user account
   */
  async deactivateAccount(userId) {
    await this.getUserById(userId);

    const updatedUser = await UserRepository.setActiveStatus(userId, false);

    logger.info('User account deactivated', { userId });
    return updatedUser;
  }

  /**
   * Reactivate user account (admin)
   */
  async reactivateAccount(userId) {
    await this.getUserById(userId);

    const updatedUser = await UserRepository.setActiveStatus(userId, true);

    logger.info('User account reactivated', { userId });
    return updatedUser;
  }

  /**
   * Delete user account (soft delete)
   */
  async deleteAccount(userId) {
    await this.getUserById(userId);

    await UserRepository.delete(userId);

    logger.info('User account deleted', { userId });
    return true;
  }



  /**
   * Get user's favorite words
   */
  async getFavoriteWords(userId, options = {}) {
    await this.getUserById(userId);

    // TODO: Implement favorite words retrieval
    // This would query the user_favorites table

    return {
      words: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0
      }
    };
  }

  /**
   * Check if username is available
   */
  async checkUsernameAvailability(username) {
    const user = await UserRepository.findByUsername(username);
    return {
      available: !user,
      username
    };
  }

  /**
   * Check if email is available
   */
  async checkEmailAvailability(email) {
    const user = await UserRepository.findByEmail(email);
    return {
      available: !user,
      email
    };
  }

  /**
   * List all users (admin function)
   */
  async listUsers(filters = {}) {
    const result = await UserRepository.list(filters);
    return result;
  }

  /**
   * Update user status (admin function)
   */
  async updateUserStatus(userId, isActive, adminId) {
    const user = await this.getUserById(userId);

    // Prevent deactivating yourself
    if (userId === adminId) {
      throw new ValidationError('Cannot deactivate your own account');
    }

    const updated = await UserRepository.update(userId, { is_active: isActive });

    logger.info('User status updated', { userId, isActive, adminId });

    return updated;
  }

  /**
   * Update user role (admin function)
   */
  async updateUserRole(userId, newRole, adminId) {
    const user = await this.getUserById(userId);

    // Prevent changing your own role
    if (userId === adminId) {
      throw new ValidationError('Cannot change your own role');
    }

    const updated = await UserRepository.update(userId, { role: newRole });

    logger.info('User role updated', { userId, newRole, adminId });

    return updated;
  }

  /**
   * Delete user (admin function - soft delete)
   */
  async deleteUser(userId, adminId) {
    const user = await this.getUserById(userId);

    // Prevent deleting yourself
    if (userId === adminId) {
      throw new ValidationError('Cannot delete your own account');
    }

    await UserRepository.delete(userId);

    logger.info('User deleted', { userId, adminId });

    return { success: true, message: 'User deleted successfully' };
  }

  /**
   * Get user suggestions for mentions
   */
  async getMentionSuggestions(searchTerm, limit = 10) {
    if (!searchTerm || searchTerm.length < 2) {
      return { users: [] };
    }

    try {
      // Search for users by username and full name
      const users = await UserRepository.searchUsersForMentions(searchTerm, limit);

      // Return simplified format for mentions
      const suggestions = users.map(user => ({
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        profile_photo_url: user.profile_photo_url,
        display_name: user.full_name || user.username
      }));

      return { users: suggestions };
    } catch (error) {
      logger.error('Error getting mention suggestions', {
        searchTerm,
        error: error.message
      });
      return { users: [] };
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username) {
    try {
      const user = await UserRepository.findByUsername(username);
      return user;
    } catch (error) {
      logger.error('Error getting user by username', {
        username,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get multiple user UUIDs by usernames
   */
  async getUserUUIDsByUsernames(usernames) {
    try {
      const users = await UserRepository.findByUsernames(usernames);

      // Create a map of username -> UUID
      const userMap = {};
      users.forEach(user => {
        if (user.username) {
          userMap[user.username] = user.id;
        }
      });

      return userMap;
    } catch (error) {
      logger.error('Error getting user UUIDs by usernames', {
        usernames,
        error: error.message
      });
      return {};
    }
  }

  /**
   * Follow a user
   */
  async followUser(followerId, followingId) {
    if (followerId === followingId) {
      throw new ValidationError('Cannot follow yourself');
    }

    // Check if users exist
    await this.getUserById(followerId);
    await this.getUserById(followingId);

    try {
      // Check if already following
      const existingFollow = await UserRepository.findFollow(followerId, followingId);
      if (existingFollow) {
        throw new ConflictError('Already following this user');
      }

      // Create follow relationship
      const follow = await UserRepository.createFollow(followerId, followingId);

      // Create notification for followed user
      try {
        const [follower, followed] = await Promise.all([
          UserRepository.findById(followerId),
          UserRepository.findById(followingId)
        ]);

        if (follower && followed) {
          const notificationController = require('../controllers/notificationController');
          await notificationController.createNotification({
            userId: followingId,
            type: 'follow',
            title: 'New follower',
            message: `${follower.full_name || follower.username || 'Someone'} started following you`,
            related_type: 'user',
            related_id: followerId
          });
        }
      } catch (notifError) {
        logger.error('Error creating follow notification', {
          followerId,
          followingId,
          error: notifError.message
        });
      }

      logger.info('User follow created', { followerId, followingId });
      return follow;
    } catch (error) {
      if (error instanceof ConflictError || error instanceof ValidationError) {
        throw error;
      }
      logger.error('Error creating follow relationship', {
        followerId,
        followingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId, followingId) {
    if (followerId === followingId) {
      throw new ValidationError('Cannot unfollow yourself');
    }

    try {
      // Check if currently following
      const existingFollow = await UserRepository.findFollow(followerId, followingId);
      if (!existingFollow) {
        throw new NotFoundError('Not following this user');
      }

      // Remove follow relationship
      await UserRepository.deleteFollow(followerId, followingId);

      logger.info('User unfollow completed', { followerId, followingId });
      return { success: true };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      logger.error('Error removing follow relationship', {
        followerId,
        followingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get follow information for a user
   */
  async getFollowInfo(userId, currentUserId = null) {
    try {
      await this.getUserById(userId);

      const [followersCount, followingCount, isFollowing] = await Promise.all([
        UserRepository.getFollowersCount(userId),
        UserRepository.getFollowingCount(userId),
        currentUserId ? UserRepository.findFollow(currentUserId, userId) : null
      ]);

      return {
        followersCount: followersCount || 0,
        followingCount: followingCount || 0,
        isFollowing: !!isFollowing
      };
    } catch (error) {
      logger.error('Error getting follow info', {
        userId,
        currentUserId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's followers
   */
  async getUserFollowers(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      await this.getUserById(userId);
      const followers = await UserRepository.getFollowers(userId, { limit, offset });

      return followers;
    } catch (error) {
      logger.error('Error getting user followers', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get users that a user is following
   */
  async getUserFollowing(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      await this.getUserById(userId);
      const following = await UserRepository.getFollowing(userId, { limit, offset });

      return following;
    } catch (error) {
      logger.error('Error getting user following', {
        userId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new UserService();
