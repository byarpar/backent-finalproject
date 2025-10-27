const BaseRepository = require('./BaseRepository');
const logger = require('../utils/logger');
const { NotFoundError } = require('../utils/errors');

/**
 * ChatRepository
 * Handles all chat-related database operations (conversations and messages)
 */
class ChatRepository extends BaseRepository {
  constructor() {
    super('conversations'); // Base table
  }

  // ============================================
  // Conversation Operations
  // ============================================

  /**
   * Get all conversations for a user with pagination
   * @param {string} userId - User ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Conversations with participant details
   */
  async findConversationsByUserId(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      const query = `
        SELECT 
          c.*,
          cp.is_muted,
          cp.last_read_at,
          COALESCE(
            json_agg(
              json_build_object(
                'user_id', COALESCE(u.id, cp2.user_id),
                'username', COALESCE(u.username, '[Deleted User]'),
                'full_name', COALESCE(u.full_name, 'Deleted User'),
                'profile_photo_url', u.profile_photo_url,
                'role', cp2.role
              )
            ) FILTER (WHERE cp2.user_id IS NOT NULL),
            '[]'
          ) as participants
        FROM conversations c
        INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
        LEFT JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
        LEFT JOIN users u ON cp2.user_id = u.id AND u.is_active = true
        WHERE cp.user_id = $1
        GROUP BY c.id, cp.is_muted, cp.last_read_at
        ORDER BY c.updated_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.db.query(query, [userId, limit, offset]);

      logger.info(`Retrieved ${result.rows.length} conversations for user ${userId}`);

      return result.rows;
    } catch (error) {
      logger.error('Error finding conversations by user:', error);
      throw error;
    }
  }

  /**
   * Find conversation by ID with participants
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>} Conversation with participants
   */
  async findConversationById(conversationId) {
    try {
      const query = `
        SELECT 
          c.*,
          COALESCE(
            json_agg(
              json_build_object(
                'user_id', COALESCE(u.id, cp.user_id),
                'username', COALESCE(u.username, '[Deleted User]'),
                'full_name', COALESCE(u.full_name, 'Deleted User'),
                'profile_photo_url', u.profile_photo_url,
                'role', cp.role,
                'joined_at', cp.joined_at
              )
            ) FILTER (WHERE cp.user_id IS NOT NULL),
            '[]'
          ) as participants
        FROM conversations c
        LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
        LEFT JOIN users u ON cp.user_id = u.id AND u.is_active = true
        WHERE c.id = $1
        GROUP BY c.id
      `;

      const result = await this.db.query(query, [conversationId]);

      if (result.rows.length === 0) {
        throw new NotFoundError('Conversation not found');
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error finding conversation by ID:', error);
      throw error;
    }
  }

  /**
   * Create a new conversation
   * @param {Object} conversationData - Conversation data
   * @returns {Promise<Object>} Created conversation
   */
  async createConversation(conversationData) {
    const { type, name, description, avatarUrl, createdBy, participantIds } = conversationData;

    try {
      // Start transaction
      await this.db.query('BEGIN');

      // Create conversation
      const conversationResult = await this.db.query(
        `INSERT INTO conversations (type, name, description, avatar_url, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [type, name, description, avatarUrl, createdBy]
      );

      const conversation = conversationResult.rows[0];

      // Add creator as admin participant
      await this.db.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [conversation.id, createdBy, 'admin']
      );

      // Add other participants as members
      if (participantIds && participantIds.length > 0) {
        for (const participantId of participantIds) {
          if (participantId !== createdBy) {
            await this.db.query(
              `INSERT INTO conversation_participants (conversation_id, user_id, role)
               VALUES ($1, $2, $3)`,
              [conversation.id, participantId, 'member']
            );
          }
        }
      }

      await this.db.query('COMMIT');

      logger.info(`Conversation created`, { conversationId: conversation.id, createdBy });

