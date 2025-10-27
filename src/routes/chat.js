/**
 * Chat Routes
 * 
 * Handles routing for chat API endpoints
 */

const express = require('express');
const router = express.Router();
const ChatController = require('../controllers/chatController');
const { authenticate } = require('../middlewares/auth');
const { validate, schemas } = require('../validations/schemas');

// ============================================
// All chat routes require authentication
// ============================================

router.use(authenticate);

// ============================================
// Conversation Routes
// ============================================

/**
 * @route   GET /api/chat/conversations
 * @desc    Get all conversations for current user
 * @access  Private
 */
router.get('/conversations',
  validate(schemas.chat.listConversations, 'query'),
  ChatController.getConversations
);

/**
 * @route   POST /api/chat/conversations
 * @desc    Create new conversation
 * @access  Private
 */
router.post('/conversations',
  validate(schemas.chat.createConversation),
  ChatController.createConversation
);

/**
 * @route   GET /api/chat/conversations/:id
 * @desc    Get conversation by ID
 * @access  Private
 */
router.get('/conversations/:id',
  validate(schemas.common.params.id, 'params'),
  ChatController.getConversation
);

/**
 * @route   PUT /api/chat/conversations/:id
 * @desc    Update conversation details
 * @access  Private
 */
router.put('/conversations/:id',
  validate(schemas.common.params.id, 'params'),
  validate(schemas.chat.updateConversation),
  ChatController.updateConversation
);

/**
 * @route   POST /api/chat/conversations/:id/participants
 * @desc    Add participant to conversation
 * @access  Private
 */
router.post('/conversations/:id/participants',
  validate(schemas.common.params.id, 'params'),
  validate(schemas.chat.addParticipant),
  ChatController.addParticipant
);

/**
 * @route   DELETE /api/chat/conversations/:id/participants/:userId
 * @desc    Remove participant from conversation
 * @access  Private
 */
router.delete('/conversations/:id/participants/:userId',
  validate(schemas.chat.removeParticipant, 'params'),
  ChatController.removeParticipant
);

/**
 * @route   PUT /api/chat/conversations/:id/settings
 * @desc    Update participant settings (notifications, etc.)
 * @access  Private
 */
router.put('/conversations/:id/settings',
  validate(schemas.common.params.id, 'params'),
  validate(schemas.chat.updateSettings),
  ChatController.updateParticipantSettings
);

// ============================================
// Message Routes
// ============================================

/**
 * @route   GET /api/chat/conversations/:id/messages
 * @desc    Get messages in a conversation
 * @access  Private
 */
router.get('/conversations/:id/messages',
  validate(schemas.common.params.id, 'params'),
  validate(schemas.chat.listMessages, 'query'),
  ChatController.getMessages
);

/**
 * @route   POST /api/chat/conversations/:id/messages
 * @desc    Send message in conversation
 * @access  Private
 */
router.post('/conversations/:id/messages',
  validate(schemas.common.params.id, 'params'),
  validate(schemas.chat.sendMessage),
  ChatController.sendMessage
);

/**
 * @route   PUT /api/chat/messages/:messageId
 * @desc    Update/edit message
 * @access  Private
 */
router.put('/messages/:messageId',
  validate(schemas.chat.updateMessage, 'params'),
  validate(schemas.chat.messageContent),
  ChatController.updateMessage
);

/**
 * @route   DELETE /api/chat/messages/:messageId
 * @desc    Delete message
 * @access  Private
 */
router.delete('/messages/:messageId',
  validate(schemas.chat.deleteMessage, 'params'),
  ChatController.deleteMessage
);

// ============================================
// Message Reactions
// ============================================

/**
 * @route   POST /api/chat/messages/:messageId/reactions
 * @desc    Add reaction to message
 * @access  Private
 */
router.post('/messages/:messageId/reactions',
  validate(schemas.chat.addReaction, 'params'),
  validate(schemas.chat.reaction),
  ChatController.addReaction
);

/**
 * @route   DELETE /api/chat/messages/:messageId/reactions/:emoji
 * @desc    Remove reaction from message
 * @access  Private
 */
router.delete('/messages/:messageId/reactions/:emoji',
  validate(schemas.chat.removeReaction, 'params'),
  ChatController.removeReaction
);

// ============================================
// Read Receipts
// ============================================

/**
 * @route   POST /api/chat/conversations/:id/read
 * @desc    Mark conversation as read
 * @access  Private
 */
router.post('/conversations/:id/read',
  validate(schemas.common.params.id, 'params'),
  ChatController.markAsRead
);

// ============================================
// Search Routes
// ============================================

/**
 * @route   GET /api/chat/search
 * @desc    Search conversations
 * @access  Private
 */
router.get('/search',
  validate(schemas.chat.searchConversations, 'query'),
  ChatController.searchConversations
);

/**
 * @route   GET /api/chat/conversations/:id/search
 * @desc    Search messages in a conversation
 * @access  Private
 */
router.get('/conversations/:id/search',
  validate(schemas.common.params.id, 'params'),
  validate(schemas.chat.searchMessages, 'query'),
  ChatController.searchMessages
);

// ============================================
// Media Routes
// ============================================

/**
 * @route   GET /api/chat/conversations/:id/media
 * @desc    Get media files in conversation
 * @access  Private
 */
router.get('/conversations/:id/media',
  validate(schemas.common.params.id, 'params'),
  validate(schemas.chat.listMedia, 'query'),
  ChatController.getMedia
);

module.exports = router;
