const express = require('express');
const passport = require('passport');
const AuthController = require('../controllers/authController');
const authService = require('../services/authService');
const logger = require('../utils/logger');
const { authenticate } = require('../middlewares');
const { validate, schemas } = require('../validations/schemas');

const router = express.Router();

// ============================================
// Public Routes - No Authentication Required
// ============================================

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register',
  validate(schemas.auth.register),
  AuthController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user and get tokens
 * @access  Public
 */
router.post('/login',
  validate(schemas.auth.login),
  AuthController.login
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public
 */
router.post('/forgot-password',
  validate(schemas.auth.forgotPassword),
  AuthController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password',
  validate(schemas.auth.resetPassword),
  AuthController.resetPassword
);

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email address with token
 * @access  Public
 */
router.post('/verify-email',
  validate(schemas.auth.verifyEmail),
  AuthController.verifyEmail
);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend email verification code
 * @access  Public
 */
router.post('/resend-verification',
  validate(schemas.auth.resendVerification),
  AuthController.resendVerification
);

/**
 * @route   POST /api/auth/restore-account
 * @desc    Restore deleted account (within grace period)
 * @access  Public
 */
router.post('/restore-account',
  validate(schemas.auth.restoreAccount),
  AuthController.restoreAccount
);

/**
 * @route   POST /api/auth/check-deletion-status
 * @desc    Check if an email has a deleted account and restoration eligibility
 * @access  Public
 */
router.post('/check-deletion-status',
  validate(schemas.auth.checkDeletionStatus),
  AuthController.checkDeletionStatus
);

// ============================================
// Google OAuth Routes (Conditional)
// ============================================

// Only enable Google OAuth routes if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const verifyGoogleRecaptcha = async (req, res, next) => {
    try {
      await authService.verifyRecaptchaToken(req.query.recaptchaToken, req.ip);
      return next();
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: error.message || 'reCAPTCHA verification failed',
          code: 'RECAPTCHA_VERIFICATION_FAILED'
        }
      });
    }
  };

  /**
   * @route   GET /api/auth/google
   * @desc    Redirect to Google OAuth consent screen
   * @access  Public
   */
  router.get('/google',
    verifyGoogleRecaptcha,
    (req, res, next) => {
      const oauthIntent = req.query.mode === 'register' ? 'register' : 'login';
      return passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: oauthIntent
      })(req, res, next);
    }
  );

  /**
   * @route   GET /api/auth/google/callback
   * @desc    Google OAuth callback
   * @access  Public
   */
  router.get('/google/callback',
    (req, res, next) => {
      if (!req.query?.error) {
        return next();
      }

      const frontendUrl = process.env.FRONTEND_URL || 'https://finalproject-frontend.lisudictionar.com';
      const oauthError = encodeURIComponent(req.query.error);
      const oauthMessage = encodeURIComponent(req.query.error_description || 'Google OAuth returned an error');

      logger.warn('Google OAuth callback returned provider error', {
        error: req.query.error,
        errorDescription: req.query.error_description
      });

      return res.redirect(`${frontendUrl}/auth/callback?error=${oauthError}&message=${oauthMessage}`);
    },
    passport.authenticate('google', {
      session: false,
      failWithError: true
    }),
    AuthController.googleCallback,
    // Error handler for OAuth failures
    (err, req, res, next) => {
      const frontendUrl = process.env.FRONTEND_URL || 'https://finalproject-frontend.lisudictionar.com';

      logger.warn('Google OAuth callback authentication failure', {
        message: err?.message,
        code: err?.code,
        name: err?.name
      });

      // Check if account was deleted
      if (err.accountDeleted) {
        const errorType = err.canRestore ? 'account_deleted_restorable' : 'account_deleted_permanent';
        return res.redirect(`${frontendUrl}/auth/callback?error=${errorType}&message=${encodeURIComponent(err.message)}&email=${encodeURIComponent(err.email || '')}`);
      }

      // User attempted Google login without a registered account
      if (err.accountNotFound) {
        return res.redirect(`${frontendUrl}/auth/callback?error=account_not_found&message=${encodeURIComponent(err.message)}&email=${encodeURIComponent(err.email || '')}`);
      }

      const fallbackMessage = encodeURIComponent(err?.message || 'Google authentication failed. Please try again.');
      res.redirect(`${frontendUrl}/auth/callback?error=authentication_failed&message=${fallbackMessage}`);
    }
  );
} else {
  // Google OAuth is not configured - provide fallback routes that return errors
  router.get('/google', (req, res) => {
    res.status(503).json({
      success: false,
      error: {
        message: 'Google OAuth is not configured on this server',
        code: 'OAUTH_NOT_CONFIGURED'
      }
    });
  });

  router.get('/google/callback', (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'https://finalproject-frontend.lisudictionar.com';
    res.redirect(`${frontendUrl}/auth/callback?error=oauth_not_configured`);
  });
}

// ============================================
// Protected Routes - Authentication Required
// ============================================

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me',
  authenticate,
  AuthController.getCurrentUser
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Private
 */
router.post('/refresh',
  validate(schemas.auth.refreshToken),
  AuthController.refreshToken
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (invalidate tokens)
 * @access  Private
 */
router.post('/logout',
  authenticate,
  AuthController.logout
);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password',
  authenticate,
  validate(schemas.auth.changePassword),
  AuthController.changePassword
);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify if current token is valid
 * @access  Private
 */
router.get('/verify',
  authenticate,
  AuthController.verifyToken
);

module.exports = router;
