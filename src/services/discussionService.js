/**
 * Discussion Service
 * Business logic layer for discussion forum
 */

const DiscussionRepository = require('../repositories/DiscussionRepository');
const UserRepository = require('../repositories/UserRepository');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

class DiscussionService {
  /**
   * Category metadata
   */
  getCategoryMetadata() {
    return {
      home: {
        name: 'Home',
        icon: '🏠',
        color: '#10b981',
        description: 'Welcome to the community'
      },
      general: {
        name: 'General Discussion',
        icon: '💬',
        color: '#6366f1',
        description: 'General topics and casual conversation'
      },
      'language-learning': {
        name: 'Language Learning',
        icon: '📚',
        color: '#f59e0b',
        description: 'Discuss language learning tips and resources'
      },
      grammar: {
        name: 'Grammar',
        icon: '📝',
        color: '#10b981',
        description: 'Questions about grammar rules and usage'
      },
      vocabulary: {
        name: 'Vocabulary',
        icon: '📖',
        color: '#f59e0b',
        description: 'Learn and discuss new words and phrases'
      },
      culture: {
        name: 'Culture & Traditions',
        icon: '🎭',
        color: '#ec4899',
        description: 'Share and discuss cultural practices and traditions'
      },
      pronunciation: {
        name: 'Pronunciation',
        icon: '🗣️',
        color: '#8b5cf6',
        description: 'Practice and discuss pronunciation'
      },
      translation: {
        name: 'Translation',
        icon: '🌐',
        color: '#6366f1',
        description: 'Request and provide translations'
      },
      etymology: {
        name: 'Etymology',
        icon: '📜',
        color: '#f59e0b',
        description: 'Explore word origins and history'
      },
      members: {
        name: 'Members',
        icon: '👥',
        color: '#3b82f6',
        description: 'Connect with community members'
      },
      'community-chat': {
        name: 'Community Chat',
        icon: '💭',
        color: '#14b8a6',
        description: 'Casual chat and community conversations'
      },
      other: {
        name: 'Other',
        icon: '💭',
        color: '#6b7280',
        description: 'Other topics and discussions'
      }
    };
  }

  /**
   * Get categories with discussion counts
   */
  async getCategoriesWithCounts() {
    try {
      const categoryMetadata = this.getCategoryMetadata();

      // Get counts from database using repository
      const counts = await DiscussionRepository.getCountsByCategory();

      // Add counts to metadata
      const categoriesWithCounts = {};
      Object.entries(categoryMetadata).forEach(([key, metadata]) => {
        categoriesWithCounts[key] = {
          ...metadata,
          count: counts[key] || 0
        };
      });

      return categoriesWithCounts;
    } catch (error) {
      logger.error('Error getting categories with counts', { error: error.message });
      // Return metadata without counts on error
      return this.getCategoryMetadata();
    }
  }

  /**
   * Get all discussions with filters
   */
  async getAllDiscussions(filters, userId = null) {
    try {
      const result = await DiscussionRepository.getAll(filters, userId);

      // Enrich discussions with category metadata
      const categoryMetadata = this.getCategoryMetadata();
      result.data = result.data.map(discussion =>
        this._enrichDiscussion(discussion, categoryMetadata)
      );

      return result;
    } catch (error) {
      logger.error('Error in getAllDiscussions service', { error: error.message });
      throw error;
    }
  }

