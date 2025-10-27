/**
 * Authentication Controller
 * Professional controller using service layer and proper error handling
 */

const authService = require('../services/authService');
const userService = require('../services/userService');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');
const { asyncHandler } = require('../utils/helpers');
const { HTTP_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

class AuthController {
  /**
   * Register new user
   * POST /api/auth/register
   */
  register = asyncHandler(async (req, res) => {
    const { email, password, username, full_name, role } = req.body;

    const result = await authService.register({
      email,
      password,
      username,
      full_name,
      role
    });

    sendCreated(res, result, 'Registration successful');
  });

  /**
   * Login user
   * POST /api/auth/login
   */
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const result = await authService.login(email, password);

    sendSuccess(res, HTTP_STATUS.OK, result, 'Login successful');
  });

  /**
   * Google OAuth callback
   * GET /api/auth/google/callback
   */
  googleCallback = asyncHandler(async (req, res) => {
    // req.user is already populated by passport strategy with the User model
    const user = req.user;

    if (!user) {
      logger.warn('Google OAuth callback - no user found');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/auth/callback?error=no_user`);
    }

    logger.info('Google OAuth successful', { userId: user.id, email: user.email });

    // Generate tokens for the authenticated user
    const token = authService.generateAccessToken(user);
    const refreshToken = authService.generateRefreshToken(user);

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}&refreshToken=${refreshToken}`);
  });

  /**
   * Verify JWT token
   * GET /api/auth/verify
   */
  verifyToken = asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return sendError(res, { message: 'No token provided' }, HTTP_STATUS.UNAUTHORIZED);
    }

    const user = await authService.verifyToken(token);

    sendSuccess(res, HTTP_STATUS.OK, { user, valid: true }, 'Token is valid');
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendError(res, { message: 'Refresh token required' }, HTTP_STATUS.BAD_REQUEST);
    }

    const result = await authService.refreshToken(refreshToken);

    sendSuccess(res, HTTP_STATUS.OK, result, 'Token refreshed successfully');
  });

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    await authService.forgotPassword(email);

    sendSuccess(res, HTTP_STATUS.OK, null, 'Password reset email sent if account exists');
  });

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    await authService.resetPassword(token, newPassword);

    sendSuccess(res, HTTP_STATUS.OK, null, 'Password reset successful');
  });

  /**
   * Change password (authenticated)
   * POST /api/auth/change-password
   */
  changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    await authService.changePassword(userId, currentPassword, newPassword);

    sendSuccess(res, HTTP_STATUS.OK, null, 'Password changed successfully');
  });

  /**
   * Send verification email
   * POST /api/auth/send-verification
   */
  sendVerificationEmail = asyncHandler(async (req, res) => {
    const { email } = req.body;

    await authService.sendVerificationEmail(email);

    sendSuccess(res, HTTP_STATUS.OK, null, 'Verification email sent');
  });

  /**
   * Verify email with code
   * POST /api/auth/verify-email
   */
  verifyEmail = asyncHandler(async (req, res) => {
    const { email, code } = req.body;

    const user = await authService.verifyEmail(email, code);

    sendSuccess(res, HTTP_STATUS.OK, { user }, 'Email verified successfully');
  });

  /**
   * Resend verification code
   * POST /api/auth/resend-verification
   */
  resendVerification = asyncHandler(async (req, res) => {
    const { email } = req.body;

    await authService.sendVerificationEmail(email);

    sendSuccess(res, HTTP_STATUS.OK, null, 'Verification code sent successfully');
  });

  /**
   * Restore deleted account
   * POST /api/auth/restore-account
   */
  restoreAccount = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const result = await authService.restoreAccount(email);

    sendSuccess(res, HTTP_STATUS.OK, result, result.message);
  });

  /**
   * Check account deletion status
   * POST /api/auth/check-deletion-status
   */
  checkDeletionStatus = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const status = await authService.checkDeletionStatus(email);

    sendSuccess(res, HTTP_STATUS.OK, status, 'Deletion status retrieved');
  });

  /**
   * Logout user
   * POST /api/auth/logout
   */
  logout = asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    await authService.logout(token);

    sendSuccess(res, HTTP_STATUS.OK, null, 'Logged out successfully');
  });

  /**
   * Get current user
   * GET /api/auth/me
   */
  getCurrentUser = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Fetch full user profile from database
    const user = await userService.getUserById(userId);

    sendSuccess(res, HTTP_STATUS.OK, { user }, 'User retrieved successfully');
  });
}

module.exports = new AuthController();
