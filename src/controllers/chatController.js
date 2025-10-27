const chatService = require('../services/chatService');
const notificationController = require('./notificationController');
const UserRepository = require('../repositories/UserRepository');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/helpers');
const { HTTP_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * ChatController v2
 * Clean HTTP request/response handling for chat operations
 * All business logic delegated to chatService
 */

// ============================================
// Conversation Endpoints
// ============================================

/**
 * Get all conversations for the authenticated user
 * @route GET /api/chat/conversations
 * @access Private
 */
const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit, offset } = req.query;

  const options = {
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  };

  const conversations = await chatService.getConversations(userId, options);

  sendSuccess(res, HTTP_STATUS.OK, { conversations }, 'Conversations retrieved successfully');
});

/**
 * Get a specific conversation
 * @route GET /api/chat/conversations/:id
 * @access Private
 */
const getConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const conversation = await chatService.getConversation(id, userId);

  sendSuccess(res, HTTP_STATUS.OK, { conversation }, 'Conversation retrieved successfully');
});

/**
 * Create a new group conversation
 * @route POST /api/chat/conversations
 * @access Private
 */
const createConversation = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { name, description, participantIds } = req.body;

  const conversation = await chatService.createConversation(
    { name, description, participantIds },
    userId
  );

  logger.info(`Group conversation created`, { conversationId: conversation.id, userId });

  // Send notifications to all participants except the creator
  try {
    const creator = await UserRepository.findById(userId);
    const creatorName = creator.full_name || creator.username;

    for (const participantId of participantIds) {
      if (participantId !== userId) {
        await notificationController.createNotification({
          userId: participantId,
          type: 'group_chat',
          category: 'system',
          actorId: userId,
          actorName: creatorName,
          actorAvatar: creator.profile_photo_url,
          message: 'added you to a group chat',
          targetTitle: name,
          targetLink: `/chat?conversation=${conversation.id}`
        });

        // Emit real-time notification via Socket.IO if available
        const socketService = req.app.get('socketService');
        if (socketService) {
          socketService.emitNotification(participantId, {
            type: 'group_chat',
            category: 'system',
            message: 'added you to a group chat',
            targetLink: `/chat?conversation=${conversation.id}`,
            actorName: creatorName,
            targetTitle: name
          });
        }
      }
    }
  } catch (notifError) {
    // Don't fail conversation creation if notification fails
    logger.error('Error creating group chat notification:', notifError);
  }

  sendCreated(res, { conversation }, 'Conversation created successfully');
});

/**
 * Update conversation details
 * @route PUT /api/chat/conversations/:id
 * @access Private
 */
const updateConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const updates = req.body;

  const conversation = await chatService.updateConversation(id, updates, userId);

  logger.info(`Conversation updated`, { conversationId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, { conversation }, 'Conversation updated successfully');
});

/**
 * Add participant to conversation
 * @route POST /api/chat/conversations/:id/participants
 * @access Private
 */
const addParticipant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { userId: newParticipantId, role = 'member' } = req.body;

  const result = await chatService.addParticipant(id, newParticipantId, userId, role);

  logger.info(`Participant added to conversation`, { conversationId: id, newParticipantId, userId });

  // Send notification to the new participant
  try {
    const adder = await UserRepository.findById(userId);
    const adderName = adder.full_name || adder.username;

    await notificationController.createNotification({
      userId: newParticipantId,
      type: 'group_chat',
      category: 'system',
      actorId: userId,
      actorName: adderName,
      actorAvatar: adder.profile_photo_url,
      message: 'added you to a group chat',
      targetTitle: result.conversation.name,
      targetLink: `/chat?conversation=${id}`
    });

    // Emit real-time notification via Socket.IO if available
    const socketService = req.app.get('socketService');
    if (socketService) {
      socketService.emitNotification(newParticipantId, {
        type: 'group_chat',
        category: 'system',
        message: 'added you to a group chat',
        targetLink: `/chat?conversation=${id}`,
        actorName: adderName,
        targetTitle: result.conversation.name
      });
    }
  } catch (notifError) {
    // Don't fail participant addition if notification fails
    logger.error('Error creating group chat notification:', notifError);
  }

  sendCreated(res, { participant: result.participant }, 'Participant added successfully');
});

/**
 * Remove participant from conversation
 * @route DELETE /api/chat/conversations/:id/participants/:userId
 * @access Private
 */
const removeParticipant = asyncHandler(async (req, res) => {
  const { id, userId: participantId } = req.params;
  const userId = req.user.id;

  await chatService.removeParticipant(id, participantId, userId);

  logger.info(`Participant removed from conversation`, { conversationId: id, participantId });

  sendSuccess(res, HTTP_STATUS.OK, null, 'Participant removed successfully');
});

