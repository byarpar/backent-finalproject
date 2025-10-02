const express = require('express');
const AuthController = require('../controllers/authController');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();

// Register new user
router.post('/register',
  AuthController.register
);

// Login user
router.post('/login',
  AuthController.login
);

// Get current user profile
router.get('/profile', authenticateToken, AuthController.getProfile);

// Update user profile
router.put('/profile', authenticateToken, AuthController.updateProfile);

// Update dark mode preference
router.put('/dark-mode', authenticateToken, AuthController.updateDarkModePreference);

// Update password
// Change password
router.put('/change-password', authenticateToken, AuthController.changePassword);

// Verify token
router.get('/verify', authenticateToken, AuthController.verifyToken);

module.exports = router;
