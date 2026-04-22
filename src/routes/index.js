/**
 * Consolidated Routes Index
 * Central route registration for the application
 */

const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const userRoutes = require('./users');
const discussionRoutes = require('./discussions');
const answerRoutes = require('./answers');
const adminRoutes = require('./admin');
const notificationRoutes = require('./notifications');
const messageRoutes = require('./messages');

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

// Auth routes - /lisudictionary.com/auth
router.use('/auth', authRoutes);

// User routes - /lisudictionary.com/users
router.use('/users', userRoutes);

// Discussion routes - /lisudictionary.com/discussions
router.use('/discussions', discussionRoutes);

// Answer routes - /lisudictionary.com/answers
router.use('/answers', answerRoutes);

// Admin routes - /lisudictionary.com/admin
router.use('/admin', adminRoutes);

// Notification routes - /api/notifications
router.use('/notifications', notificationRoutes);

// Message routes - /api/messages
router.use('/messages', messageRoutes);

// =============================================================================
// HEALTH CHECK ROUTE
// =============================================================================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// =============================================================================
// API INFO ROUTE
// =============================================================================

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'DevForum API',
    version: '1.0.0',
    endpoints: {
      auth: '/lisudictionary.com/auth',
      users: '/lisudictionary.com/users',
      discussions: '/lisudictionary.com/discussions',
      answers: '/lisudictionary.com/answers',
      admin: '/lisudictionary.com/admin',
      health: '/api/health'
    }
  });
});

module.exports = router;