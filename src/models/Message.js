/**
 * Message Model
 * 
 * Handles database operations for chat messages
 */

const { db } = require('../config/database');
const logger = require('../utils/logger');

class Message {
  /**
   * Create a new message
   */
  static async create({ conversationId, senderId, content, messageType = 'text', mediaUrl, mediaFilename, mediaSize, replyToMessageId }) {
    const result = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, media_url, media_filename, media_size, reply_to_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [conversationId, senderId, content, messageType, mediaUrl, mediaFilename, mediaSize, replyToMessageId]
    );

    const message = result.rows[0];

    // Get message with sender info
    return await this.findById(message.id);
  }

  /**
   * Find message by ID
   */
  static async findById(id) {
    const result = await db.query(
      `SELECT m.*,
              json_build_object(
                'id', u.id,
                'username', u.username,
                'avatar_url', u.profile_photo_url
              ) as sender,
              CASE 
                WHEN m.reply_to_message_id IS NOT NULL 
                THEN json_build_object(
                  'id', rm.id,
                  'content', rm.content,
                  'sender_username', ru.username
                )
                ELSE NULL
              END as reply_to_message,
              (SELECT json_agg(
                json_build_object(
                  'emoji', mr.emoji,
                  'user_id', mr.user_id,
                  'username', mru.username,
                  'created_at', mr.created_at
                )
              )
              FROM message_reactions mr
              LEFT JOIN users mru ON mr.user_id = mru.id
              WHERE mr.message_id = m.id) as reactions
       FROM messages m
       INNER JOIN users u ON m.sender_id = u.id
       LEFT JOIN messages rm ON m.reply_to_message_id = rm.id
       LEFT JOIN users ru ON rm.sender_id = ru.id
       WHERE m.id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get messages for a conversation
   */
  static async findByConversationId(conversationId, { limit = 50, beforeMessageId = null } = {}) {
    let query = `
      SELECT m.*,
             json_build_object(
               'id', u.id,
               'username', u.username,
               'avatar_url', u.profile_photo_url
             ) as sender,
             CASE 
               WHEN m.reply_to_message_id IS NOT NULL 
               THEN json_build_object(
                 'id', rm.id,
                 'content', rm.content,
                 'sender_username', ru.username
               )
               ELSE NULL
             END as reply_to_message,
             (SELECT json_agg(
               json_build_object(
                 'emoji', mr.emoji,
                 'user_id', mr.user_id,
                 'username', mru.username,
                 'created_at', mr.created_at
               )
             )
             FROM message_reactions mr
             LEFT JOIN users mru ON mr.user_id = mru.id
             WHERE mr.message_id = m.id) as reactions,
             (SELECT json_agg(
               json_build_object(
                 'user_id', mrr.user_id,
                 'username', mrru.username,
                 'read_at', mrr.read_at
               )
             )
             FROM message_read_receipts mrr
             LEFT JOIN users mrru ON mrr.user_id = mrru.id
             WHERE mrr.message_id = m.id) as read_receipts
      FROM messages m
      INNER JOIN users u ON m.sender_id = u.id
      LEFT JOIN messages rm ON m.reply_to_message_id = rm.id
      LEFT JOIN users ru ON rm.sender_id = ru.id
      WHERE m.conversation_id = $1 AND m.is_deleted = FALSE
    `;

    const params = [conversationId];

    if (beforeMessageId) {
      query += ` AND m.id < $2`;
      params.push(beforeMessageId);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    // Return messages in chronological order
    return result.rows.reverse();
  }

  /**
   * Update message content
   */
  static async update(id, content) {
    const result = await db.query(
      `UPDATE messages
       SET content = $1, is_edited = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [content, id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return await this.findById(id);
  }

  /**
   * Soft delete message
   */
  static async delete(id) {
    const result = await db.query(
      `UPDATE messages
       SET is_deleted = TRUE, content = '[Message deleted]', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return result.rows[0];
  }

  /**
   * Add reaction to message
   */
  static async addReaction(messageId, userId, emoji) {
    try {
      const result = await db.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id, emoji) DO NOTHING
         RETURNING *`,
        [messageId, userId, emoji]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error adding reaction', { error: error.message });
      throw error;
    }
  }

  /**
   * Remove reaction from message
   */
  static async removeReaction(messageId, userId, emoji) {
    const result = await db.query(
      `DELETE FROM message_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3
       RETURNING *`,
      [messageId, userId, emoji]
    );

    return result.rows[0];
  }

  /**
   * Mark message as read
   */
  static async markAsRead(messageId, userId) {
    try {
      const result = await db.query(
        `INSERT INTO message_read_receipts (message_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (message_id, user_id) 
         DO UPDATE SET read_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [messageId, userId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Error marking message as read', { error: error.message });
      throw error;
    }
  }

  /**
   * Mark all messages in conversation as read
   */
  static async markConversationAsRead(conversationId, userId) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Get all unread message IDs
      const messagesResult = await client.query(
        `SELECT m.id
         FROM messages m
         LEFT JOIN message_read_receipts mrr ON m.id = mrr.message_id AND mrr.user_id = $2
         WHERE m.conversation_id = $1 
           AND m.sender_id != $2
           AND mrr.id IS NULL`,
        [conversationId, userId]
      );

      if (messagesResult.rows.length > 0) {
        const messageIds = messagesResult.rows.map(row => row.id);

        // Insert read receipts for all unread messages
        const values = messageIds.map((id, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ');
        const params = messageIds.flatMap(id => [id, userId]);

        await client.query(
          `INSERT INTO message_read_receipts (message_id, user_id)
           VALUES ${values}
           ON CONFLICT (message_id, user_id) DO NOTHING`,
          params
        );

        // Update last_read_message_id in conversation_participants
        const lastMessageId = messageIds[messageIds.length - 1];
        await client.query(
          `UPDATE conversation_participants
           SET last_read_message_id = $1, last_read_at = CURRENT_TIMESTAMP
           WHERE conversation_id = $2 AND user_id = $3`,
          [lastMessageId, conversationId, userId]
        );
      }

      await client.query('COMMIT');
      return { markedCount: messagesResult.rows.length };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error marking conversation as read', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search messages in conversation
   */
  static async search(conversationId, query, { limit = 20 } = {}) {
    const result = await db.query(
      `SELECT m.*,
              json_build_object(
                'id', u.id,
                'username', u.username,
                'avatar_url', u.profile_photo_url
              ) as sender
       FROM messages m
       INNER JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1 
         AND m.is_deleted = FALSE
         AND m.content ILIKE $2
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [conversationId, `%${query}%`, limit]
    );

    return result.rows;
  }

  /**
   * Get message statistics for conversation
   */
  static async getStats(conversationId) {
    const result = await db.query(
      `SELECT 
         COUNT(*) as total_messages,
         COUNT(DISTINCT sender_id) as unique_senders,
         COUNT(*) FILTER (WHERE message_type = 'audio') as audio_count,
         COUNT(*) FILTER (WHERE message_type = 'image') as image_count,
         COUNT(*) FILTER (WHERE message_type = 'file') as file_count
       FROM messages
       WHERE conversation_id = $1 AND is_deleted = FALSE`,
      [conversationId]
    );

    return result.rows[0];
  }

  /**
   * Get media messages from conversation
   */
  static async getMedia(conversationId, { limit = 20, offset = 0 } = {}) {
    const result = await db.query(
      `SELECT m.*,
              json_build_object(
                'id', u.id,
                'username', u.username,
                'avatar_url', u.profile_photo_url
              ) as sender
       FROM messages m
       INNER JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1 
         AND m.is_deleted = FALSE
         AND m.message_type IN ('image', 'audio', 'file')
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );

    return result.rows;
  }
}

module.exports = Message;
