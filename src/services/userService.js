/**
 * User Service
 * Handles user-related business logic
 */

const UserRepository = require('../repositories/UserRepository');
const logger = require('../utils/logger');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
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
        reputation,
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
   * List users (admin)
   */
  async listUsers(options = {}) {
    const result = await UserRepository.list(options);
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
   * Update user role (admin)
   */
  async updateUserRole(userId, newRole) {
    await this.getUserById(userId);

    const updatedUser = await UserRepository.update(userId, { role: newRole });

    logger.info('User role updated', { userId, newRole });
    return updatedUser;
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
}

module.exports = new UserService();