/**
 * Update participant settings (mute, etc.)
 * @route PUT /api/chat/conversations/:id/settings
 * @access Private
 */
const updateParticipantSettings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const settings = req.body;

  const participant = await chatService.updateParticipantSettings(id, userId, settings);

  logger.info(`Participant settings updated`, { conversationId: id, userId });

  sendSuccess(res, HTTP_STATUS.OK, { participant }, 'Settings updated successfully');
});

/**
 * Search conversations
 * @route GET /api/chat/search
 * @access Private
 */
const searchConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { q: query, limit } = req.query;

  const options = {
    limit: parseInt(limit) || 20
  };

  const conversations = await chatService.searchConversations(userId, query, options);

  sendSuccess(res, HTTP_STATUS.OK, { conversations }, 'Search completed successfully');
});

// ============================================
// Message Endpoints
// ============================================

/**
 * Get messages for a conversation
 * @route GET /api/chat/conversations/:id/messages
 * @access Private
 */
const getMessages = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { limit, beforeMessageId } = req.query;

  const options = {
    limit: parseInt(limit) || 50,
    beforeMessageId: beforeMessageId || null
  };

  const messages = await chatService.getMessages(id, userId, options);

  sendSuccess(res, HTTP_STATUS.OK, { messages }, 'Messages retrieved successfully');
});

/**
 * Send a message
 * @route POST /api/chat/conversations/:id/messages
 * @access Private
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { content, messageType, replyToMessageId } = req.body;

  const message = await chatService.sendMessage(
    id,
    { content, messageType, replyToMessageId },
    userId
  );

  logger.info(`Message sent`, { messageId: message.id, conversationId: id, userId });

  sendCreated(res, { message }, 'Message sent successfully');
});

/**
 * Update a message
 * @route PUT /api/chat/messages/:messageId
 * @access Private
 */
const updateMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.id;
  const { content } = req.body;

  const message = await chatService.updateMessage(messageId, content, userId);

  logger.info(`Message updated`, { messageId, userId });

  sendSuccess(res, HTTP_STATUS.OK, { message }, 'Message updated successfully');
});

/**
 * Delete a message
 * @route DELETE /api/chat/messages/:messageId
 * @access Private
 */
const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.id;

  await chatService.deleteMessage(messageId, userId);

  logger.info(`Message deleted`, { messageId, userId });

  sendSuccess(res, HTTP_STATUS.OK, null, 'Message deleted successfully');
});

/**
 * Add reaction to message
 * @route POST /api/chat/messages/:messageId/reactions
 * @access Private
 */
const addReaction = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.id;
  const { emoji } = req.body;

  const reaction = await chatService.addReaction(messageId, userId, emoji);

  logger.info(`Reaction added to message`, { messageId, userId, emoji });

  sendCreated(res, { reaction }, 'Reaction added successfully');
});

/**
 * Remove reaction from message
 * @route DELETE /api/chat/messages/:messageId/reactions/:emoji
 * @access Private
 */
const removeReaction = asyncHandler(async (req, res) => {
  const { messageId, emoji } = req.params;
  const userId = req.user.id;

  await chatService.removeReaction(messageId, userId, emoji);

  logger.info(`Reaction removed from message`, { messageId, userId, emoji });

  sendSuccess(res, HTTP_STATUS.OK, null, 'Reaction removed successfully');
});

/**
 * Mark messages as read
 * @route POST /api/chat/conversations/:id/read
 * @access Private
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const result = await chatService.markAsRead(id, userId);

  sendSuccess(res, HTTP_STATUS.OK, result, 'Messages marked as read');
});

/**
 * Search messages in conversation
 * @route GET /api/chat/conversations/:id/search
 * @access Private
 */
const searchMessages = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { q: query, limit } = req.query;

  const options = {
    limit: parseInt(limit) || 20
  };

  const messages = await chatService.searchMessages(id, query, userId, options);

  sendSuccess(res, HTTP_STATUS.OK, { messages }, 'Search completed successfully');
});

/**
 * Get media from conversation
 * @route GET /api/chat/conversations/:id/media
 * @access Private
 */
const getMedia = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { limit, offset } = req.query;

  const options = {
    limit: parseInt(limit) || 20,
    offset: parseInt(offset) || 0
  };

  const media = await chatService.getMedia(id, userId, options);

  sendSuccess(res, HTTP_STATUS.OK, { media }, 'Media retrieved successfully');
});

module.exports = {
  // Conversation endpoints
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  addParticipant,
  removeParticipant,
  updateParticipantSettings,
  searchConversations,

  // Message endpoints
  getMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  markAsRead,
  searchMessages,
  getMedia
};
