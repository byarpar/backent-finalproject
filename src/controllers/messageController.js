/**
 * Message Controller
 * Handles direct messaging between users
 */

const { successResponse, errorResponse, asyncHandler } = require('../utils');
const { db } = require('../config/database');
const asError = (message) => ({ message });

/**
 * Get all conversations for current user
 */
const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `SELECT c.*,
      CASE WHEN c.participant1_id = $1 THEN u2.id ELSE u1.id END AS other_user_id,
      CASE WHEN c.participant1_id = $1 THEN u2.username ELSE u1.username END AS other_username,
      CASE WHEN c.participant1_id = $1 THEN u2.profile_photo_url ELSE u1.profile_photo_url END AS other_photo,
      CASE WHEN c.participant1_id = $1 THEN u2.online_status ELSE u1.online_status END AS other_status,
      m.content AS last_message,
      m.created_at AS last_message_at,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND is_read = false) AS unread_count
    FROM conversations c
    JOIN users u1 ON c.participant1_id = u1.id
    JOIN users u2 ON c.participant2_id = u2.id
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE c.participant1_id = $1 OR c.participant2_id = $1
    ORDER BY c.last_message_at DESC`,
    [userId]
  );

  return successResponse(res, { conversations: result.rows }, 'Conversations retrieved');
});

/**
 * Get or create conversation with a user
 */
const getOrCreateConversation = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { userId: otherId } = req.params;

  if (userId === otherId) return errorResponse(res, asError('Cannot message yourself'), 400);

  const p1 = userId < otherId ? userId : otherId;
  const p2 = userId < otherId ? otherId : userId;

  const existing = await db.query(
    `SELECT * FROM conversations WHERE participant1_id = $1 AND participant2_id = $2`,
    [p1, p2]
  );

  if (existing.rows[0]) {
    return successResponse(res, { conversation: existing.rows[0] }, 'Conversation found');
  }

  const result = await db.query(
    `INSERT INTO conversations (participant1_id, participant2_id) VALUES ($1, $2) RETURNING *`,
    [p1, p2]
  );

  return successResponse(res, { conversation: result.rows[0] }, 'Conversation created');
});

/**
 * Get messages in a conversation
 */
const getMessages = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { conversationId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  // Verify user is part of conversation
  const conv = await db.query(
    `SELECT * FROM conversations WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)`,
    [conversationId, userId]
  );
  if (!conv.rows[0]) return errorResponse(res, asError('Conversation not found'), 404);

  const [messages, countResult] = await Promise.all([
    db.query(
      `SELECT m.*, u.username, u.profile_photo_url
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    ),
    db.query(`SELECT COUNT(*) FROM messages WHERE conversation_id = $1`, [conversationId])
  ]);

  // Mark messages as read
  await db.query(
    `UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2`,
    [conversationId, userId]
  );

  return successResponse(res, {
    messages: messages.rows.reverse(),
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit)
  }, 'Messages retrieved');
});

/**
 * Send a message
 */
const sendMessage = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { conversationId } = req.params;
  const { content } = req.body;

  if (!content?.trim()) return errorResponse(res, asError('Message content is required'), 400);

  const conv = await db.query(
    `SELECT * FROM conversations WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)`,
    [conversationId, userId]
  );
  if (!conv.rows[0]) return errorResponse(res, asError('Conversation not found'), 404);

  const result = await db.query(
    `INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *`,
    [conversationId, userId, content.trim()]
  );

  await db.query(
    `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
    [conversationId]
  );

  return successResponse(res, { message: result.rows[0] }, 'Message sent');
});

/**
 * Delete a conversation and its messages
 */
const deleteConversation = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { conversationId } = req.params;

  // Verify user is a participant
  const conv = await db.query(
    `SELECT id FROM conversations WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)`,
    [conversationId, userId]
  );

  if (!conv.rows[0]) return errorResponse(res, asError('Conversation not found'), 404);

  await db.query(`DELETE FROM messages WHERE conversation_id = $1`, [conversationId]);
  await db.query(`DELETE FROM conversations WHERE id = $1`, [conversationId]);

  return successResponse(res, null, 'Conversation deleted');
});

/**
 * Delete all conversations for current user
 */
const deleteAllConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const convs = await db.query(
    `SELECT id FROM conversations WHERE participant1_id = $1 OR participant2_id = $1`,
    [userId]
  );

  const ids = convs.rows.map(c => c.id);
  if (ids.length > 0) {
    await db.query(`DELETE FROM messages WHERE conversation_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM conversations WHERE id = ANY($1)`, [ids]);
  }

  return successResponse(res, null, 'All conversations deleted');
});

/**
 * Delete a message
 */
const deleteMessage = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { messageId } = req.params;

  const result = await db.query(
    `DELETE FROM messages WHERE id = $1 AND sender_id = $2 RETURNING id`,
    [messageId, userId]
  );

  if (!result.rows[0]) return errorResponse(res, asError('Message not found'), 404);
  return successResponse(res, null, 'Message deleted');
});

module.exports = {
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  deleteConversation,
  deleteAllConversations,
  deleteMessage
};
