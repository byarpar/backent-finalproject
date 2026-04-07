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

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

// Auth routes - /api/auth
router.use('/auth', authRoutes);

// User routes - /api/users
router.use('/users', userRoutes);

// Discussion routes - /api/discussions
router.use('/discussions', discussionRoutes);

// Answer routes - /api/answers
router.use('/answers', answerRoutes);

// Admin routes - /api/admin
router.use('/admin', adminRoutes);

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
      auth: '/api/auth',
      users: '/api/users',
      discussions: '/api/discussions',
      answers: '/api/answers',
      admin: '/api/admin',
      health: '/api/health'
    }
  });
});

module.exports = router;