      // Return conversation with participants
      return await this.findConversationById(conversation.id);
    } catch (error) {
      await this.db.query('ROLLBACK');
      logger.error('Error creating conversation:', error);
      throw error;
    }
  }

  /**
   * Update conversation details
   * @param {string} conversationId - Conversation ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated conversation
   */
  async updateConversation(conversationId, updates) {
    const { name, description, avatarUrl } = updates;

    try {
      const fields = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) {
        fields.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (description !== undefined) {
        fields.push(`description = $${paramIndex++}`);
        values.push(description);
      }
      if (avatarUrl !== undefined) {
        fields.push(`avatar_url = $${paramIndex++}`);
        values.push(avatarUrl);
      }

      if (fields.length === 0) {
        return await this.findConversationById(conversationId);
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(conversationId);

      const query = `
        UPDATE conversations 
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new NotFoundError('Conversation not found');
      }

      logger.info(`Conversation updated`, { conversationId });

      return await this.findConversationById(conversationId);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error updating conversation:', error);
      throw error;
    }
  }

  /**
   * Check if user is participant of conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if user is participant
   */
  async isParticipant(conversationId, userId) {
    try {
      const result = await this.db.query(
        `SELECT 1 FROM conversation_participants 
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, userId]
      );

      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking participant status:', error);
      throw error;
    }
  }

  /**
   * Add participant to conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID to add
   * @param {string} role - Participant role (admin/member)
   * @returns {Promise<Object>} Added participant details
   */
  async addParticipant(conversationId, userId, role = 'member') {
    try {
      const result = await this.db.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (conversation_id, user_id) DO UPDATE
         SET role = EXCLUDED.role, joined_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [conversationId, userId, role]
      );

      // Update conversation's updated_at
      await this.db.query(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [conversationId]
      );

      logger.info(`Participant added to conversation`, { conversationId, userId, role });

      return result.rows[0];
    } catch (error) {
      logger.error('Error adding participant:', error);
      throw error;
    }
  }

  /**
   * Remove participant from conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID to remove
   * @returns {Promise<Object>} Removed participant
   */
  async removeParticipant(conversationId, userId) {
    try {
      const result = await this.db.query(
        `DELETE FROM conversation_participants 
         WHERE conversation_id = $1 AND user_id = $2
         RETURNING *`,
        [conversationId, userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Participant not found');
      }

      logger.info(`Participant removed from conversation`, { conversationId, userId });

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error removing participant:', error);
      throw error;
    }
  }

  /**
   * Update participant settings
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @param {Object} settings - Settings to update
   * @returns {Promise<Object>} Updated participant settings
   */
  async updateParticipantSettings(conversationId, userId, settings) {
    const { isMuted } = settings;

    try {
      const result = await this.db.query(
        `UPDATE conversation_participants 
         SET is_muted = $1
         WHERE conversation_id = $2 AND user_id = $3
         RETURNING *`,
        [isMuted, conversationId, userId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Participant not found');
      }

      logger.info(`Participant settings updated`, { conversationId, userId });

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error updating participant settings:', error);
      throw error;
    }
  }

  /**
   * Search conversations for a user
   * @param {string} userId - User ID
   * @param {string} searchQuery - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Matching conversations
   */
  async searchConversations(userId, searchQuery, options = {}) {
    const { limit = 20 } = options;

    try {
      const query = `
        SELECT DISTINCT c.*
        FROM conversations c
        INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
        WHERE cp.user_id = $1 
          AND (c.name ILIKE $2 OR c.description ILIKE $2)
        ORDER BY c.updated_at DESC
        LIMIT $3
      `;

      const result = await this.db.query(query, [userId, `%${searchQuery}%`, limit]);

      logger.info(`Search returned ${result.rows.length} conversations`, { userId, searchQuery });

      return result.rows;
    } catch (error) {
      logger.error('Error searching conversations:', error);
      throw error;
    }
  }

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Find messages by conversation ID
   * @param {string} conversationId - Conversation ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Messages
   */
  async findMessagesByConversationId(conversationId, options = {}) {
    const { limit = 50, beforeMessageId = null } = options;

    try {
      let query = `
        SELECT 
          m.*,
          COALESCE(u.username, '[Deleted User]') as sender_username,
          COALESCE(u.full_name, 'Deleted User') as sender_full_name,
          u.profile_photo_url as sender_profile_photo,
          COALESCE(
            json_agg(
              json_build_object(
                'emoji', mr.emoji,
                'user_id', mr.user_id,
                'username', COALESCE(ru.username, '[Deleted User]')
              )
            ) FILTER (WHERE mr.emoji IS NOT NULL),
            '[]'
          ) as reactions
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id AND u.is_active = true
        LEFT JOIN message_reactions mr ON m.id = mr.message_id
        LEFT JOIN users ru ON mr.user_id = ru.id AND ru.is_active = true
        WHERE m.conversation_id = $1
      `;

      const params = [conversationId];
      let paramIndex = 2;

      if (beforeMessageId) {
        query += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $${paramIndex})`;
        params.push(beforeMessageId);
        paramIndex++;
      }

      query += `
        GROUP BY m.id, u.username, u.full_name, u.profile_photo_url
        ORDER BY m.created_at DESC
        LIMIT $${paramIndex}
      `;

      params.push(limit);

      const result = await this.db.query(query, params);

      return result.rows;
    } catch (error) {
      logger.error('Error finding messages:', error);
      throw error;
    }
  }

  /**
   * Find message by ID
   * @param {string} messageId - Message ID
   * @returns {Promise<Object>} Message
   */
  async findMessageById(messageId) {
    try {
      const result = await this.db.query(
        'SELECT * FROM messages WHERE id = $1',
        [messageId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Message not found');
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error finding message by ID:', error);
      throw error;
    }
  }

  /**
   * Create a new message
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} Created message
   */
  async createMessage(messageData) {
    const { conversationId, senderId, content, messageType, replyToMessageId } = messageData;

    try {
      const result = await this.db.query(
        `INSERT INTO messages (conversation_id, sender_id, content, message_type, reply_to_message_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [conversationId, senderId, content, messageType, replyToMessageId]
      );

      // Update conversation's updated_at
      await this.db.query(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [conversationId]
      );

      logger.info(`Message created`, { messageId: result.rows[0].id, conversationId });

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating message:', error);
      throw error;
    }
  }

  /**
   * Update message content
   * @param {string} messageId - Message ID
   * @param {string} content - New content
   * @returns {Promise<Object>} Updated message
   */
  async updateMessage(messageId, content) {
    try {
      const result = await this.db.query(
        `UPDATE messages 
         SET content = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [content, messageId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Message not found');
      }

      logger.info(`Message updated`, { messageId });

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error updating message:', error);
      throw error;
    }
  }

  /**
   * Delete a message
   * @param {string} messageId - Message ID
   * @returns {Promise<void>}
   */
  async deleteMessage(messageId) {
    try {
      const result = await this.db.query(
        'DELETE FROM messages WHERE id = $1 RETURNING id',
        [messageId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Message not found');
      }

      logger.info(`Message deleted`, { messageId });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error('Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Add reaction to message
   * @param {string} messageId - Message ID
   * @param {string} userId - User ID
   * @param {string} emoji - Emoji
   * @returns {Promise<Object>} Reaction
   */
  async addReaction(messageId, userId, emoji) {
    try {
      const result = await this.db.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id, emoji) DO NOTHING
         RETURNING *`,
        [messageId, userId, emoji]
      );

      logger.info(`Reaction added to message`, { messageId, userId, emoji });

      return result.rows[0] || { message_id: messageId, user_id: userId, emoji };
    } catch (error) {
      logger.error('Error adding reaction:', error);
      throw error;
    }
  }

  /**
   * Remove reaction from message
   * @param {string} messageId - Message ID
   * @param {string} userId - User ID
   * @param {string} emoji - Emoji
   * @returns {Promise<void>}
   */
  async removeReaction(messageId, userId, emoji) {
    try {
      await this.db.query(
        'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
        [messageId, userId, emoji]
      );

      logger.info(`Reaction removed from message`, { messageId, userId, emoji });
    } catch (error) {
      logger.error('Error removing reaction:', error);
      throw error;
    }
  }

  /**
   * Mark messages as read in a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of messages marked as read
   */
  async markConversationAsRead(conversationId, userId) {
    try {
      // Update last_read_at for the participant
      await this.db.query(
        `UPDATE conversation_participants 
         SET last_read_at = CURRENT_TIMESTAMP
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, userId]
      );

      logger.info(`Conversation marked as read`, { conversationId, userId });

      return { success: true };
    } catch (error) {
      logger.error('Error marking conversation as read:', error);
      throw error;
    }
  }

  /**
   * Search messages in a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} searchQuery - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Matching messages
   */
  async searchMessages(conversationId, searchQuery, options = {}) {
    const { limit = 20 } = options;

    try {
      const query = `
        SELECT 
          m.*,
          u.username as sender_username,
          u.full_name as sender_full_name,
          u.profile_photo_url as sender_profile_photo
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = $1 AND m.content ILIKE $2
        ORDER BY m.created_at DESC
        LIMIT $3
      `;

      const result = await this.db.query(query, [conversationId, `%${searchQuery}%`, limit]);

      logger.info(`Message search returned ${result.rows.length} results`, { conversationId, searchQuery });

      return result.rows;
    } catch (error) {
      logger.error('Error searching messages:', error);
      throw error;
    }
  }

  /**
   * Get media from conversation
   * @param {string} conversationId - Conversation ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Media messages
   */
  async getMedia(conversationId, options = {}) {
    const { limit = 20, offset = 0 } = options;

    try {
      const query = `
        SELECT 
          m.*,
          u.username as sender_username,
          u.full_name as sender_full_name,
          u.profile_photo_url as sender_profile_photo
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = $1 
          AND m.message_type IN ('image', 'video', 'file')
        ORDER BY m.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.db.query(query, [conversationId, limit, offset]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting media:', error);
      throw error;
    }
  }
}

module.exports = new ChatRepository();