  /**
   * Get discussion by ID
   */
  async getDiscussionById(discussionId, userId = null) {
    try {
      const discussion = await DiscussionRepository.findByIdWithContext(discussionId, userId);

      // Enrich with category metadata
      const categoryMetadata = this.getCategoryMetadata();
      const enrichedDiscussion = this._enrichDiscussion(discussion, categoryMetadata);

      return enrichedDiscussion;
    } catch (error) {
      logger.error('Error in getDiscussionById service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Create new discussion
   */
  async createDiscussion(discussionData, userId) {
    try {
      const { title, content, category, tags, images } = discussionData;

      // Validate required fields
      if (!title || !content) {
        throw new ValidationError('Title and content are required');
      }

      // Process tags
      const processedTags = this._processTags(tags);

      // Process images
      const processedImages = this._processImages(images);

      // Create discussion
      const discussion = await DiscussionRepository.create({
        author_id: userId,
        title,
        content,
        category: category || 'general',
        tags: processedTags,
        images: processedImages
      });

      // Get author info
      const author = await UserRepository.findById(userId);

      logger.info('Discussion created', {
        discussionId: discussion.id,
        userId,
        category
      });

      return {
        discussion,
        author
      };
    } catch (error) {
      logger.error('Error in createDiscussion service', { error: error.message });
      throw error;
    }
  }

  /**
   * Update discussion
   */
  async updateDiscussion(discussionId, updateData, userId, userRole) {
    try {
      const { title, content, category, tags, images } = updateData;

      // Validate required fields
      if (!title || !content) {
        throw new ValidationError('Title and content are required');
      }

      // Check if discussion exists and verify permissions
      const discussion = await DiscussionRepository.findByIdWithContext(discussionId);

      if (discussion.author_id !== userId && userRole !== 'admin') {
        throw new ForbiddenError('You do not have permission to edit this discussion');
      }

      // Process data
      const processedTags = this._processTags(tags);
      const processedImages = this._processImages(images);

      // Update discussion
      const updatedDiscussion = await DiscussionRepository.update(discussionId, {
        title,
        content,
        category: category || 'general',
        tags: processedTags,
        images: processedImages
      });

      logger.info('Discussion updated', { discussionId, userId });

      return updatedDiscussion;
    } catch (error) {
      logger.error('Error in updateDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete discussion
   */
  async deleteDiscussion(discussionId, userId, userRole) {
    try {
      // Check if discussion exists and verify permissions
      const discussion = await DiscussionRepository.findByIdWithContext(discussionId);

      if (discussion.author_id !== userId && userRole !== 'admin') {
        throw new ForbiddenError('You do not have permission to delete this discussion');
      }

      await DiscussionRepository.delete(discussionId);

      logger.info('Discussion deleted', { discussionId, userId });

      return true;
    } catch (error) {
      logger.error('Error in deleteDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Vote on discussion
   */
  async voteDiscussion(discussionId, userId, voteType) {
    try {
      // Validate vote type
      if (!['up', 'down'].includes(voteType)) {
        throw new ValidationError('Invalid vote type. Must be "up" or "down"');
      }

      // Check if discussion exists
      const discussion = await DiscussionRepository.findByIdWithContext(discussionId);

      // Upsert vote
      const voteResult = await DiscussionRepository.upsertVote(discussionId, userId, voteType);

      // Get updated vote counts
      const voteCounts = await DiscussionRepository.getVoteCounts(discussionId);

      logger.info('Vote processed on discussion', {
        discussionId,
        userId,
        action: voteResult.action,
        voteType: voteResult.voteType
      });

      return {
        ...voteResult,
        ...voteCounts,
        discussion
      };
    } catch (error) {
      logger.error('Error in voteDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Mark discussion as solved
   */
  async markAsSolved(discussionId, userId) {
    try {
      const discussion = await DiscussionRepository.findByIdWithContext(discussionId);

      // Only author can mark as solved
      if (discussion.author_id !== userId) {
        throw new ForbiddenError('Only the discussion author can mark it as solved');
      }

      const updatedDiscussion = await DiscussionRepository.markAsSolved(discussionId);

      logger.info('Discussion marked as solved', { discussionId, userId });

      return updatedDiscussion;
    } catch (error) {
      logger.error('Error in markAsSolved service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Unmark discussion as solved
   */
  async unmarkAsSolved(discussionId, userId) {
    try {
      const discussion = await DiscussionRepository.findByIdWithContext(discussionId);

      // Only author can unmark as solved
      if (discussion.author_id !== userId) {
        throw new ForbiddenError('Only the discussion author can unmark it as solved');
      }

      const updatedDiscussion = await DiscussionRepository.unmarkAsSolved(discussionId);

      logger.info('Discussion unmarked as solved', { discussionId, userId });

      return updatedDiscussion;
    } catch (error) {
      logger.error('Error in unmarkAsSolved service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Pin discussion (admin only)
   */
  async pinDiscussion(discussionId, userRole) {
    try {
      if (userRole !== 'admin') {
        throw new ForbiddenError('Only admins can pin discussions');
      }

      const updatedDiscussion = await DiscussionRepository.pinDiscussion(discussionId);

      logger.info('Discussion pinned', { discussionId });

      return updatedDiscussion;
    } catch (error) {
      logger.error('Error in pinDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Unpin discussion (admin only)
   */
  async unpinDiscussion(discussionId, userRole) {
    try {
      if (userRole !== 'admin') {
        throw new ForbiddenError('Only admins can unpin discussions');
      }

      const updatedDiscussion = await DiscussionRepository.unpinDiscussion(discussionId);

      logger.info('Discussion unpinned', { discussionId });

      return updatedDiscussion;
    } catch (error) {
      logger.error('Error in unpinDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Lock discussion (admin only)
   */
  async lockDiscussion(discussionId, userRole) {
    try {
      if (userRole !== 'admin') {
        throw new ForbiddenError('Only admins can lock discussions');
      }

      const updatedDiscussion = await DiscussionRepository.lockDiscussion(discussionId);

      logger.info('Discussion locked', { discussionId });

      return updatedDiscussion;
    } catch (error) {
      logger.error('Error in lockDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Unlock discussion (admin only)
   */
  async unlockDiscussion(discussionId, userRole) {
    try {
      if (userRole !== 'admin') {
        throw new ForbiddenError('Only admins can unlock discussions');
      }

      const updatedDiscussion = await DiscussionRepository.unlockDiscussion(discussionId);

      logger.info('Discussion unlocked', { discussionId });

      return updatedDiscussion;
    } catch (error) {
      logger.error('Error in unlockDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Save discussion (bookmark)
   */
  async saveDiscussion(discussionId, userId) {
    try {
      // Check if discussion exists
      await DiscussionRepository.findByIdWithContext(discussionId);

      const saved = await DiscussionRepository.saveDiscussion(discussionId, userId);

      if (!saved) {
        throw new ValidationError('Discussion already saved');
      }

      logger.info('Discussion saved', { discussionId, userId });

      return true;
    } catch (error) {
      logger.error('Error in saveDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Unsave discussion (remove bookmark)
   */
  async unsaveDiscussion(discussionId, userId) {
    try {
      const unsaved = await DiscussionRepository.unsaveDiscussion(discussionId, userId);

      if (!unsaved) {
        throw new ValidationError('Discussion was not saved');
      }

      logger.info('Discussion unsaved', { discussionId, userId });

      return true;
    } catch (error) {
      logger.error('Error in unsaveDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Get saved discussions
   */
  async getSavedDiscussions(userId, page = 1, limit = 10) {
    try {
      const result = await DiscussionRepository.getSavedDiscussions(userId, page, limit);

      // Enrich discussions
      const categoryMetadata = this.getCategoryMetadata();
      result.data = result.data.map(discussion =>
        this._enrichDiscussion(discussion, categoryMetadata)
      );

      return result;
    } catch (error) {
      logger.error('Error in getSavedDiscussions service', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get related discussions
   */
  async getRelatedDiscussions(discussionId, limit = 5) {
    try {
      const discussions = await DiscussionRepository.getRelatedDiscussions(discussionId, limit);

      // Enrich discussions
      const categoryMetadata = this.getCategoryMetadata();
      const enrichedDiscussions = discussions.map(discussion =>
        this._enrichDiscussion(discussion, categoryMetadata)
      );

      return enrichedDiscussions;
    } catch (error) {
      logger.error('Error in getRelatedDiscussions service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Report discussion
   */
  async reportDiscussion(discussionId, userId, reason, details) {
    try {
      // Validate reason
      if (!reason || !reason.trim()) {
        throw new ValidationError('Reason is required');
      }

      // Check if discussion exists
      await DiscussionRepository.findByIdWithContext(discussionId);

      const report = await DiscussionRepository.reportDiscussion({
        discussion_id: discussionId,
        reported_by: userId,
        reason,
        details: details || ''
      });

      logger.info('Discussion reported', { discussionId, userId, reason });

      return report;
    } catch (error) {
      logger.error('Error in reportDiscussion service', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  _enrichDiscussion(discussion, categoryMetadata) {
    // Parse images if string
    if (discussion.images && typeof discussion.images === 'string') {
      try {
        discussion.images = JSON.parse(discussion.images);
      } catch (error) {
        logger.warn('Failed to parse images JSON', { discussionId: discussion.id });
        discussion.images = [];
      }
    } else if (!discussion.images) {
      discussion.images = [];
    }

    // Enrich category information
    if (discussion.category && categoryMetadata[discussion.category]) {
      discussion.category = {
        id: discussion.category,
        name: categoryMetadata[discussion.category].name,
        icon: categoryMetadata[discussion.category].icon,
        color: categoryMetadata[discussion.category].color
      };
    }

    // Format user data for frontend
    if (discussion.author_name || discussion.author_role || discussion.author_profile_photo) {
      discussion.user_data = {
        username: discussion.author_name || 'Anonymous',
        role: discussion.author_role || 'user',
        display_picture: discussion.author_profile_photo || null
      };

      // Clean up individual fields
      delete discussion.author_name;
      delete discussion.author_role;
      delete discussion.author_profile_photo;
    }

    return discussion;
  }

  _processTags(tags) {
    if (!tags) return [];

    if (Array.isArray(tags)) {
      return tags
        .filter(tag => tag && typeof tag === 'string' && tag.trim().length > 0)
        .map(tag => tag.trim().toLowerCase())
        .slice(0, 10); // Limit to 10 tags
    } else if (typeof tags === 'string' && tags.trim().length > 0) {
      return [tags.trim().toLowerCase()];
    }

    return [];
  }

  _processImages(images) {
    if (!images || !Array.isArray(images)) {
      return [];
    }

    const processedImages = [];

    for (const image of images) {
      // Handle object format: {data: "base64string"}
      if (image.data && typeof image.data === 'string' && image.data.startsWith('data:image/')) {
        processedImages.push(image.data);
      }
      // Handle direct base64 string format
      else if (typeof image === 'string' && image.startsWith('data:image/')) {
        processedImages.push(image);
      }
    }

    return processedImages;
  }
}

module.exports = new DiscussionService();
