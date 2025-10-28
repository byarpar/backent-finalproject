/**
 * Discussion Repository
 * Data access layer for discussion forum
 */

const BaseRepository = require('../models/BaseRepository');
const { NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

class DiscussionRepository extends BaseRepository {
  constructor() {
    super('discussions');

    this.columns = `
      d.id,
      d.author_id,
      d.title,
      d.content,
      d.category,
      d.tags,
      d.images,
      d.vote_count,
      d.upvotes,
      d.downvotes,
      d.answers_count,
      d.is_solved,
      d.is_pinned,
      d.is_locked,
      d.created_at,
      d.updated_at,
      u.username as author_name,
      u.role as author_role,
      u.profile_photo_url as author_profile_photo
    `;
  }

  /**
   * Get all discussions with filters and pagination
   */
  async getAll(filters = {}, userId = null) {
    try {
      const {
        page = 1,
        limit = 10,
        category,
        search,
        sortBy = 'recent',
        authorId,
        filter
      } = filters;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const queryParams = [userId];
      const whereConditions = [];

      let query = `
        SELECT 
          ${this.columns},
          dv.vote_type as user_vote,
          CASE WHEN sd.discussion_id IS NOT NULL THEN true ELSE false END as is_saved
        FROM ${this.tableName} d
        LEFT JOIN users u ON d.author_id = u.id
        LEFT JOIN discussion_votes dv ON d.id = dv.discussion_id AND dv.user_id = $1
        LEFT JOIN saved_discussions sd ON d.id = sd.discussion_id AND sd.user_id = $1
      `;

      // Build WHERE conditions
      this._buildWhereConditions(
        { authorId, category, search, filter, userId },
        queryParams,
        whereConditions
      );

      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }

      // Add sorting
      query += this._buildOrderByClause(sortBy);

      // Add pagination
      query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(parseInt(limit), offset);

      const result = await this.db.query(query, queryParams);

      // Get total count
      const total = await this._getFilteredCount(filters, userId);

      logger.info('Discussions fetched', { count: result.rows.length, total });

      return {
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      logger.error('Error fetching discussions', { error: error.message });
      throw error;
    }
  }

  /**
   * Get discussion by ID with user context
   */
  async findByIdWithContext(discussionId, userId = null) {
    try {
      const query = `
        SELECT 
          ${this.columns},
          dv.vote_type as user_vote,
          CASE WHEN sd.discussion_id IS NOT NULL THEN true ELSE false END as is_saved
        FROM ${this.tableName} d
        LEFT JOIN users u ON d.author_id = u.id
        LEFT JOIN discussion_votes dv ON d.id = dv.discussion_id AND dv.user_id = $2
        LEFT JOIN saved_discussions sd ON d.id = sd.discussion_id AND sd.user_id = $2
        WHERE d.id = $1
      `;

      const result = await this.db.query(query, [discussionId, userId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error finding discussion by ID', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Create new discussion
   */
  async create(discussionData) {
    try {
      const {
        author_id,
        title,
        content,
        category,
        tags = [],
        images = []
      } = discussionData;

      // Ensure tags is an array
      const tagsArray = Array.isArray(tags) ? tags : [];

      // Ensure images is an array
      const imagesArray = Array.isArray(images) ? images : [];

      // Log data being inserted for debugging
      logger.info('Creating discussion with data', {
        author_id,
        title: title?.substring(0, 50),
        category,
        tagsCount: tagsArray.length,
        imagesCount: imagesArray.length
      });

      const query = `
        INSERT INTO ${this.tableName} (
          author_id, title, content, category, tags, images
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        author_id,
        title,
        content,
        category,
        tagsArray,
        JSON.stringify(imagesArray)
      ]);

      logger.info('Discussion created', {
        discussionId: result.rows[0].id,
        authorId: author_id,
        category
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating discussion', {
        error: error.message,
        code: error.code,
        detail: error.detail,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Update discussion
   */
  async update(discussionId, updateData) {
    try {
      const { title, content, category, tags, images } = updateData;

      const query = `
        UPDATE ${this.tableName}
        SET title = $1,
            content = $2,
            category = $3,
            tags = $4,
            images = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `;

      const result = await this.db.query(query, [
        title,
        content,
        category,
        tags || [],
        JSON.stringify(images || []),
        discussionId
      ]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      logger.info('Discussion updated', { discussionId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating discussion', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete discussion
   */
  async delete(discussionId) {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING id`;
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      logger.info('Discussion deleted', { discussionId });
      return true;
    } catch (error) {
      logger.error('Error deleting discussion', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Vote operations
   */

  async getUserVote(discussionId, userId) {
    try {
      const query = 'SELECT vote_type FROM discussion_votes WHERE discussion_id = $1 AND user_id = $2';
      const result = await this.db.query(query, [discussionId, userId]);
      return result.rows[0]?.vote_type || null;
    } catch (error) {
      logger.error('Error getting user vote', { discussionId, userId, error: error.message });
      throw error;
    }
  }

  async upsertVote(discussionId, userId, voteType) {
    try {
      const existingVote = await this.getUserVote(discussionId, userId);

      if (existingVote) {
        if (existingVote === voteType) {
          // Remove vote (toggle off)
          await this.db.query(
            'DELETE FROM discussion_votes WHERE discussion_id = $1 AND user_id = $2',
            [discussionId, userId]
          );
          return { action: 'removed', voteType: null };
        } else {
          // Update vote
          await this.db.query(
            'UPDATE discussion_votes SET vote_type = $1, updated_at = CURRENT_TIMESTAMP WHERE discussion_id = $2 AND user_id = $3',
            [voteType, discussionId, userId]
          );
          return { action: 'updated', voteType };
        }
      } else {
        // Create new vote
        await this.db.query(
          'INSERT INTO discussion_votes (discussion_id, user_id, vote_type) VALUES ($1, $2, $3)',
          [discussionId, userId, voteType]
        );
        return { action: 'created', voteType };
      }
    } catch (error) {
      logger.error('Error upserting vote', { discussionId, userId, voteType, error: error.message });
      throw error;
    }
  }

  async getVoteCounts(discussionId) {
    try {
      const query = 'SELECT vote_count, upvotes, downvotes FROM discussions WHERE id = $1';
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error getting vote counts', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Status operations
   */

  async markAsSolved(discussionId) {
    try {
      const query = `UPDATE ${this.tableName} SET is_solved = true WHERE id = $1 RETURNING *`;
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      logger.info('Discussion marked as solved', { discussionId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error marking as solved', { discussionId, error: error.message });
      throw error;
    }
  }

  async unmarkAsSolved(discussionId) {
    try {
      const query = `UPDATE ${this.tableName} SET is_solved = false WHERE id = $1 RETURNING *`;
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      logger.info('Discussion unmarked as solved', { discussionId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error unmarking as solved', { discussionId, error: error.message });
      throw error;
    }
  }

  async pinDiscussion(discussionId) {
    try {
      const query = `UPDATE ${this.tableName} SET is_pinned = true WHERE id = $1 RETURNING *`;
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      logger.info('Discussion pinned', { discussionId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error pinning discussion', { discussionId, error: error.message });
      throw error;
    }
  }

  async unpinDiscussion(discussionId) {
    try {
      const query = `UPDATE ${this.tableName} SET is_pinned = false WHERE id = $1 RETURNING *`;
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      logger.info('Discussion unpinned', { discussionId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error unpinning discussion', { discussionId, error: error.message });
      throw error;
    }
  }

  async lockDiscussion(discussionId) {
    try {
      const query = `UPDATE ${this.tableName} SET is_locked = true WHERE id = $1 RETURNING *`;
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      logger.info('Discussion locked', { discussionId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error locking discussion', { discussionId, error: error.message });
      throw error;
    }
  }

  async unlockDiscussion(discussionId) {
    try {
      const query = `UPDATE ${this.tableName} SET is_locked = false WHERE id = $1 RETURNING *`;
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      logger.info('Discussion unlocked', { discussionId });
      return result.rows[0];
    } catch (error) {
      logger.error('Error unlocking discussion', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Save/bookmark operations
   */

  async saveDiscussion(discussionId, userId) {
    try {
      // Check if already saved
      const existing = await this.db.query(
        'SELECT id FROM saved_discussions WHERE discussion_id = $1 AND user_id = $2',
        [discussionId, userId]
      );

      if (existing.rows.length > 0) {
        return false; // Already saved
      }

      await this.db.query(
        'INSERT INTO saved_discussions (discussion_id, user_id) VALUES ($1, $2)',
        [discussionId, userId]
      );

      logger.info('Discussion saved', { discussionId, userId });
      return true;
    } catch (error) {
      logger.error('Error saving discussion', { discussionId, userId, error: error.message });
      throw error;
    }
  }

  async unsaveDiscussion(discussionId, userId) {
    try {
      const result = await this.db.query(
        'DELETE FROM saved_discussions WHERE discussion_id = $1 AND user_id = $2',
        [discussionId, userId]
      );

      if (result.rowCount === 0) {
        return false; // Was not saved
      }

      logger.info('Discussion unsaved', { discussionId, userId });
      return true;
    } catch (error) {
      logger.error('Error unsaving discussion', { discussionId, userId, error: error.message });
      throw error;
    }
  }

  async getSavedDiscussions(userId, page = 1, limit = 10) {
    try {
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const query = `
        SELECT 
          ${this.columns},
          true as is_saved
        FROM ${this.tableName} d
        LEFT JOIN users u ON d.author_id = u.id
        INNER JOIN saved_discussions sd ON d.id = sd.discussion_id
        WHERE sd.user_id = $1
        ORDER BY sd.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.db.query(query, [userId, parseInt(limit), offset]);

      // Get total count
      const countQuery = 'SELECT COUNT(*) FROM saved_discussions WHERE user_id = $1';
      const countResult = await this.db.query(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].count);

      return {
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      logger.error('Error getting saved discussions', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Related discussions
   */

  async getRelatedDiscussions(discussionId, limit = 5) {
    try {
      // Get current discussion to find related ones
      const current = await this.db.query(
        'SELECT category, tags FROM discussions WHERE id = $1',
        [discussionId]
      );

      if (current.rows.length === 0) {
        return [];
      }

      const { category, tags } = current.rows[0];

      const query = `
        SELECT 
          ${this.columns}
        FROM ${this.tableName} d
        LEFT JOIN users u ON d.author_id = u.id
        WHERE d.id != $1
          AND (
            d.category = $2
            OR d.tags && $3::text[]
          )
        ORDER BY 
          CASE WHEN d.category = $2 THEN 2 ELSE 0 END +
          CASE WHEN d.tags && $3::text[] THEN 1 ELSE 0 END DESC,
          d.vote_count DESC
        LIMIT $4
      `;

      const result = await this.db.query(query, [discussionId, category, tags || [], limit]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting related discussions', { discussionId, error: error.message });
      throw error;
    }
  }

  /**
   * Report discussion
   */

  async reportDiscussion(reportData) {
    try {
      const { discussion_id, reported_by, reason, details } = reportData;

      const query = `
        INSERT INTO discussion_reports (
          discussion_id, reporter_id, reason, description
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        discussion_id,
        reported_by,
        reason,
        details
      ]);

      logger.info('Discussion reported', { discussion_id, reported_by, reason });
      return result.rows[0];
    } catch (error) {
      // Handle duplicate report constraint
      if (
        (error.code === '23505' || error.details?.code === '23505') &&
        (error.constraint === 'unique_user_discussion_report' ||
          error.details?.constraint === 'unique_user_discussion_report' ||
          error.message?.includes('unique_user_discussion_report'))
      ) {
        throw new ConflictError('Report already submitted');
      }

      logger.error('Error reporting discussion', { error: error.message });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  _buildWhereConditions(params, queryParams, whereConditions) {
    const { authorId, category, search, filter, userId } = params;

    // Author filter
    if (authorId && authorId.trim() !== '') {
      whereConditions.push(`d.author_id = $${queryParams.length + 1}`);
      queryParams.push(authorId);
    }

    // Category filter
    if (category && category !== 'all') {
      whereConditions.push(`d.category = $${queryParams.length + 1}`);
      queryParams.push(category);
    }

    // Search filter
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      if (searchTerm.startsWith('#')) {
        const tagSearch = searchTerm.substring(1);
        whereConditions.push(`($${queryParams.length + 1} = ANY(d.tags) OR $${queryParams.length + 2} = ANY(d.tags))`);
        queryParams.push(tagSearch, searchTerm);
      } else {
        whereConditions.push(`(d.title ILIKE $${queryParams.length + 1} OR d.content ILIKE $${queryParams.length + 1} OR array_to_string(d.tags, ' ') ILIKE $${queryParams.length + 1})`);
        queryParams.push(`%${searchTerm}%`);
      }
    }

    // Filter conditions
    if (filter && filter !== 'all') {
      switch (filter) {
        case 'unanswered':
          whereConditions.push('d.answers_count = 0');
          break;
        case 'solved':
          whereConditions.push('d.is_solved = true');
          break;
        case 'my':
          if (userId) {
            whereConditions.push(`d.author_id = $${queryParams.length + 1}`);
            queryParams.push(userId);
          } else {
            whereConditions.push('1 = 0');
          }
          break;
      }
    }

    return whereConditions;
  }

  _buildOrderByClause(sortBy) {
    switch (sortBy) {
      case 'latest':
        return ' ORDER BY d.updated_at DESC, d.created_at DESC';
      case 'popular':
        return ' ORDER BY (d.vote_count + (d.answers_count * 2)) DESC, d.created_at DESC';
      case 'newest':
        return ' ORDER BY d.created_at DESC';
      case 'oldest':
        return ' ORDER BY d.created_at ASC';
      case 'recent':
      default:
        return ' ORDER BY d.updated_at DESC, d.created_at DESC';
    }
  }

  async _getFilteredCount(filters, userId) {
    try {
      let countQuery = 'SELECT COUNT(*) FROM discussions d';
      const countParams = [];
      const countWhereConditions = [];

      this._buildWhereConditions(
        {
          authorId: filters.authorId,
          category: filters.category,
          search: filters.search,
          filter: filters.filter,
          userId
        },
        countParams,
        countWhereConditions
      );

      if (countWhereConditions.length > 0) {
        countQuery += ` WHERE ${countWhereConditions.join(' AND ')}`;
      }

      const countResult = await this.db.query(countQuery, countParams);
      return parseInt(countResult.rows[0].count);
    } catch (error) {
      logger.error('Error getting filtered count', { error: error.message });
      throw error;
    }
  }

  /**
   * Get discussion counts by category
   */
  async getCountsByCategory() {
    try {
      const result = await this.db.query(`
        SELECT category, COUNT(*) as count
        FROM discussions
        GROUP BY category
      `);

      // Create a map of counts
      const counts = {};
      result.rows.forEach(row => {
        counts[row.category] = parseInt(row.count);
      });

      return counts;
    } catch (error) {
      logger.error('Error getting counts by category', { error: error.message });
      throw error;
    }
  }
}

module.exports = new DiscussionRepository();
