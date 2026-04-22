const express = require('express');
const router = express.Router();
const { getConversations, getOrCreateConversation, getMessages, sendMessage, deleteMessage } = require('../controllers/messageController');
const { authenticate } = require('../middlewares');

// All routes require authentication
router.use(authenticate);

// GET /api/messages/conversations
router.get('/conversations', getConversations);

// GET /api/messages/conversations/:userId
router.get('/conversations/:userId', getOrCreateConversation);

// GET /api/messages/:conversationId
router.get('/:conversationId', getMessages);

// POST /api/messages/:conversationId
router.post('/:conversationId', sendMessage);

// DELETE /api/messages/message/:messageId
router.delete('/message/:messageId', deleteMessage);

module.exports = router;
