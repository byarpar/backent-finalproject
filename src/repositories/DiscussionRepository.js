/**
 * Discussion Repository
 * Data access layer for discussion forum
 */

const BaseRepository = require('./BaseRepository');
const { NotFoundError, ConflictError } = require('../utils');
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
      d.views_count,
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
        sortBy = 'latest',
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
          totalPages: Math.ceil(total / parseInt(limit)),
          total_pages: Math.ceil(total / parseInt(limit)), // Legacy support
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
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

      // Ensure all required columns exist before inserting
      await this.db.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'tags'
          ) THEN
            CREATE TABLE tags (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              name VARCHAR(100) UNIQUE NOT NULL,
              slug VARCHAR(100) UNIQUE NOT NULL,
              usage_count INTEGER DEFAULT 0,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX idx_tags_slug ON tags(slug);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='tags') THEN
            ALTER TABLE discussions ADD COLUMN tags TEXT[] DEFAULT '{}';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='images') THEN
            ALTER TABLE discussions ADD COLUMN images JSONB;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='vote_count') THEN
            ALTER TABLE discussions ADD COLUMN vote_count INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='upvotes') THEN
            ALTER TABLE discussions ADD COLUMN upvotes INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='downvotes') THEN
            ALTER TABLE discussions ADD COLUMN downvotes INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='views_count') THEN
            ALTER TABLE discussions ADD COLUMN views_count INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='answers_count') THEN
            ALTER TABLE discussions ADD COLUMN answers_count INTEGER DEFAULT 0;
          END IF;
        END $$;
      `);

      const query = `
        INSERT INTO ${this.tableName} (
          author_id, title, content, category, tags, images, vote_count, upvotes, downvotes, views_count
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 0)
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

      await this._syncTagsTable(tagsArray);

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
            images = $5
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

      await this._syncTagsTable(tags || []);

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
      const query = `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING id, tags`;
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      await this._syncTagsTable(result.rows[0].tags || []);

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
      // Create discussion_votes table if it doesn't exist
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS discussion_votes (
          id SERIAL PRIMARY KEY,
          discussion_id INTEGER REFERENCES discussions(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('up', 'down')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(discussion_id, user_id)
        )
      `);

      const query = 'SELECT vote_type FROM discussion_votes WHERE discussion_id = $1 AND user_id = $2';
      const result = await this.db.query(query, [discussionId, userId]);
      return result.rows[0]?.vote_type || null;
    } catch (error) {
      logger.error('Error getting user vote', { discussionId, userId, error: error.message });
      return null; // Return null instead of throwing error if table doesn't exist
    }
  }

  async upsertVote(discussionId, userId, voteType) {
    try {
      // Create discussion_votes table if it doesn't exist
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS discussion_votes (
          id SERIAL PRIMARY KEY,
          discussion_id INTEGER REFERENCES discussions(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('up', 'down')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(discussion_id, user_id)
        )
      `);

      // Add vote_count, upvotes, downvotes columns to discussions table if they don't exist
      await this.db.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='vote_count') THEN
            ALTER TABLE discussions ADD COLUMN vote_count INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='upvotes') THEN
            ALTER TABLE discussions ADD COLUMN upvotes INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='downvotes') THEN
            ALTER TABLE discussions ADD COLUMN downvotes INTEGER DEFAULT 0;
          END IF;
        END $$;
      `);

      // Use common voting logic from BaseRepository
      const result = await this._handleVote(
        'discussion_votes',
        'discussion_id',
        discussionId,
        userId,
        voteType,
        this.getUserVote.bind(this)
      );

      // Update vote counts in discussions table
      await this.updateVoteCounts(discussionId);

      return result;
    } catch (error) {
      logger.error('Error upserting vote', { discussionId, userId, voteType, error: error.message });
      throw error;
    }
  }

  async updateVoteCounts(discussionId) {
    try {
      const countsQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE vote_type = 'up') as upvotes,
          COUNT(*) FILTER (WHERE vote_type = 'down') as downvotes,
          COUNT(*) FILTER (WHERE vote_type = 'up') - COUNT(*) FILTER (WHERE vote_type = 'down') as vote_count
        FROM discussion_votes
        WHERE discussion_id = $1
      `;
      const result = await this.db.query(countsQuery, [discussionId]);
      const { upvotes, downvotes, vote_count } = result.rows[0];

      // Update discussions table
      await this.db.query(
        'UPDATE discussions SET vote_count = $1, upvotes = $2, downvotes = $3 WHERE id = $4',
        [vote_count || 0, upvotes || 0, downvotes || 0, discussionId]
      );

      return { vote_count: vote_count || 0, upvotes: upvotes || 0, downvotes: downvotes || 0 };
    } catch (error) {
      logger.error('Error updating vote counts', { discussionId, error: error.message });
      throw error;
    }
  }

  async getVoteCounts(discussionId) {
    try {
      // Try to get from discussions table first
      const query = 'SELECT vote_count, upvotes, downvotes FROM discussions WHERE id = $1';
      const result = await this.db.query(query, [discussionId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Discussion not found');
      }

      // If columns don't exist or are null, calculate from votes table
      let { vote_count, upvotes, downvotes } = result.rows[0];

      if (vote_count === null || vote_count === undefined) {
        const counts = await this.updateVoteCounts(discussionId);
        vote_count = counts.vote_count;
        upvotes = counts.upvotes;
        downvotes = counts.downvotes;
      }

      return {
        vote_count: vote_count || 0,
        upvotes: upvotes || 0,
        downvotes: downvotes || 0
      };
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
          totalPages: Math.ceil(total / parseInt(limit)),
          total_pages: Math.ceil(total / parseInt(limit)), // Legacy support
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
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

  async _syncTagsTable(changedTags = []) {
    try {
      // Ensure table exists in environments that predate migrations.
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS tags (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) UNIQUE NOT NULL,
          slug VARCHAR(100) UNIQUE NOT NULL,
          usage_count INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.db.query('CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug)');

      if (Array.isArray(changedTags) && changedTags.length > 0) {
        const normalized = [...new Set(
          changedTags
            .filter(tag => typeof tag === 'string' && tag.trim().length > 0)
            .map(tag => tag.trim().toLowerCase())
        )];

        if (normalized.length > 0) {
          await this.db.query(
            `
              INSERT INTO tags (name, slug)
              SELECT tag, tag
              FROM UNNEST($1::text[]) AS tag
              ON CONFLICT (slug) DO NOTHING
            `,
            [normalized]
          );
        }
      }

      await this.db.query(`
        UPDATE tags t
        SET usage_count = COALESCE(src.cnt, 0)
        FROM (
          SELECT tag, COUNT(*)::int AS cnt
          FROM discussions, UNNEST(tags) AS tag
          WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
          GROUP BY tag
        ) src
        WHERE t.slug = src.tag
      `);

      await this.db.query(`
        UPDATE tags
        SET usage_count = 0
        WHERE slug NOT IN (
          SELECT DISTINCT tag
          FROM discussions, UNNEST(tags) AS tag
          WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
        )
      `);

      // Remove tags that are no longer used by any discussion.
      await this.db.query('DELETE FROM tags WHERE usage_count <= 0');
    } catch (error) {
      logger.warn('Failed to sync tags table', { error: error.message });
    }
  }

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

  /**
   * Build ORDER BY clause for discussions sorting
   * @param {string} sortBy - Sort option (latest, popular, views, newest)
   * @returns {string} SQL ORDER BY clause
   */
  _buildOrderByClause(sortBy) {
    switch (sortBy) {
      case 'latest':
      case 'recent':
        // Sort by most recently active (replies, edits, votes update the updated_at)
        return ' ORDER BY d.updated_at DESC, d.created_at DESC';
      case 'popular':
        // Sort by engagement score (votes + replies weighted)
        return ' ORDER BY (d.vote_count + (d.answers_count * 2)) DESC, d.created_at DESC';
      case 'views':
        // Sort by view count (most viewed discussions)
        return ' ORDER BY d.views_count DESC, d.created_at DESC';
      case 'newest':
        // Sort by creation date (brand new discussions)
        return ' ORDER BY d.created_at DESC';
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

  /**
   * Increment view count for a discussion (one view per user)
   */
  async incrementViewCount(discussionId, userId = null) {
    try {
      // Ensure views_count column exists
      await this.db.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discussions' AND column_name='views_count') THEN
            ALTER TABLE discussions ADD COLUMN views_count INTEGER DEFAULT 0;
          END IF;
        END $$;
      `);

      // Create discussion_views table if it doesn't exist (to track unique views)
      // Simpler version without foreign keys to avoid issues
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS discussion_views (
          discussion_id VARCHAR(255) NOT NULL,
          user_id UUID NOT NULL,
          viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (discussion_id, user_id)
        )
      `);

      let viewCounted = false;

      if (userId) {
        // Use INSERT with ON CONFLICT to atomically check and insert
        // This prevents race conditions where multiple requests arrive simultaneously
        const insertResult = await this.db.query(
          `INSERT INTO discussion_views (discussion_id, user_id) 
           VALUES ($1, $2) 
           ON CONFLICT (discussion_id, user_id) DO NOTHING
           RETURNING discussion_id`,
          [discussionId, userId]
        );

        // If a row was returned, it means this was a new view
        viewCounted = insertResult.rows.length > 0;
      } else {
        // Anonymous user - always count the view
        viewCounted = true;
      }

      if (viewCounted) {
        const query = `
          UPDATE discussions 
          SET views_count = COALESCE(views_count, 0) + 1 
          WHERE id = $1 
          RETURNING views_count
        `;
        const result = await this.db.query(query, [discussionId]);

        if (result.rows.length > 0) {
          logger.info('View count incremented', { discussionId, userId: userId || 'anonymous', views: result.rows[0].views_count });
          return result.rows[0].views_count;
        }
      } else {
        logger.debug('View already counted for this user', { discussionId, userId });
        const result = await this.db.query('SELECT views_count FROM discussions WHERE id = $1', [discussionId]);
        return result.rows[0]?.views_count || 0;
      }

      return 0;
    } catch (error) {
      logger.error('Error incrementing view count', { discussionId, error: error.message });
      throw error;
    }
  }
}

module.exports = new DiscussionRepository();
