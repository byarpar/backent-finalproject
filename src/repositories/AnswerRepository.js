/**
 * Answer Repository
 * Data access layer for discussion answers
 */

const BaseRepository = require('../models/BaseRepository');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

class AnswerRepository extends BaseRepository {
  constructor() {
    super('answers');

    this.columns = `
      a.id,
      a.discussion_id,
      a.author_id,
      a.content,
      a.images,
      a.replies,
      a.vote_count,
      a.upvotes,
      a.downvotes,
      a.reply_count,
      a.created_at,
      a.updated_at,
      u.username as author_name,
      u.role as author_role,
      u.profile_photo_url as author_profile_photo
    `;
  }

  /**
   * Get answers for a discussion with vote information
   */
  async getAnswersForDiscussion(discussionId, userId = null) {
    try {
      const query = `
        SELECT 
          ${this.columns},
          av.vote_type as user_vote
        FROM ${this.tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        LEFT JOIN answer_votes av ON a.id = av.answer_id AND av.user_id = $2
        WHERE a.discussion_id = $1
        ORDER BY a.created_at DESC
      `;

      const result = await this.db.query(query, [discussionId, userId]);

      // Replies are already stored in the replies JSONB column
      const answers = result.rows.map(row => ({
        ...row,
        replies: Array.isArray(row.replies) ? row.replies : []
      }));

      logger.info('Answers fetched for discussion', {
        discussionId,
        count: answers.length,
        withReplies: answers.filter(a => a.replies && a.replies.length > 0).length
      });

      return answers;
    } catch (error) {
      logger.error('Error fetching answers for discussion', {
        discussionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get answer by ID
   */
  async findById(answerId) {
    try {
      const query = `
        SELECT ${this.columns}
        FROM ${this.tableName} a
        LEFT JOIN users u ON a.author_id = u.id
        WHERE a.id = $1
      `;

      const result = await this.db.query(query, [answerId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding answer by ID', { answerId, error: error.message });
      throw error;
    }
  }

  /**
   * Get answer with discussion info
   */
  async getAnswerWithDiscussion(answerId) {
    try {
      const query = `
        SELECT 
          a.id,
          a.author_id,
          a.discussion_id,
          a.content,
          a.images,
          a.vote_count,
          a.upvotes,
          a.downvotes,
          a.created_at,
          d.title as discussion_title,
          d.author_id as discussion_author_id
        FROM ${this.tableName} a
        LEFT JOIN discussions d ON a.discussion_id = d.id
        WHERE a.id = $1
      `;

      const result = await this.db.query(query, [answerId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting answer with discussion', {
        answerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create new answer or add reply to existing answer
   */
  async create(answerData) {
    try {
      const {
        discussion_id,
        author_id,
        content,
        parent_answer_id = null,
        images = []
      } = answerData;

      // If this is a reply, add it to the parent's replies array
      if (parent_answer_id) {
        // Get author information
        const authorQuery = `
          SELECT id, username, role, profile_photo_url
          FROM users
          WHERE id = $1
        `;
        const authorResult = await this.db.query(authorQuery, [author_id]);
        const author = authorResult.rows[0];

        const newReply = {
          id: require('crypto').randomUUID(),
          content,
          images,
          author_id,
          author_name: author?.username || 'Anonymous',
          author_role: author?.role || 'user',
          author_profile_photo: author?.profile_photo_url || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          vote_count: 0,
          upvotes: 0,
          downvotes: 0
        };

        const query = `
          UPDATE ${this.tableName}
          SET replies = replies || $1::jsonb,
              reply_count = reply_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;

        const result = await this.db.query(query, [
          JSON.stringify([newReply]),
          parent_answer_id
        ]);

        logger.info('Reply added to answer', {
          replyId: newReply.id,
          parentAnswerId: parent_answer_id,
          authorId: author_id
        });

        return { ...result.rows[0], new_reply: newReply };
      }

      // Otherwise, create a new top-level answer
      const query = `
        INSERT INTO ${this.tableName} (
          discussion_id,
          author_id,
          content,
          images,
          replies,
          reply_count
        ) VALUES ($1, $2, $3, $4, '[]'::jsonb, 0)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        discussion_id,
        author_id,
        content,
        JSON.stringify(images)
      ]);

      logger.info('Answer created', {
        answerId: result.rows[0].id,
        discussionId: discussion_id,
        authorId: author_id
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating answer', { error: error.message });
      throw error;
    }
  }

  /**
   * Update answer
   */
  async update(answerId, updateData) {
    try {
      const { content, images } = updateData;

      const query = `
        UPDATE ${this.tableName}
        SET content = $1,
            images = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;

      const result = await this.db.query(query, [
        content,
        JSON.stringify(images || []),
        answerId
      ]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Answer not found');
      }

      logger.info('Answer updated', { answerId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating answer', { answerId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete answer
   */
  async delete(answerId) {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING discussion_id`;
      const result = await this.db.query(query, [answerId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Answer not found');
      }

      logger.info('Answer deleted', { answerId });
      return result.rows[0].discussion_id;
    } catch (error) {
      logger.error('Error deleting answer', { answerId, error: error.message });
      throw error;
    }
  }

  /**
   * Increment discussion answer count
   */
  async incrementDiscussionAnswerCount(discussionId) {
    try {
      await this.db.query(
        'UPDATE discussions SET answers_count = answers_count + 1 WHERE id = $1',
        [discussionId]
      );
    } catch (error) {
      logger.error('Error incrementing answer count', {
        discussionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Decrement discussion answer count
   */
  async decrementDiscussionAnswerCount(discussionId) {
    try {
      await this.db.query(
        'UPDATE discussions SET answers_count = GREATEST(0, answers_count - 1) WHERE id = $1',
        [discussionId]
      );
    } catch (error) {
      logger.error('Error decrementing answer count', {
        discussionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if parent answer exists and belongs to discussion
   */
  async verifyParentAnswer(parentAnswerId, discussionId) {
    try {
      const query = `
        SELECT id FROM ${this.tableName}
        WHERE id = $1 AND discussion_id = $2
      `;

      const result = await this.db.query(query, [parentAnswerId, discussionId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error verifying parent answer', {
        parentAnswerId,
        discussionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Vote operations
   */

  /**
   * Get user's vote on an answer
   */
  async getUserVote(answerId, userId) {
    try {
      const query = 'SELECT vote_type FROM answer_votes WHERE answer_id = $1 AND user_id = $2';
      const result = await this.db.query(query, [answerId, userId]);
      return result.rows[0]?.vote_type || null;
    } catch (error) {
      logger.error('Error getting user vote', { answerId, userId, error: error.message });
      throw error;
    }
  }

  /**
   * Add or update vote
   */
  async upsertVote(answerId, userId, voteType) {
    try {
      const existingVote = await this.getUserVote(answerId, userId);

      if (existingVote) {
        if (existingVote === voteType) {
          // Remove vote (toggle off)
          await this.db.query(
            'DELETE FROM answer_votes WHERE answer_id = $1 AND user_id = $2',
            [answerId, userId]
          );
          logger.info('Vote removed', { answerId, userId, voteType });
          return { action: 'removed', voteType: null };
        } else {
          // Update vote
          await this.db.query(
            'UPDATE answer_votes SET vote_type = $1, updated_at = CURRENT_TIMESTAMP WHERE answer_id = $2 AND user_id = $3',
            [voteType, answerId, userId]
          );
          logger.info('Vote updated', { answerId, userId, voteType });
          return { action: 'updated', voteType };
        }
      } else {
        // Create new vote
        await this.db.query(
          'INSERT INTO answer_votes (answer_id, user_id, vote_type) VALUES ($1, $2, $3)',
          [answerId, userId, voteType]
        );
        logger.info('Vote created', { answerId, userId, voteType });
        return { action: 'created', voteType };
      }
    } catch (error) {
      logger.error('Error upserting vote', { answerId, userId, voteType, error: error.message });
      throw error;
    }
  }

  /**
   * Remove vote
   */
  async removeVote(answerId, userId) {
    try {
      const result = await this.db.query(
        'DELETE FROM answer_votes WHERE answer_id = $1 AND user_id = $2 RETURNING *',
        [answerId, userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('No vote found to remove');
      }

      logger.info('Vote removed', { answerId, userId });
      return true;
    } catch (error) {
      logger.error('Error removing vote', { answerId, userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get vote counts for an answer
   */
  async getVoteCounts(answerId) {
    try {
      const query = 'SELECT vote_count, upvotes, downvotes FROM answers WHERE id = $1';
      const result = await this.db.query(query, [answerId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Answer not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting vote counts', { answerId, error: error.message });
      throw error;
    }
  }
}

module.exports = new AnswerRepository();
