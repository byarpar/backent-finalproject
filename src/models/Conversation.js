/**
 * Conversation Model
 * 
 * Handles database operations for chat conversations (DMs and group chats)
 */

const { db } = require('../config/database');
const logger = require('../utils/logger');

class Conversation {
  /**
   * Create a new conversation
   */
  static async create({ type, name, description, avatarUrl, createdBy, participantIds }) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Create conversation
      const conversationResult = await client.query(
        `INSERT INTO conversations (type, name, description, avatar_url, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [type, name, description, avatarUrl, createdBy]
      );

      const conversation = conversationResult.rows[0];

      logger.info('📝 Created conversation', {
        id: conversation.id,
        type,
        createdBy,
        participantIds
      });

      // Add creator as admin participant
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role)
         VALUES ($1, $2, 'admin')`,
        [conversation.id, createdBy]
      );

      logger.info('✅ Added creator as admin', { conversationId: conversation.id, userId: createdBy });

      // Add other participants
      if (participantIds && participantIds.length > 0) {
        const otherParticipants = participantIds.filter(id => id !== createdBy);

        logger.info('👥 Adding participants', {
          total: participantIds.length,
          others: otherParticipants.length,
          participantIds: otherParticipants
        });

        if (otherParticipants.length > 0) {
          // Build parameterized query for multiple participants
          const values = [];
          const placeholders = otherParticipants.map((id, index) => {
            const base = index * 3;
            values.push(conversation.id, id, 'member');
            return `($${base + 1}, $${base + 2}, $${base + 3})`;
          }).join(', ');

          logger.info('🔧 SQL placeholders built', { placeholders, values });

          await client.query(
            `INSERT INTO conversation_participants (conversation_id, user_id, role)
             VALUES ${placeholders}`,
            values
          );

          logger.info('✅ Participants inserted successfully');
        }
      } else {
        logger.warn('⚠️  No participantIds provided or empty array');
      }

      await client.query('COMMIT');

