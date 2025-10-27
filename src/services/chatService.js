const ChatRepository = require('../repositories/ChatRepository');
const UserRepository = require('../repositories/UserRepository');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');

/**
 * ChatService
 * Business logic layer for chat operations
 */
class ChatService {
  // ============================================
  // Conversation Operations
  // ============================================

  /**
   * Get all conversations for a user
   * @param {string} userId - User ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Conversations
   */
  async getConversations(userId, options = {}) {
    const conversations = await ChatRepository.findConversationsByUserId(userId, options);

    logger.info(`Retrieved ${conversations.length} conversations for user ${userId}`);

    return conversations;
  }

  /**
   * Get a specific conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID (for permission check)
   * @returns {Promise<Object>} Conversation
   */
  async getConversation(conversationId, userId) {
    // Get conversation first
    const conversation = await ChatRepository.findConversationById(conversationId);

    // Public channels are accessible to everyone
    if (conversation.type === 'public') {
      return conversation;
    }

    // Check if user is participant for private conversations
    const isParticipant = await ChatRepository.isParticipant(conversationId, userId);
    if (!isParticipant) {
      throw new AuthorizationError('You are not a participant of this conversation');
    }

    return conversation;
  }

  /**
   * Create a new conversation
   * @param {Object} conversationData - Conversation data
   * @param {string} userId - Creator user ID
   * @returns {Promise<Object>} Created conversation
   */
  async createConversation(conversationData, userId) {
    const { name, description, participantIds } = conversationData;

    // Validate group conversation requirements
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Group conversations must have a name');
    }

    if (!participantIds || participantIds.length === 0) {
      throw new ValidationError('Group conversations must have participants');
    }

    // Validate all participant IDs exist
    for (const participantId of participantIds) {
      const user = await UserRepository.findById(participantId);
      if (!user) {
        throw new ValidationError(`User with ID ${participantId} not found`);
      }
    }

    const conversation = await ChatRepository.createConversation({
      type: 'group',
      name: name.trim(),
      description: description?.trim() || null,
      avatarUrl: null,
      createdBy: userId,
      participantIds
    });

    logger.info(`Conversation created`, { conversationId: conversation.id, createdBy: userId });

