/**
 * Socket.IO Service for Real-time Chat
 * 
 * Handles WebSocket connections and real-time message events
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

class SocketService {
  constructor(io) {
    this.io = io;
    this.userSockets = new Map(); // Map of userId -> Set of socket IDs
  }

  /**
   * Initialize Socket.IO with authentication middleware
   */
  initialize() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          logger.warn('❌ Socket connection rejected - no token provided');
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

        logger.info('🔐 JWT decoded:', {
          decoded,
          userId: decoded.id,
          username: decoded.username
        });

        socket.userId = decoded.id || decoded.userId;  // Try both field names
        socket.user = decoded;

        if (!socket.userId) {
          logger.error('❌ No user ID in JWT token', { decoded });
          return next(new Error('Invalid token - no user ID'));
        }

        next();
      } catch (error) {
        logger.error('❌ Socket authentication failed', { error: error.message });
        next(new Error('Authentication failed'));
      }
    });

    // Handle connections
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('Socket.IO service initialized');
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const userId = socket.userId;

    logger.info(`🔌 User connected via Socket.IO: ${userId}`, {
      socketId: socket.id,
      username: socket.user?.username
    });

    // Track user's socket
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socket.id);

    // Emit online status to user's conversations
    this.broadcastUserStatus(userId, true);

    // Join user's conversation rooms
    this.joinUserConversations(socket, userId);

    // Automatically join public channel
    socket.join('public-channel');
    logger.info(`User ${userId} auto-joined public channel`);

    // Register event handlers
    this.registerEventHandlers(socket);

    // Handle disconnect
    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });
  }

  /**
   * Register all socket event handlers
   */
  registerEventHandlers(socket) {
    socket.on('chat:join_conversation', (data) => this.handleJoinConversation(socket, data));
    socket.on('chat:leave_conversation', (data) => this.handleLeaveConversation(socket, data));
    socket.on('chat:send_message', (data) => this.handleSendMessage(socket, data));
    socket.on('chat:typing', (data) => this.handleTyping(socket, data));
    socket.on('chat:stop_typing', (data) => this.handleStopTyping(socket, data));
    socket.on('chat:mark_read', (data) => this.handleMarkRead(socket, data));
    socket.on('chat:add_reaction', (data) => this.handleAddReaction(socket, data));
    socket.on('chat:remove_reaction', (data) => this.handleRemoveReaction(socket, data));
  }

  /**
   * Join user to all their conversation rooms
   */
  async joinUserConversations(socket, userId) {
    try {
      const conversations = await Conversation.findByUserId(userId);

      conversations.forEach(conv => {
        const roomName = `conversation:${conv.id}`;
        socket.join(roomName);
      });

      logger.info(`User ${userId} joined ${conversations.length} conversations`);
    } catch (error) {
      logger.error('Error joining user conversations', {
        error: error.message,
        userId
      });
    }
  }

  /**
   * Handle user joining a specific conversation
   */
  async handleJoinConversation(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      // Verify user is participant
      const isParticipant = await Conversation.isParticipant(conversationId, userId);
      if (!isParticipant) {
        socket.emit('error', { message: 'You are not a participant of this conversation' });
        return;
      }

      const roomName = `conversation:${conversationId}`;
      socket.join(roomName);

      logger.info(`User ${userId} joined conversation ${conversationId}`);
    } catch (error) {
      logger.error('Error joining conversation', { error: error.message });
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  }

  /**
   * Handle user leaving a conversation
   */
  handleLeaveConversation(socket, data) {
    const { conversationId } = data;
    const roomName = `conversation:${conversationId}`;
    socket.leave(roomName);

    logger.info(`User ${socket.userId} left conversation ${conversationId}`);
  }

  /**
   * Handle sending a message via Socket.IO
   */
  async handleSendMessage(socket, data) {
    try {
      logger.info('📥 Received chat:send_message event', {
        userId: socket.userId,
        conversationId: data.conversationId,
        contentLength: data.content?.length
      });

      const { conversationId, content, messageType = 'text', replyToMessageId } = data;
      const userId = socket.userId;

      // Verify user is participant
      const isParticipant = await Conversation.isParticipant(conversationId, userId);
      if (!isParticipant) {
        logger.warn('User not participant in conversation', { userId, conversationId });
        socket.emit('error', { message: 'You are not a participant of this conversation' });
        return;
      }

      logger.info('✅ User is participant, creating message...');

      // Create message
      const message = await Message.create({
        conversationId,
        senderId: userId,
        content: content.trim(),
        messageType,
        replyToMessageId: replyToMessageId || null
      });

      logger.info('✅ Message created in database', { messageId: message.id });

      // Broadcast to all participants in the conversation
      const roomName = `conversation:${conversationId}`;
      this.io.to(roomName).emit('chat:new_message', {
        conversationId,
        message
      });

      logger.info(`📤 Message broadcast to room ${roomName}`, {
        messageId: message.id,
        userId,
        roomClients: this.io.sockets.adapter.rooms.get(roomName)?.size || 0
      });
    } catch (error) {
      logger.error('❌ Error sending message', {
        error: error.message,
        stack: error.stack,
        data
      });
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  /**
   * Handle typing indicator
   */
  handleTyping(socket, data) {
    const { conversationId } = data;
    const userId = socket.userId;
    const username = socket.user.username;

    const roomName = `conversation:${conversationId}`;

    // Broadcast to others in the conversation (not sender)
    socket.to(roomName).emit('chat:user_typing', {
      conversationId,
      userId,
      username
    });
  }

  /**
   * Handle stop typing indicator
   */
  handleStopTyping(socket, data) {
    const { conversationId } = data;
    const userId = socket.userId;

    const roomName = `conversation:${conversationId}`;

    socket.to(roomName).emit('chat:user_stop_typing', {
      conversationId,
      userId
    });
  }

  /**
   * Handle marking messages as read
   */
  async handleMarkRead(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      // Mark messages as read
      await Message.markConversationAsRead(conversationId, userId);

      // Broadcast to conversation participants
      const roomName = `conversation:${conversationId}`;
      socket.to(roomName).emit('chat:messages_read', {
        conversationId,
        userId
      });
    } catch (error) {
      logger.error('Error marking messages as read', { error: error.message });
    }
  }

  /**
   * Handle adding reaction
   */
  async handleAddReaction(socket, data) {
    try {
      const { messageId, emoji, conversationId } = data;
      const userId = socket.userId;

      const reaction = await Message.addReaction(messageId, userId, emoji);

      // Broadcast to conversation participants
      const roomName = `conversation:${conversationId}`;
      this.io.to(roomName).emit('chat:reaction_added', {
        messageId,
        conversationId,
        reaction: {
          ...reaction,
          username: socket.user.username
        }
      });
    } catch (error) {
      logger.error('Error adding reaction', { error: error.message });
      socket.emit('error', { message: 'Failed to add reaction' });
    }
  }

  /**
   * Handle removing reaction
   */
  async handleRemoveReaction(socket, data) {
    try {
      const { messageId, emoji, conversationId } = data;
      const userId = socket.userId;

      await Message.removeReaction(messageId, userId, emoji);

      // Broadcast to conversation participants
      const roomName = `conversation:${conversationId}`;
      this.io.to(roomName).emit('chat:reaction_removed', {
        messageId,
        conversationId,
        userId,
        emoji
      });
    } catch (error) {
      logger.error('Error removing reaction', { error: error.message });
      socket.emit('error', { message: 'Failed to remove reaction' });
    }
  }

  /**
   * Handle socket disconnect
   */
  handleDisconnect(socket) {
    const userId = socket.userId;

    logger.info(`User disconnected: ${userId}`, { socketId: socket.id });

    // Remove socket from user's socket set
    if (this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(socket.id);

      // If user has no more active sockets, mark as offline
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
        this.broadcastUserStatus(userId, false);
      }
    }
  }

  /**
   * Broadcast user online/offline status to their conversations
   */
  async broadcastUserStatus(userId, isOnline) {
    try {
      const conversations = await Conversation.findByUserId(userId);

      conversations.forEach(conv => {
        const roomName = `conversation:${conv.id}`;
        this.io.to(roomName).emit('chat:user_status', {
          userId,
          isOnline,
          conversationId: conv.id
        });
      });
    } catch (error) {
      logger.error('Error broadcasting user status', { error: error.message });
    }
  }

  /**
   * Send notification to specific user
   */
  sendToUser(userId, event, data) {
    const userSocketIds = this.userSockets.get(userId);

    if (userSocketIds) {
      userSocketIds.forEach(socketId => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  /**
   * Emit notification to a specific user
   */
  emitNotification(userId, notificationData) {
    logger.info(`📢 Emitting notification to user ${userId}`, { notificationData });
    this.sendToUser(userId, 'notification:new', notificationData);
  }

  /**
   * Broadcast event to conversation room
   */
  broadcastToConversation(conversationId, event, data) {
    const roomName = `conversation:${conversationId}`;
    this.io.to(roomName).emit(event, data);
  }

}

module.exports = SocketService;