      // Fetch full conversation with participants
      return await this.findById(conversation.id);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating conversation', {
        error: error.message,
        stack: error.stack,
        type,
        participantIds
      });
      throw error;
    } finally {
      client.release();
    }
  }



  /**
   * Find conversation by ID with participants
   */
  static async findById(id) {
    const result = await db.query(
      `SELECT c.*,
              json_agg(
                json_build_object(
                  'id', u.id,
                  'username', u.username,
                  'email', u.email,
                  'avatar_url', u.profile_photo_url,
                  'is_online', (u.online_status = 'online'),
                  'role', cp.role,
                  'is_muted', cp.is_muted,
                  'joined_at', cp.joined_at
                )
              ) FILTER (WHERE cp.left_at IS NULL) as participants
       FROM conversations c
       LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
       LEFT JOIN users u ON cp.user_id = u.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [id]
    );

    const conversation = result.rows[0] || null;

    if (conversation) {
      logger.info('🔍 findById result', {
        id: conversation.id,
        type: conversation.type,
        participantsCount: conversation.participants?.length || 0,
        participants: conversation.participants
      });
    }

    return conversation;
  }

  /**
   * Get all conversations for a user
   */
  static async findByUserId(userId, { limit = 50, offset = 0 } = {}) {
    const result = await db.query(
      `SELECT c.*,
              (SELECT COUNT(*) 
               FROM messages m
               LEFT JOIN message_read_receipts mrr ON m.id = mrr.message_id AND mrr.user_id = $1
               WHERE m.conversation_id = c.id 
                 AND m.sender_id != $1
                 AND mrr.id IS NULL) as unread_count,
              (SELECT json_build_object(
                 'id', m.id,
                 'content', m.content,
                 'message_type', m.message_type,
                 'sender_id', m.sender_id,
                 'sender_username', u.username,
                 'created_at', m.created_at
               )
               FROM messages m
               LEFT JOIN users u ON m.sender_id = u.id
               WHERE m.conversation_id = c.id
               ORDER BY m.created_at DESC
               LIMIT 1) as last_message,
              (SELECT json_agg(
                 json_build_object(
                   'id', u2.id,
                   'username', u2.username,
                   'avatar_url', u2.profile_photo_url,
                   'is_online', (u2.online_status = 'online')
                 )
               )
               FROM conversation_participants cp2
               LEFT JOIN users u2 ON cp2.user_id = u2.id
               WHERE cp2.conversation_id = c.id
                 AND cp2.left_at IS NULL
                 AND u2.id != $1) as other_participants,
              (SELECT json_agg(
                 json_build_object(
                   'id', u3.id,
                   'username', u3.username,
                   'email', u3.email,
                   'avatar_url', u3.profile_photo_url,
                   'is_online', (u3.online_status = 'online'),
                   'role', cp3.role,
                   'is_muted', cp3.is_muted,
                   'joined_at', cp3.joined_at
                 )
               )
               FROM conversation_participants cp3
               LEFT JOIN users u3 ON cp3.user_id = u3.id
               WHERE cp3.conversation_id = c.id
                 AND cp3.left_at IS NULL) as participants
       FROM conversations c
       INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
       WHERE cp.user_id = $1 
         AND cp.left_at IS NULL
         AND c.is_archived = FALSE
         AND c.type = 'group'
       GROUP BY c.id
       ORDER BY c.last_message_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Update conversation
   */
  static async update(id, updates) {
    const allowedFields = ['name', 'description', 'avatar_url'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = [id, ...fields.map(field => updates[field])];

    const result = await db.query(
      `UPDATE conversations 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Add participant to conversation
   */
  static async addParticipant(conversationId, userId, role = 'member') {
    const result = await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, user_id) 
       DO UPDATE SET left_at = NULL, joined_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [conversationId, userId, role]
    );

    return result.rows[0];
  }

  /**
   * Remove participant from conversation
   */
  static async removeParticipant(conversationId, userId) {
    const result = await db.query(
      `UPDATE conversation_participants
       SET left_at = CURRENT_TIMESTAMP
       WHERE conversation_id = $1 AND user_id = $2
       RETURNING *`,
      [conversationId, userId]
    );

    return result.rows[0];
  }

  /**
   * Check if user is participant
   */
  static async isParticipant(conversationId, userId) {
    // Check if it's a public channel first
    const conversationResult = await db.query(
      `SELECT type FROM conversations WHERE id = $1`,
      [conversationId]
    );

    // Public channels are accessible to all authenticated users
    if (conversationResult.rows.length > 0 && conversationResult.rows[0].type === 'public') {
      return true;
    }

    // For private conversations, check participant membership
    const result = await db.query(
      `SELECT id FROM conversation_participants
       WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [conversationId, userId]
    );

    return result.rows.length > 0;
  }

  /**
   * Update participant settings
   */
  static async updateParticipantSettings(conversationId, userId, settings) {
    const allowedFields = ['is_muted', 'last_read_message_id'];
    const fields = Object.keys(settings).filter(key => allowedFields.includes(key));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 3}`).join(', ');
    const values = [conversationId, userId, ...fields.map(field => settings[field])];

    if (settings.last_read_message_id) {
      await db.query(
        `UPDATE conversation_participants
         SET last_read_at = CURRENT_TIMESTAMP
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, userId]
      );
    }

    const result = await db.query(
      `UPDATE conversation_participants
       SET ${setClause}
       WHERE conversation_id = $1 AND user_id = $2
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Archive conversation
   */
  static async archive(id) {
    const result = await db.query(
      `UPDATE conversations
       SET is_archived = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return result.rows[0];
  }

  /**
   * Search conversations
   */
  static async search(userId, query, { limit = 20 } = {}) {
    const result = await db.query(
      `SELECT DISTINCT c.*
       FROM conversations c
       INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
       WHERE cp.user_id = $1 
         AND cp.left_at IS NULL
         AND (c.name ILIKE $2 OR c.description ILIKE $2)
       ORDER BY c.last_message_at DESC
       LIMIT $3`,
      [userId, `%${query}%`, limit]
    );

    return result.rows;
  }
}

module.exports = Conversation;
