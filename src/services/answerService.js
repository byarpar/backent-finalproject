/**
 * Answer Service
 * Business logic layer for discussion answers
 */

const AnswerRepository = require('../repositories/AnswerRepository');
const UserRepository = require('../repositories/UserRepository');
const { extractMentions, getMentionContext, normalizeMentions } = require('../utils/mentionUtils');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils');
const logger = require('../utils/logger');

class AnswerService {
  /**
   * Get answers for a discussion
   */
  async getAnswersForDiscussion(discussionId, userId = null) {
    try {
      return await AnswerRepository.getAnswersForDiscussion(discussionId, userId);
    } catch (error) {
      logger.error('Error in getAnswersForDiscussion service', {
        discussionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create a new answer
   */
  async createAnswer(answerData, userId) {
    try {
      const { discussion_id, content, images, parent_answer_id } = answerData;

      // Validate required fields
      if (!discussion_id || !content?.trim()) {
        throw new ValidationError('Discussion ID and content are required');
      }

      // Check if discussion exists
      const discussion = await this._getDiscussionInfo(discussion_id);

      // If parent answer provided, verify it exists
      if (parent_answer_id) {
        const isValid = await AnswerRepository.verifyParentAnswer(
          parent_answer_id,
          discussion_id
        );

        if (!isValid) {
          throw new NotFoundError('Parent answer not found in this discussion');
        }
      }

      // Process images (extract base64 data)
      const processedImages = this._processImages(images);

      // Extract mentions from content
      const mentions = normalizeMentions(extractMentions(content.trim()));

      // Create answer
      const answer = await AnswerRepository.create({
        discussion_id,
        author_id: userId,
        content: content.trim(),
        parent_answer_id,
        images: processedImages
      });

      // Update discussion answer count
      await AnswerRepository.incrementDiscussionAnswerCount(discussion_id);

      // Get author info to include in response
      const author = await UserRepository.findById(userId);

      // Handle mentions - create notifications for mentioned users
      if (mentions.length > 0) {
        await this._handleMentions(mentions, answer, author, discussion, 'reply');
      }

      const enrichedAnswer = {
        ...answer,
        author_name: author.username,
        author_role: author.role,
        likes_count: 0,
        is_liked: false
      };

      logger.info('Answer created successfully', {
        answerId: answer.id,
        discussionId: discussion_id,
        userId,
        mentions: mentions.length
      });

      return {
        answer: enrichedAnswer,
        discussion,
        author
      };
    } catch (error) {
      logger.error('Error in createAnswer service', { error: error.message });
      throw error;
    }
  }

  /**
   * Update an answer
   */
  async updateAnswer(answerId, updateData, userId, userRole) {
    try {
      const { content, images } = updateData;

      // Validate content
      if (!content?.trim()) {
        throw new ValidationError('Content is required');
      }

      // Check if answer exists and verify permissions
      const answer = await AnswerRepository.findById(answerId);

      if (!answer) {
        throw new NotFoundError('Answer not found');
      }

      if (answer.author_id !== userId && userRole !== 'admin') {
        throw new ForbiddenError('You do not have permission to edit this answer');
      }

      // Process images
      const processedImages = this._processImages(images);

      // Update answer
      const updatedAnswer = await AnswerRepository.update(answerId, {
        content: content.trim(),
        images: processedImages
      });

      logger.info('Answer updated successfully', { answerId, userId });

      return updatedAnswer;
    } catch (error) {
      logger.error('Error in updateAnswer service', { answerId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete an answer
   */
  async deleteAnswer(answerId, userId, userRole) {
    try {
      // Check if answer exists and verify permissions
      const answer = await AnswerRepository.findById(answerId);

      if (!answer) {
        throw new NotFoundError('Answer not found');
      }

      if (answer.author_id !== userId && userRole !== 'admin') {
        throw new ForbiddenError('You do not have permission to delete this answer');
      }

      const discussionId = answer.discussion_id;

      // Delete answer
      await AnswerRepository.delete(answerId);

      // Update discussion answer count
      await AnswerRepository.decrementDiscussionAnswerCount(discussionId);

      logger.info('Answer deleted successfully', { answerId, userId });

      return true;
    } catch (error) {
      logger.error('Error in deleteAnswer service', { answerId, error: error.message });
      throw error;
    }
  }

  /**
   * Vote on an answer
   */
  async voteAnswer(answerId, userId, voteType) {
    try {
      // Validate vote type
      if (!['up', 'down'].includes(voteType)) {
        throw new ValidationError('Invalid vote type. Must be "up" or "down"');
      }

      // Check if answer exists
      const answer = await AnswerRepository.getAnswerWithDiscussion(answerId);

      if (!answer) {
        throw new NotFoundError('Answer not found');
      }

      // Upsert vote
      const voteResult = await AnswerRepository.upsertVote(answerId, userId, voteType);

      // Get updated vote counts
      const voteCounts = await AnswerRepository.getVoteCounts(answerId);

      logger.info('Vote processed', {
        answerId,
        userId,
        action: voteResult.action,
        voteType: voteResult.voteType
      });

      return {
        ...voteResult,
        ...voteCounts,
        answer
      };
    } catch (error) {
      logger.error('Error in voteAnswer service', { answerId, error: error.message });
      throw error;
    }
  }

  /**
   * Remove vote from an answer
   */
  async removeVote(answerId, userId) {
    try {
      await AnswerRepository.removeVote(answerId, userId);

      const voteCounts = await AnswerRepository.getVoteCounts(answerId);

      logger.info('Vote removed', { answerId, userId });

      return voteCounts;
    } catch (error) {
      logger.error('Error in removeVote service', { answerId, error: error.message });
      throw error;
    }
  }

  /**
   * Get user's vote on an answer
   */
  async getUserVote(answerId, userId) {
    try {
      const voteType = await AnswerRepository.getUserVote(answerId, userId);
      return { vote_type: voteType };
    } catch (error) {
      logger.error('Error in getUserVote service', { answerId, error: error.message });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  /**
   * Get discussion info
   */
  async _getDiscussionInfo(discussionId) {
    try {
      const { db } = require('../config/database');
      const result = await db.query(
        'SELECT id, title, author_id FROM discussions WHERE id = $1',
        [discussionId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;

      logger.error('Error getting discussion info', {
        discussionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process and extract base64 images
   */
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

  /**
   * Handle mentions - find mentioned users and create notifications
   * @param {Array<string>} mentions - Array of mentioned usernames
   * @param {Object} answer - Answer object
   * @param {Object} author - Author object
   * @param {Object} discussion - Discussion object
   * @param {string} type - Type of content (reply, comment, etc.)
   * @private
   */
  async _handleMentions(mentions, answer, author, discussion, type = 'reply') {
    if (!mentions || mentions.length === 0) {
      return;
    }

    try {
      // Find users by username (mentions are normalized to lowercase)
      const users = await UserRepository.findByUsernames(mentions);

      if (users.length === 0) {
        logger.info('No valid users found for mentions', { mentions });
        return;
      }

      // Prepare notifications for mentioned users
      const notifications = [];

      for (const user of users) {
        // Don't notify the author of their own mention
        if (user.id === author.id) {
          continue;
        }

        // Get mention context from content
        const mentionContext = getMentionContext(answer.content, user.username, 150);

        const message = `${author.username || author.full_name || 'Someone'} mentioned you in a reply to "${discussion.title}"`;

        notifications.push({
          userId: user.id,
          type: 'mention',
          category: 'mentions',
          message,
          title: `Mentioned in Reply`,
          content: mentionContext,
          targetLink: `/discussions/${discussion.id}#answer-${answer.id}`,
          targetId: answer.id,
          targetType: type,
          actorId: author.id,
          actorName: author.username || author.full_name,
          actorAvatar: author.profile_photo_url,
          metadata: {
            discussionId: discussion.id,
            discussionTitle: discussion.title,
            answerId: answer.id,
            mentionType: type
          }
        });
      }

      // Notifications have been removed - mentions are still tracked but no notifications sent
      if (notifications.length > 0) {
        logger.info('Mentions processed (notifications disabled)', {
          answerId: answer.id,
          discussionId: discussion.id,
          mentionedUsers: notifications.map(n => n.userId)
        });
      }

    } catch (error) {
      // Log error but don't fail the answer creation
      logger.error('Error handling mentions in reply', {
        answerId: answer.id,
        mentions,
        error: error.message
      });
    }
  }
}

module.exports = new AnswerService();
