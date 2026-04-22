/**
 * Authentication Service
 * Handles all authentication-related business logic
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const UserRepository = require('../repositories/UserRepository');
const emailService = require('./emailService');
const { env: config, features } = require('../config');
const logger = require('../utils/logger');
const { generateVerificationCode } = require('../utils/helpers');
const {
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError
} = require('../utils');

// Constants
const GRACE_PERIOD_DAYS = 30;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

class AuthService {
  /**
   * Calculate deletion grace period information
   * @private
   */
  _calculateGracePeriod(deletedAt, accountStatus) {
    const deletedDate = new Date(deletedAt);
    const now = new Date();
    const timeElapsed = now - deletedDate;
    const daysElapsed = Math.floor(timeElapsed / (24 * 60 * 60 * 1000));
    const daysRemaining = GRACE_PERIOD_DAYS - daysElapsed;
    const canRestore = timeElapsed <= GRACE_PERIOD_MS && accountStatus !== 'anonymized';

    const message = canRestore
      ? `This account was deleted ${daysElapsed} ${daysElapsed === 1 ? 'day' : 'days'} ago. You have ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} to restore it.`
      : 'This account has been permanently deleted. Please create a new account.';

    return {
      canRestore,
      daysElapsed,
      daysRemaining: canRestore ? daysRemaining : 0,
      message
    };
  }

  /**
   * Generate authentication tokens for user
   * @private
   */
  _generateAuthTokens(user) {
    const token = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    return { token, refreshToken };
  }

  /**
   * Check if account is deleted and throw appropriate error
   * @private
   */
  _checkDeletedAccount(deletedUser, email) {
    const gracePeriod = this._calculateGracePeriod(
      deletedUser.deleted_at,
      deletedUser.account_status
    );

    logger.warn('Login attempt with deleted account', {
      email,
      ...gracePeriod
    });

    throw new AuthenticationError(gracePeriod.message, {
      accountDeleted: true,
      email,
      ...gracePeriod
    });
  }
  /**
   * Register a new user
   */
  async register(userData) {
    const { email, password, username, full_name, role = 'user' } = userData;

    // Check if user already exists
    const existingUser = await UserRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('User with this email already exists', {
        field: 'email',
        value: email
      });
    }

    // Check username if provided
    if (username) {
      const existingUsername = await UserRepository.findByUsername(username);
      if (existingUsername) {
        throw new ConflictError('Username is already taken', {
          field: 'username',
          value: username
        });
      }
    }

    // Create user
    const user = await UserRepository.create({
      email,
      password,
      username,
      full_name,
      role,
      email_verified: false
    });

    // Send verification email
    if (features.emailVerification) {
      try {
        await this.sendVerificationEmail(email);
        logger.info('Verification email sent', { email, userId: user.id });
      } catch (error) {
        logger.error('Failed to send verification email', {
          error: error.message,
          email,
          userId: user.id
        });
        // Don't fail registration if email fails
      }
    }

    // Generate tokens
    const { token, refreshToken } = this._generateAuthTokens(user);

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      role: user.role
    });

    return {
      user,
      token,
      refreshToken
    };
  }

  /**
   * Login user with email and password
   */
  async login(email, password) {
    // Find user (including deleted accounts)
    let user = await UserRepository.findByEmail(email);

    // If not found in active accounts, check deleted accounts
    if (!user) {
      const deletedUser = await UserRepository.findDeletedByEmail(email);

      if (deletedUser) {
        this._checkDeletedAccount(deletedUser, email);
      }

      // Account truly doesn't exist
      logger.warn('Login attempt with non-existent email', { email });
      throw new AuthenticationError('No account found with this email address', {
        accountNotFound: true,
        email
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.warn('Login attempt with incorrect password', { email });
      throw new AuthenticationError('Incorrect password. Please try again.', {
        incorrectPassword: true,
        email
      });
    }

    // Double-check if account is deleted (safety check)
    if (user.deleted_at) {
      this._checkDeletedAccount(user, email);
    }

    // Check if account is active
    if (!user.is_active) {
      throw new AuthenticationError('Your account has been deactivated', {
        accountDeactivated: true
      });
    }

    // Check email verification
    if (features.emailVerification && !user.email_verified) {
      throw new AuthenticationError('Please verify your email address', {
        requiresVerification: true,
        email: user.email
      });
    }

    // Update last login
    await UserRepository.updateLastLogin(user.id);

    // Generate tokens
    const { token, refreshToken } = this._generateAuthTokens(user);

    // Remove password from response
    delete user.password;

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email
    });

    return {
      user,
      token,
      refreshToken
    };
  }

  /**
   * Google OAuth authentication
   */
  async googleAuth(profile) {
    const { id: googleId, emails, displayName, photos } = profile;
    const email = emails[0].value;
    const profilePhotoUrl = photos && photos[0] ? photos[0].value : null;

    // Check if user exists
    let user = await UserRepository.findByGoogleId(googleId);

    if (!user) {
      // Check if email already exists
      const existingUser = await UserRepository.findByEmail(email);
      if (existingUser) {
        throw new ConflictError('Email already registered with password login', {
          email,
          suggestion: 'Please login with your password instead'
        });
      }

      // Create new user
      user = await UserRepository.create({
        email,
        username: null,
        full_name: displayName,
        google_id: googleId,
        oauth_provider: 'google',
        profile_photo_url: profilePhotoUrl,
        email_verified: true,
        password: null
      });

      logger.info('New user created via Google OAuth', {
        userId: user.id,email
      });
    } else {
      // Update last login
      await UserRepository.updateLastLogin(user.id);

      logger.info('User logged in via Google OAuth', {
        userId: user.id,
        email
      });
    }

    // Generate tokens using helper
    const { token, refreshToken } = this._generateAuthTokens(user);

    return {
      user,
      token,
      refreshToken
    };
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);

      // Get user
      const user = await UserRepository.findById(decoded.userId);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      if (!user.is_active) {
        throw new AuthenticationError('Account is deactivated');
      }

      return user;
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid token');
      }
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token has expired');
      }
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, config.JWT_SECRET);

      const user = await UserRepository.findById(decoded.userId);
      if (!user || !user.is_active) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Generate new tokens using helper
      const tokens = this._generateAuthTokens(user);

      return tokens;
    } catch (error) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(email) {
    const code = generateVerificationCode(6);

    // Store verification code in database with 10 minute expiry
    await UserRepository.storeVerificationCode(email, code, 10);

    // Send verification code via email
    await emailService.sendVerificationCode(email, code);

    logger.info('Verification email sent', { email });
    return true;
  }

  /**
   * Verify email with code
   */
  async verifyEmail(email, code) {
    // Verify code from database
    const user = await UserRepository.verifyEmailWithCode(email, code);

    logger.info('Email verified successfully', { email, userId: user.id });
    return user;
  }

  /**
   * Request password reset
   */
  async forgotPassword(email) {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      logger.warn('Password reset requested for non-existent email', { email });
      return true;
    }

    // Generate reset token
    const resetToken = this.generatePasswordResetToken(user);

    // Generate reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    // Send reset email
    await emailService.sendPasswordReset(email, resetToken, resetUrl);

    logger.info('Password reset email sent', { email, userId: user.id });
    return true;
  }

  /**
   * Reset password with token
   */
  async resetPassword(token, newPassword) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);

      const user = await UserRepository.findById(decoded.userId);
      if (!user) {
        throw new AuthenticationError('Invalid reset token');
      }

      // Update password
      await UserRepository.updatePassword(user.id, newPassword);

      logger.info('Password reset successfully', { userId: user.id });
      return true;
    } catch (error) {
      throw new AuthenticationError('Invalid or expired reset token');
    }
  }

  /**
   * Change password (authenticated user)
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await UserRepository.findByEmail(
      (await UserRepository.findById(userId)).email
    );

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Update password
    await UserRepository.updatePassword(userId, newPassword);

    logger.info('Password changed successfully', { userId });
    return true;
  }

  /**
   * Generate access token
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        role: user.role
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRE }
    );
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        type: 'refresh'
      },
      config.JWT_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN || '30d' }
    );
  }

  /**
   * Generate password reset token
   */
  generatePasswordResetToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        type: 'reset',
        timestamp: Date.now()
      },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }

  /**
   * Restore deleted account
   * 30-day grace period for account restoration
   */
  async restoreAccount(email) {
    // Find deleted account
    const deletedUser = await UserRepository.findDeletedByEmail(email);

    if (!deletedUser) {
      throw new NotFoundError('No deleted account found with this email address');
    }

    // Check if account is anonymized (cannot be restored)
    if (deletedUser.account_status === 'anonymized') {
      throw new ValidationError('This account has been permanently deleted and cannot be restored. Please create a new account.');
    }

    // Check grace period
    const gracePeriod = this._calculateGracePeriod(
      deletedUser.deleted_at,
      deletedUser.account_status
    );

    if (!gracePeriod.canRestore) {
      throw new ValidationError(
        `Account deletion is permanent. The grace period of ${GRACE_PERIOD_DAYS} days has expired. Please create a new account.`,
        {
          gracePeriodExpired: true,
          daysExpired: gracePeriod.daysElapsed - GRACE_PERIOD_DAYS
        }
      );
    }

    // Restore account
    const restoredUser = await UserRepository.restore(email);

    logger.info('Account restored successfully', {
      userId: restoredUser.id,
      email: restoredUser.email,
      daysSinceDeletion: gracePeriod.daysElapsed
    });

    // Generate tokens
    const { token, refreshToken } = this._generateAuthTokens(restoredUser);

    return {
      user: restoredUser,
      token,
      refreshToken,
      message: `Welcome back! Your account has been successfully restored.`,
      daysRemaining: gracePeriod.daysRemaining
    };
  }

  /**
   * Check account deletion status
   * Returns info about deleted account and grace period
   */
  async checkDeletionStatus(email) {
    const deletedUser = await UserRepository.findDeletedByEmail(email);

    if (!deletedUser) {
      return {
        isDeleted: false
      };
    }

    const gracePeriod = this._calculateGracePeriod(
      deletedUser.deleted_at,
      deletedUser.account_status
    );

    return {
      isDeleted: true,
      deletedAt: deletedUser.deleted_at,
      accountStatus: deletedUser.account_status,
      canRestore: gracePeriod.canRestore,
      daysElapsed: gracePeriod.daysElapsed,
      daysRemaining: gracePeriod.daysRemaining,
      gracePeriodDays: GRACE_PERIOD_DAYS
    };
  }

  /**
   * Logout (invalidate token - requires token blacklist implementation)
   */
  async logout(token) {
    // TODO: Implement token blacklist
    logger.info('User logged out');
    return true;
  }
}

module.exports = new AuthService();