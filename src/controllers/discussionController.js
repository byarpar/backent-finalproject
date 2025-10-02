const { db } = require('../config/database');
const logger = require('../utils/logger');
const { formatResponse, formatError } = require('../utils/helpers');

class DiscussionController {
  static async getAllDiscussions(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      const category = req.query.category || '';
      const search = req.query.search || '';
      const sortBy = req.query.sortBy || 'recent';

      // Initialize query parameters array first
      const queryParams = [];
      let whereConditions = [];

      // Add current user ID for save status check (null if not authenticated)
      const currentUserId = req.user ? req.user.id : null;
      queryParams.push(currentUserId);

      let discussionsQuery = `
        SELECT 
          d.*, 
          u.username as author_name, 
          u.role as author_role,
          CASE 
            WHEN sd.user_id IS NOT NULL THEN true 
            ELSE false 
          END as is_saved,
          CASE 
            WHEN dl.user_id IS NOT NULL THEN true 
            ELSE false 
          END as is_liked
        FROM discussions d
        LEFT JOIN users u ON d.author_id = u.id
        LEFT JOIN saved_discussions sd ON d.id = sd.discussion_id AND sd.user_id = $1
        LEFT JOIN discussion_likes dl ON d.id = dl.discussion_id AND dl.user_id = $1
      `;

      // Add category filter if specified and not "all"
      if (category && category !== 'all') {
        whereConditions.push(`d.category = $${queryParams.length + 1}`);
        queryParams.push(category);
      }

      // Add search filter if specified
      if (search && search.trim() !== '') {
        whereConditions.push(`(d.title ILIKE $${queryParams.length + 1} OR d.content ILIKE $${queryParams.length + 1})`);
        queryParams.push(`%${search.trim()}%`);
      }

      // Add WHERE clause if there are conditions
      if (whereConditions.length > 0) {
        discussionsQuery += ` WHERE ${whereConditions.join(' AND ')}`;
      }

      // Add sorting logic
      switch (sortBy) {
        case 'newest':
          discussionsQuery += ' ORDER BY d.created_at DESC';
          break;
        case 'oldest':
          discussionsQuery += ' ORDER BY d.created_at ASC';
          break;
        case 'recent':
        default:
          // Recent activity: just use creation date
          discussionsQuery += ' ORDER BY d.created_at DESC';
          break;
      }

      discussionsQuery += ` LIMIT ${limit} OFFSET ${offset}`;

      const result = await db.query(discussionsQuery, queryParams);

      // Update count query to include search and category filters
      let countQuery = 'SELECT COUNT(*) FROM discussions d';
      let countParams = [];
      let countWhereConditions = [];

      if (category && category !== 'all') {
        countWhereConditions.push(`d.category = $${countParams.length + 1}`);
        countParams.push(category);
      }

      if (search && search.trim() !== '') {
        countWhereConditions.push(`(d.title ILIKE $${countParams.length + 1} OR d.content ILIKE $${countParams.length + 1})`);
        countParams.push(`%${search.trim()}%`);
      }

      if (countWhereConditions.length > 0) {
        countQuery += ` WHERE ${countWhereConditions.join(' AND ')}`;
      }

      const countResult = await db.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get category metadata for enriching discussions
      const categoryMetadata = DiscussionController.getCategoryMetadata();

      // Process discussions to parse images JSON strings and normalize field names
      const processedDiscussions = result.rows.map(discussion => {
        // Parse images JSON
        if (discussion.images && typeof discussion.images === 'string') {
          try {
            discussion.images = JSON.parse(discussion.images);
          } catch (error) {
            logger.warn('Failed to parse images JSON for discussion:', discussion.id, error);
            discussion.images = [];
          }
        } else if (!discussion.images) {
          discussion.images = [];
        }

        // Normalize field names for frontend compatibility
        if (discussion.views_count !== undefined) {
          discussion.viewCount = discussion.views_count;
        }

        // Enrich category information with metadata
        if (discussion.category && categoryMetadata[discussion.category]) {
          discussion.category = {
            id: discussion.category,
            name: categoryMetadata[discussion.category].name,
            icon: categoryMetadata[discussion.category].icon,
            color: categoryMetadata[discussion.category].color
          };
        }

        return discussion;
      });

      res.json({
        discussions: processedDiscussions,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit)
      });
    } catch (error) {
      logger.error('Error fetching discussions:', error);
      res.status(500).json({ error: 'Failed to fetch discussions' });
    }
  }

  static async getDiscussionById(req, res) {
    try {
      const { id } = req.params;
      const currentUserId = req.user ? req.user.id : null;

      // Get the discussion data with save status
      const discussionQuery = `
        SELECT 
          d.*, 
          u.username as author_name, 
          u.role as author_role,
          CASE 
            WHEN sd.user_id IS NOT NULL THEN true 
            ELSE false 
          END as is_saved
        FROM discussions d
        LEFT JOIN users u ON d.author_id = u.id
        LEFT JOIN saved_discussions sd ON d.id = sd.discussion_id AND sd.user_id = $2
        WHERE d.id = $1
      `;

      const result = await db.query(discussionQuery, [id, currentUserId]);

      if (result.rows.length === 0) {
        return res.status(404).json(formatError('Discussion not found'));
      }

      const discussion = result.rows[0];

      // Process images JSON string and normalize field names
      if (discussion.images && typeof discussion.images === 'string') {
        try {
          discussion.images = JSON.parse(discussion.images);
        } catch (error) {
          logger.warn('Failed to parse images JSON for discussion:', discussion.id, error);
          discussion.images = [];
        }
      } else if (!discussion.images) {
        discussion.images = [];
      }

      // Normalize field names for frontend compatibility
      if (discussion.views_count !== undefined) {
        discussion.viewCount = discussion.views_count;
      }

      // Enrich category information with metadata
      const categoryMetadata = DiscussionController.getCategoryMetadata();
      if (discussion.category && categoryMetadata[discussion.category]) {
        discussion.category = {
          id: discussion.category,
          name: categoryMetadata[discussion.category].name,
          icon: categoryMetadata[discussion.category].icon,
          color: categoryMetadata[discussion.category].color
        };
      }

      res.json(formatResponse(true, {
        discussion
      }));
    } catch (error) {
      logger.error('Error fetching discussion:', error);
      res.status(500).json(formatError('Failed to fetch discussion', error.message));
    }
  }

  static async createDiscussion(req, res) {
    try {
      const { title, content, category } = req.body;
      const userId = req.user.id;

      if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
      }

      // Process uploaded images - convert to base64 and store in database
      const fs = require('fs');
      let base64Images = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            // Read the file and convert to base64
            const fileBuffer = fs.readFileSync(file.path);
            const base64String = `data:${file.mimetype};base64,${fileBuffer.toString('base64')}`;
            base64Images.push(base64String);

            // Delete the temporary file since we're storing base64
            fs.unlinkSync(file.path);
          } catch (fileError) {
            logger.warn('Failed to process uploaded file:', fileError);
          }
        }
      }

      const insertQuery = `
        INSERT INTO discussions (title, content, category, author_id, images, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *
      `;

      const result = await db.query(insertQuery, [
        title,
        content,
        category || 'general',
        userId,
        JSON.stringify(base64Images)
      ]);
      const discussion = result.rows[0];

      logger.info('Discussion created successfully', {
        discussionId: discussion.id,
        userId,
        imageCount: base64Images.length
      });

      res.status(201).json({
        success: true,
        data: {
          discussion_id: discussion.id,
          discussion: discussion
        }
      });
    } catch (error) {
      logger.error('Error creating discussion:', error);
      res.status(500).json({ error: 'Failed to create discussion' });
    }
  }

  static async updateDiscussion(req, res) {
    try {
      const { id } = req.params;
      const { title, content, category } = req.body;
      const userId = req.user.id;

      // Validate required fields
      if (!title || !content) {
        return res.status(400).json({
          error: 'Title and content are required',
          details: { title: !!title, content: !!content }
        });
      }

      const checkQuery = 'SELECT author_id, images FROM discussions WHERE id = $1';
      const checkResult = await db.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Discussion not found' });
      }

      if (checkResult.rows[0].author_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to update this discussion' });
      }

      // Build update query - always update title, content, category
      let updateFields = ['title = $1', 'content = $2', 'category = $3', 'updated_at = NOW()'];
      let queryParams = [title, content, category || 'general'];

      // Handle image uploads if any files are provided
      if (req.files && req.files.length > 0) {
        const fs = require('fs');
        let newBase64Images = [];

        for (const file of req.files) {
          try {
            // Read the file and convert to base64
            const fileBuffer = fs.readFileSync(file.path);
            const base64String = `data:${file.mimetype};base64,${fileBuffer.toString('base64')}`;
            newBase64Images.push(base64String);

            // Delete the temporary file since we're storing base64
            fs.unlinkSync(file.path);
          } catch (fileError) {
            logger.warn('Failed to process uploaded file:', fileError);
          }
        }

        if (newBase64Images.length > 0) {
          // Get existing images and merge with new ones
          let existingImages = [];
          try {
            existingImages = checkResult.rows[0].images ? JSON.parse(checkResult.rows[0].images) : [];
          } catch (error) {
            logger.warn('Failed to parse existing images:', error);
            existingImages = [];
          }

          const allImages = [...existingImages, ...newBase64Images];
          updateFields.push(`images = $${queryParams.length + 1}`);
          queryParams.push(JSON.stringify(allImages));

          logger.info('Adding new images to discussion', {
            discussionId: id,
            existingCount: existingImages.length,
            newCount: newBase64Images.length,
            totalCount: allImages.length
          });
        }
      }

      const updateQuery = `
        UPDATE discussions
        SET ${updateFields.join(', ')}
        WHERE id = $${queryParams.length + 1}
        RETURNING *
      `;

      queryParams.push(id);

      const result = await db.query(updateQuery, queryParams);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Discussion not found after update' });
      }

      logger.info('Discussion updated successfully', {
        discussionId: id,
        userId,
        hasNewImages: req.files && req.files.length > 0
      });

      res.json({
        success: true,
        data: {
          discussion: result.rows[0]
        },
        message: 'Discussion updated successfully'
      });
    } catch (error) {
      logger.error('Error updating discussion:', error);
      res.status(500).json({
        error: 'Failed to update discussion',
        details: error.message
      });
    }
  }

  static async deleteDiscussion(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const checkQuery = 'SELECT author_id FROM discussions WHERE id = $1';
      const checkResult = await db.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Discussion not found' });
      }

      if (checkResult.rows[0].author_id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to delete this discussion' });
      }

      await db.query('DELETE FROM discussions WHERE id = $1', [id]);

      res.json({ message: 'Discussion deleted successfully' });
    } catch (error) {
      logger.error('Error deleting discussion:', error);
      res.status(500).json({ error: 'Failed to delete discussion' });
    }
  }







  // Helper method to get category metadata
  static getCategoryMetadata() {
    return {
      'general': { name: 'General Discussion', icon: 'ChatBubbleLeftRightIcon', color: '#9CA3AF' },
      'language-learning': { name: 'Language Learning', icon: 'AcademicCapIcon', color: '#60A5FA' },
      'grammar': { name: 'Grammar', icon: 'BookOpenIcon', color: '#34D399' },
      'vocabulary': { name: 'Vocabulary', icon: 'TagIcon', color: '#FBBF24' },
      'culture': { name: 'Culture & Context', icon: 'UserGroupIcon', color: '#A78BFA' },
      'pronunciation': { name: 'Pronunciation', icon: 'SpeakerWaveIcon', color: '#F87171' },
      'translation': { name: 'Translation', icon: 'LanguageIcon', color: '#F472B6' }
    };
  }

  static async getCategories(req, res) {
    try {
      // Get categories with their discussion counts
      const categoriesQuery = `
        SELECT 
          category,
          COUNT(*) as discussion_count
        FROM discussions 
        WHERE category IS NOT NULL 
        GROUP BY category 
        ORDER BY category
      `;
      const result = await db.query(categoriesQuery);

      // Get category metadata using helper method
      const categoryMetadata = DiscussionController.getCategoryMetadata();

      // Build categories array with metadata and counts
      const categories = [];

      // Add "All" category with total count
      const totalCountQuery = 'SELECT COUNT(*) as total FROM discussions';
      const totalResult = await db.query(totalCountQuery);
      const totalCount = parseInt(totalResult.rows[0].total) || 0;

      categories.push({
        id: 'all',
        name: 'All Questions',
        icon: 'GlobeAltIcon',
        color: '#9CA3AF',
        count: totalCount
      });

      // Add categories from database with metadata
      result.rows.forEach(row => {
        const categoryId = row.category;
        const metadata = categoryMetadata[categoryId] || {
          name: categoryId.charAt(0).toUpperCase() + categoryId.slice(1),
          icon: 'ChatBubbleLeftRightIcon',
          color: '#9CA3AF'
        };

        categories.push({
          id: categoryId,
          name: metadata.name,
          icon: metadata.icon,
          color: metadata.color,
          count: parseInt(row.discussion_count) || 0
        });
      });

      // Add any missing predefined categories with 0 count
      Object.keys(categoryMetadata).forEach(categoryId => {
        if (!categories.find(cat => cat.id === categoryId)) {
          const metadata = categoryMetadata[categoryId];
          categories.push({
            id: categoryId,
            name: metadata.name,
            icon: metadata.icon,
            color: metadata.color,
            count: 0
          });
        }
      });

      res.json(formatResponse(true, { categories }));
    } catch (error) {
      logger.error('Error fetching categories:', error);
      res.status(500).json(formatError('Failed to fetch categories', error.message));
    }
  }

  // Save discussion for user
  static async saveDiscussion(req, res) {
    try {
      const discussionId = req.params.id;
      const userId = req.user.id;

      // Check if discussion exists
      const discussionExists = await db.query(
        'SELECT id FROM discussions WHERE id = $1',
        [discussionId]
      );

      if (discussionExists.rows.length === 0) {
        return res.status(404).json(formatError('Discussion not found'));
      }

      // Check if already saved
      const existingSave = await db.query(
        'SELECT id FROM saved_discussions WHERE user_id = $1 AND discussion_id = $2',
        [userId, discussionId]
      );

      if (existingSave.rows.length > 0) {
        return res.status(400).json(formatError('Discussion already saved'));
      }

      // Save the discussion
      await db.query(
        'INSERT INTO saved_discussions (user_id, discussion_id) VALUES ($1, $2)',
        [userId, discussionId]
      );

      logger.info(`User ${userId} saved discussion ${discussionId}`);
      res.json(formatResponse(true, { message: 'Discussion saved successfully' }));
    } catch (error) {
      logger.error('Error saving discussion:', error);
      res.status(500).json(formatError('Failed to save discussion', error.message));
    }
  }

  // Unsave discussion for user
  static async unsaveDiscussion(req, res) {
    try {
      const discussionId = req.params.id;
      const userId = req.user.id;

      // Remove the saved discussion
      const result = await db.query(
        'DELETE FROM saved_discussions WHERE user_id = $1 AND discussion_id = $2',
        [userId, discussionId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json(formatError('Saved discussion not found'));
      }

      logger.info(`User ${userId} unsaved discussion ${discussionId}`);
      res.json(formatResponse(true, { message: 'Discussion unsaved successfully' }));
    } catch (error) {
      logger.error('Error unsaving discussion:', error);
      res.status(500).json(formatError('Failed to unsave discussion', error.message));
    }
  }

  // Track discussion sharing
  static async shareDiscussion(req, res) {
    try {
      const discussionId = req.params.id;
      const { shareMethod, sharePlatform } = req.body;
      const userId = req.user ? req.user.id : null;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');

      // Validate share method
      const validShareMethods = ['link', 'email', 'social', 'copy'];
      if (!shareMethod || !validShareMethods.includes(shareMethod)) {
        return res.status(400).json(formatError('Invalid share method'));
      }

      // Check if discussion exists
      const discussionExists = await db.query(
        'SELECT id FROM discussions WHERE id = $1',
        [discussionId]
      );

      if (discussionExists.rows.length === 0) {
        return res.status(404).json(formatError('Discussion not found'));
      }

      // Record the share
      await db.query(
        `INSERT INTO discussion_shares 
         (discussion_id, shared_by_user_id, share_method, share_platform, ip_address, user_agent) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [discussionId, userId, shareMethod, sharePlatform, ipAddress, userAgent]
      );

      logger.info(`Discussion ${discussionId} shared via ${shareMethod} by ${userId || 'anonymous'}`);
      res.json(formatResponse(true, { message: 'Share recorded successfully' }));
    } catch (error) {
      logger.error('Error recording share:', error);
      res.status(500).json(formatError('Failed to record share', error.message));
    }
  }

  // Get saved discussions for user
  static async getSavedDiscussions(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      // Get saved discussions with discussion details
      const query = `
        SELECT 
          d.*, 
          u.username as author_name, 
          u.role as author_role,
          sd.created_at as saved_at,
          true as is_saved
        FROM saved_discussions sd
        JOIN discussions d ON sd.discussion_id = d.id
        LEFT JOIN users u ON d.author_id = u.id
        WHERE sd.user_id = $1
        ORDER BY sd.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const discussions = await db.query(query, [userId, limit, offset]);

      // Get total count
      const countQuery = 'SELECT COUNT(*) FROM saved_discussions WHERE user_id = $1';
      const countResult = await db.query(countQuery, [userId]);
      const totalCount = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(totalCount / limit);

      res.json(formatResponse(true, {
        discussions: discussions.rows,
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }));
    } catch (error) {
      logger.error('Error fetching saved discussions:', error);
      res.status(500).json(formatError('Failed to fetch saved discussions', error.message));
    }
  }

  // Like a discussion
  static async likeDiscussion(req, res) {
    try {
      const discussionId = req.params.id;
      const userId = req.user.id;

      // Check if discussion exists
      const discussionExists = await db.query(
        'SELECT id FROM discussions WHERE id = $1',
        [discussionId]
      );

      if (discussionExists.rows.length === 0) {
        return res.status(404).json(formatError('Discussion not found'));
      }

      // Check if user has already liked this discussion
      const existingLike = await db.query(
        'SELECT id FROM discussion_likes WHERE user_id = $1 AND discussion_id = $2',
        [userId, discussionId]
      );

      if (existingLike.rows.length > 0) {
        return res.status(400).json(formatError('Discussion already liked'));
      }

      // Add like
      await db.query(
        'INSERT INTO discussion_likes (user_id, discussion_id) VALUES ($1, $2)',
        [userId, discussionId]
      );

      // Get updated like count
      const updatedDiscussion = await db.query(
        'SELECT like_count FROM discussions WHERE id = $1',
        [discussionId]
      );

      logger.info(`Discussion ${discussionId} liked by user ${userId}`);
      res.json(formatResponse(true, {
        message: 'Discussion liked successfully',
        like_count: updatedDiscussion.rows[0].like_count,
        is_liked: true
      }));
    } catch (error) {
      logger.error('Error liking discussion:', error);
      res.status(500).json(formatError('Failed to like discussion', error.message));
    }
  }

  // Unlike a discussion
  static async unlikeDiscussion(req, res) {
    try {
      const discussionId = req.params.id;
      const userId = req.user.id;

      // Check if discussion exists
      const discussionExists = await db.query(
        'SELECT id FROM discussions WHERE id = $1',
        [discussionId]
      );

      if (discussionExists.rows.length === 0) {
        return res.status(404).json(formatError('Discussion not found'));
      }

      // Check if user has liked this discussion
      const existingLike = await db.query(
        'SELECT id FROM discussion_likes WHERE user_id = $1 AND discussion_id = $2',
        [userId, discussionId]
      );

      if (existingLike.rows.length === 0) {
        return res.status(400).json(formatError('Discussion not liked yet'));
      }

      // Remove like
      await db.query(
        'DELETE FROM discussion_likes WHERE user_id = $1 AND discussion_id = $2',
        [userId, discussionId]
      );

      // Get updated like count
      const updatedDiscussion = await db.query(
        'SELECT like_count FROM discussions WHERE id = $1',
        [discussionId]
      );

      logger.info(`Discussion ${discussionId} unliked by user ${userId}`);
      res.json(formatResponse(true, {
        message: 'Discussion unliked successfully',
        like_count: updatedDiscussion.rows[0].like_count,
        is_liked: false
      }));
    } catch (error) {
      logger.error('Error unliking discussion:', error);
      res.status(500).json(formatError('Failed to unlike discussion', error.message));
    }
  }

  // Get liked discussions for user
  static async getLikedDiscussions(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      // Get liked discussions with discussion details
      const query = `
        SELECT 
          d.*, 
          u.username as author_name, 
          u.role as author_role,
          dl.created_at as liked_at,
          true as is_liked
        FROM discussion_likes dl
        JOIN discussions d ON dl.discussion_id = d.id
        LEFT JOIN users u ON d.author_id = u.id
        WHERE dl.user_id = $1
        ORDER BY dl.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const discussions = await db.query(query, [userId, limit, offset]);

      // Get total count
      const countQuery = 'SELECT COUNT(*) FROM discussion_likes WHERE user_id = $1';
      const countResult = await db.query(countQuery, [userId]);
      const totalCount = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(totalCount / limit);

      res.json(formatResponse(true, {
        discussions: discussions.rows,
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }));
    } catch (error) {
      logger.error('Error fetching liked discussions:', error);
      res.status(500).json(formatError('Failed to fetch liked discussions', error.message));
    }
  }

}

module.exports = DiscussionController;