    return conversation;
  }

  /**
   * Update conversation details
   * @param {string} conversationId - Conversation ID
   * @param {Object} updates - Updates to apply
   * @param {string} userId - User ID (for permission check)
   * @returns {Promise<Object>} Updated conversation
   */
  async updateConversation(conversationId, updates, userId) {
    // Check if user is participant
    const isParticipant = await ChatRepository.isParticipant(conversationId, userId);
    if (!isParticipant) {
      throw new AuthorizationError('You are not a participant of this conversation');
    }

    // Validate name if provided
    if (updates.name !== undefined && updates.name.trim().length === 0) {
      throw new ValidationError('Conversation name cannot be empty');
    }

    const conversation = await ChatRepository.updateConversation(conversationId, updates);

    logger.info(`Conversation updated`, { conversationId, userId });

    return conversation;
  }

  /**
   * Add participant to conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} newParticipantId - User ID to add
   * @param {string} userId - Current user ID (for permission check)
   * @param {string} role - Participant role
   * @returns {Promise<Object>} Participant and conversation info
   */
  async addParticipant(conversationId, newParticipantId, userId, role = 'member') {
    // Check if current user is participant
    const isParticipant = await ChatRepository.isParticipant(conversationId, userId);
    if (!isParticipant) {
      throw new AuthorizationError('You are not a participant of this conversation');
    }

    // Check if conversation is group type
    const conversation = await ChatRepository.findConversationById(conversationId);
    if (conversation.type !== 'group') {
      throw new ValidationError('Can only add participants to group conversations');
    }

    // Validate new participant exists
    const newParticipant = await UserRepository.findById(newParticipantId);
    if (!newParticipant) {
      throw new NotFoundError('User not found');
    }

    const participant = await ChatRepository.addParticipant(conversationId, newParticipantId, role);

    logger.info(`Participant added to conversation`, { conversationId, newParticipantId, userId });

    return {
      participant,
      conversation,
      addedUser: newParticipant
    };
  }

  /**
   * Remove participant from conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} participantId - User ID to remove
   * @param {string} userId - Current user ID (for permission check)
   * @returns {Promise<void>}
   */
  async removeParticipant(conversationId, participantId, userId) {
    // Users can only remove themselves
    if (participantId !== userId) {
      throw new AuthorizationError('You can only remove yourself from conversations');
    }

    await ChatRepository.removeParticipant(conversationId, participantId);

    logger.info(`Participant removed from conversation`, { conversationId, participantId });
  }

  /**
   * Update participant settings
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @param {Object} settings - Settings to update
   * @returns {Promise<Object>} Updated settings
   */
  async updateParticipantSettings(conversationId, userId, settings) {
    const participant = await ChatRepository.updateParticipantSettings(conversationId, userId, settings);

    logger.info(`Participant settings updated`, { conversationId, userId });

    return participant;
  }

  /**
   * Search conversations for a user
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Matching conversations
   */
  async searchConversations(userId, query, options = {}) {
    if (!query || query.trim().length === 0) {
      throw new ValidationError('Search query is required');
    }

    const conversations = await ChatRepository.searchConversations(userId, query.trim(), options);

    return conversations;
  }

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Get messages for a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID (for permission check)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Messages
   */
  async getMessages(conversationId, userId, options = {}) {
    // Get conversation to check if it's public
    const conversation = await ChatRepository.findConversationById(conversationId);

    logger.info(`getMessages - Conversation type: "${conversation.type}" for ID: ${conversationId}`);

    // Public channels are accessible to everyone
    if (conversation.type !== 'public') {
      logger.info(`Checking participant status for private conversation`);
      // Check if user is participant for private conversations
      const isParticipant = await ChatRepository.isParticipant(conversationId, userId);
      if (!isParticipant) {
        throw new AuthorizationError('You are not a participant of this conversation');
      }
    } else {
      logger.info(`Public channel - skipping participant check`);
    }

    const messages = await ChatRepository.findMessagesByConversationId(conversationId, options);

    return messages;
  }

  /**
   * Send a message
   * @param {string} conversationId - Conversation ID
   * @param {Object} messageData - Message data
   * @param {string} userId - Sender user ID
   * @returns {Promise<Object>} Created message
   */
  async sendMessage(conversationId, messageData, userId) {
    // Get conversation to check if it's public
    const conversation = await ChatRepository.findConversationById(conversationId);

    // Public channels are accessible to everyone
    if (conversation.type !== 'public') {
      // Check if user is participant for private conversations
      const isParticipant = await ChatRepository.isParticipant(conversationId, userId);
      if (!isParticipant) {
        throw new AuthorizationError('You are not a participant of this conversation');
      }
    }

    // Validate content
    const { content, messageType = 'text', replyToMessageId } = messageData;

    if (!content || content.trim().length === 0) {
      throw new ValidationError('Message content cannot be empty');
    }

    const message = await ChatRepository.createMessage({
      conversationId,
      senderId: userId,
      content: content.trim(),
      messageType,
      replyToMessageId: replyToMessageId || null
    });

    logger.info(`Message sent`, { messageId: message.id, conversationId, userId });

    return message;
  }

  /**
   * Update a message
   * @param {string} messageId - Message ID
   * @param {string} content - New content
   * @param {string} userId - User ID (for permission check)
   * @returns {Promise<Object>} Updated message
   */
  async updateMessage(messageId, content, userId) {
    // Get message to check ownership
    const originalMessage = await ChatRepository.findMessageById(messageId);

    if (originalMessage.sender_id !== userId) {
      throw new AuthorizationError('You can only edit your own messages');
    }

    if (!content || content.trim().length === 0) {
      throw new ValidationError('Message content cannot be empty');
    }

    const message = await ChatRepository.updateMessage(messageId, content.trim());

    logger.info(`Message updated`, { messageId, userId });

    return message;
  }

  /**
   * Delete a message
   * @param {string} messageId - Message ID
   * @param {string} userId - User ID (for permission check)
   * @returns {Promise<void>}
   */
  async deleteMessage(messageId, userId) {
    // Get message to check ownership
    const originalMessage = await ChatRepository.findMessageById(messageId);

    if (originalMessage.sender_id !== userId) {
      throw new AuthorizationError('You can only delete your own messages');
    }

    await ChatRepository.deleteMessage(messageId);

    logger.info(`Message deleted`, { messageId, userId });
  }

  /**
   * Add reaction to message
   * @param {string} messageId - Message ID
   * @param {string} userId - User ID
   * @param {string} emoji - Emoji
   * @returns {Promise<Object>} Reaction
   */
  async addReaction(messageId, userId, emoji) {
    if (!emoji || emoji.trim().length === 0) {
      throw new ValidationError('Emoji is required');
    }

    // Verify message exists
    await ChatRepository.findMessageById(messageId);

    const reaction = await ChatRepository.addReaction(messageId, userId, emoji.trim());

    logger.info(`Reaction added to message`, { messageId, userId, emoji });

    return reaction;
  }

  /**
   * Remove reaction from message
   * @param {string} messageId - Message ID
   * @param {string} userId - User ID
   * @param {string} emoji - Emoji
   * @returns {Promise<void>}
   */
  async removeReaction(messageId, userId, emoji) {
    await ChatRepository.removeReaction(messageId, userId, emoji);

    logger.info(`Reaction removed from message`, { messageId, userId, emoji });
  }

  /**
   * Mark conversation as read
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result
   */
  async markAsRead(conversationId, userId) {
    // Get conversation to check if it's public
    const conversation = await ChatRepository.findConversationById(conversationId);

    logger.info(`markAsRead - Conversation type: "${conversation.type}" for ID: ${conversationId}`);

    // Public channels are accessible to everyone
    if (conversation.type !== 'public') {
      logger.info(`Checking participant status for private conversation`);
      // Check if user is participant for private conversations
      const isParticipant = await ChatRepository.isParticipant(conversationId, userId);
      if (!isParticipant) {
        throw new AuthorizationError('You are not a participant of this conversation');
      }
    } else {
      logger.info(`Public channel - skipping participant check for markAsRead`);
    }

    const result = await ChatRepository.markConversationAsRead(conversationId, userId);

    logger.info(`Conversation marked as read`, { conversationId, userId });

    return result;
  }

  /**
   * Search messages in a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} query - Search query
   * @param {string} userId - User ID (for permission check)
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Matching messages
   */
  async searchMessages(conversationId, query, userId, options = {}) {
    if (!query || query.trim().length === 0) {
      throw new ValidationError('Search query is required');
    }

    // Get conversation to check if it's public
    const conversation = await ChatRepository.findConversationById(conversationId);

    // Public channels are accessible to everyone
    if (conversation.type !== 'public') {
      // Check if user is participant for private conversations
      const isParticipant = await ChatRepository.isParticipant(conversationId, userId);
      if (!isParticipant) {
        throw new AuthorizationError('You are not a participant of this conversation');
      }
    }

    const messages = await ChatRepository.searchMessages(conversationId, query.trim(), options);

    return messages;
  }

  /**
   * Get media from conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID (for permission check)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Media messages
   */
  async getMedia(conversationId, userId, options = {}) {
    // Get conversation to check if it's public
    const conversation = await ChatRepository.findConversationById(conversationId);

    // Public channels are accessible to everyone
    if (conversation.type !== 'public') {
      // Check if user is participant for private conversations
      const isParticipant = await ChatRepository.isParticipant(conversationId, userId);
      if (!isParticipant) {
        throw new AuthorizationError('You are not a participant of this conversation');
      }
    }

    const media = await ChatRepository.getMedia(conversationId, options);

    return media;
  }
}

module.exports = new ChatService();
