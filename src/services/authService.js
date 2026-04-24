/**
 * Authentication Service
 * Handles all authentication-related business logic
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const UserRepository = require('../repositories/UserRepository');
const emailService = require('./emailService');
const { env: config, features } = require('../config');
const { db } = require('../config/database');
const logger = require('../utils/logger');
const { generateVerificationCode } = require('../utils/helpers');
const {
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RateLimitError
} = require('../utils');

// Constants
const GRACE_PERIOD_DAYS = 30;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

// =============================================================================
// DB-BACKED LOGIN RATE LIMITER (mirrors Fail2Ban jail settings)
// =============================================================================
const MAX_ATTEMPTS = 5;               // matches Fail2Ban maxretry=5
const FIND_TIME_SECS = 10 * 60;         // matches Fail2Ban findtime=600  (seconds)
const BAN_DURATION_SECS = 60 * 60;       // matches Fail2Ban bantime=3600 (seconds)

class AuthService {
  // ---------------------------------------------------------------------------
  // Rate limiter helpers — DB-backed, persists across server restarts
  // ---------------------------------------------------------------------------

  /**
   * Throws RateLimitError if the IP is currently banned.
   * Automatically clears expired bans from the DB.
   */
  async _checkRateLimit(ipAddress) {
    if (!ipAddress) return;
    const { rows } = await db.query(
      `SELECT banned_until FROM login_attempts WHERE ip_address = $1`,
      [ipAddress]
    );
    if (!rows.length || !rows[0].banned_until) return;

    const bannedUntil = new Date(rows[0].banned_until).getTime();
    const now = Date.now();

    if (now < bannedUntil) {
      const retryAfter = Math.ceil((bannedUntil - now) / 1000);
      const minutes = Math.ceil(retryAfter / 60);
      throw new RateLimitError(
        `Too many failed login attempts. Please try again in ${minutes} minute(s).`,
        { retryAfter, bannedUntil }
      );
    }

    // Ban expired — clean up
    await db.query(`DELETE FROM login_attempts WHERE ip_address = $1`, [ipAddress]);
  }

  /**
   * Records a failed attempt in the DB.
   * Throws RateLimitError when MAX_ATTEMPTS is reached.
   * Returns remaining attempts.
   */
  async _recordFailedAttempt(ipAddress, email = null, attemptType = 'login') {
    if (!ipAddress) return null;

    // Upsert: reset window if first_fail_at is older than FIND_TIME_SECS
    const { rows } = await db.query(
      `INSERT INTO login_attempts (ip_address, attempt_count, first_fail_at, last_attempt_type, last_email, updated_at)
       VALUES ($1, 1, NOW(), $3, $4, NOW())
       ON CONFLICT (ip_address) DO UPDATE SET
         attempt_count = CASE
           WHEN login_attempts.first_fail_at < NOW() - ($2 || ' seconds')::INTERVAL
           THEN 1
           ELSE login_attempts.attempt_count + 1
         END,
         first_fail_at = CASE
           WHEN login_attempts.first_fail_at < NOW() - ($2 || ' seconds')::INTERVAL
           THEN NOW()
           ELSE login_attempts.first_fail_at
         END,
         last_attempt_type = $3,
         last_email        = $4,
         updated_at        = NOW()
       RETURNING attempt_count`,
      [ipAddress, FIND_TIME_SECS, attemptType, email]
    );

    const count = rows[0].attempt_count;
    const remaining = MAX_ATTEMPTS - count;

    // Always log the failure BEFORE throwing — so Fail2Ban sees every attempt including the final one
    logger.warn(`Failed ${attemptType} attempt | IP: ${ipAddress} | Email: ${email} | Reason: invalid credentials (attempt ${count}/${MAX_ATTEMPTS})`);

    if (remaining <= 0) {
      await db.query(
        `UPDATE login_attempts
         SET banned_until = NOW() + ($1 || ' seconds')::INTERVAL, updated_at = NOW()
         WHERE ip_address = $2`,
        [BAN_DURATION_SECS, ipAddress]
      );
      const bannedUntil = Date.now() + BAN_DURATION_SECS * 1000;
      logger.warn(`Rate limit reached | IP: ${ipAddress} | Banned for ${BAN_DURATION_SECS}s`);
      throw new RateLimitError(
        'Too many failed login attempts. Your IP has been temporarily blocked for 1 hour.',
        { retryAfter: BAN_DURATION_SECS, bannedUntil }
      );
    }

    return remaining;
  }

  /**
   * Public wrapper for reCAPTCHA verification.
   */
  async verifyRecaptchaToken(token, ipAddress = null) {
    return this._verifyRecaptchaToken(token, ipAddress);
  }

  /**
   * Verify Google reCAPTCHA token server-side.
   * @private
   */
  async _verifyRecaptchaToken(token, ipAddress = null) {
    // Skip reCAPTCHA verification in development mode
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    if (!token) {
      throw new ValidationError('Please complete reCAPTCHA verification', {
        field: 'recaptchaToken'
      });
    }

    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) {
      logger.error('reCAPTCHA secret key is not configured');
      throw new ValidationError('reCAPTCHA is not configured on the server');
    }

    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (ipAddress) {
      params.append('remoteip', ipAddress);
    }

    let verifyResponse;
    try {
      verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });
    } catch (error) {
      logger.error('reCAPTCHA verification request failed', {
        error: error.message
      });
      throw new ValidationError('Unable to verify reCAPTCHA. Please try again.');
    }

    if (!verifyResponse.ok) {
      logger.error('reCAPTCHA verify endpoint returned non-OK status', {
        status: verifyResponse.status
      });
      throw new ValidationError('Unable to verify reCAPTCHA. Please try again.');
    }

    const verifyResult = await verifyResponse.json();
    if (!verifyResult.success) {
      logger.warn('reCAPTCHA verification failed', {
        errorCodes: verifyResult['error-codes'] || []
      });
      throw new ValidationError('reCAPTCHA verification failed. Please try again.', {
        errorCodes: verifyResult['error-codes'] || []
      });
    }
  }

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
    const {
      email,
      password,
      username,
      full_name,
      role = 'user',
      recaptchaToken,
      ipAddress
    } = userData;

    // Check app-level rate limit before any DB work (same table as login)
    await this._checkRateLimit(ipAddress);

    // Validate reCAPTCHA before any account creation logic
    await this._verifyRecaptchaToken(recaptchaToken, ipAddress);

    // Check if user already exists
    const existingUser = await UserRepository.findByEmail(email);
    if (existingUser) {
      const attemptsRemaining = await this._recordFailedAttempt(ipAddress, email, 'register');
      throw new ConflictError('User with this email already exists', {
        field: 'email',
        value: email,
        attemptsRemaining
      });
    }

    // Check username if provided
    if (username) {
      const existingUsername = await UserRepository.findByUsername(username);
      if (existingUsername) {
        const attemptsRemaining = await this._recordFailedAttempt(ipAddress, email, 'register');
        throw new ConflictError('Username is already taken', {
          field: 'username',
          value: username,
          attemptsRemaining
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
      email_verified: false,
      registered_ip: ipAddress
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

    // Clear any failed attempts for this IP on successful registration
    if (ipAddress) await db.query(`DELETE FROM login_attempts WHERE ip_address = $1`, [ipAddress]);

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
  async login(email, password, recaptchaToken, ipAddress = null) {
    // Check app-level rate limit before doing any DB work
    await this._checkRateLimit(ipAddress);

    await this._verifyRecaptchaToken(recaptchaToken, ipAddress);

    // Find user (including deleted accounts)
    let user = await UserRepository.findByEmail(email);

    // If not found in active accounts, check deleted accounts
    if (!user) {
      const deletedUser = await UserRepository.findDeletedByEmail(email);

      if (deletedUser) {
        this._checkDeletedAccount(deletedUser, email);
      }

      // Account truly doesn't exist — record the failure
      const attemptsRemaining = await this._recordFailedAttempt(ipAddress, email, 'login');
      throw new AuthenticationError('No account found with this email address', {
        accountNotFound: true,
        email,
        attemptsRemaining
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const attemptsRemaining = await this._recordFailedAttempt(ipAddress, email, 'login');
      throw new AuthenticationError('Incorrect password. Please try again.', {
        incorrectPassword: true,
        email,
        attemptsRemaining
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
    await UserRepository.updateLastLogin(user.id, ipAddress);
    if (ipAddress) await db.query(`DELETE FROM login_attempts WHERE ip_address = $1`, [ipAddress]);

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
        userId: user.id, email
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
  async forgotPassword(email, recaptchaToken, ipAddress = null) {
    await this._verifyRecaptchaToken(recaptchaToken, ipAddress);

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

  /**
   * Get Google OAuth link status for a user
   */
  async getGoogleLinkStatus(userId) {
    const user = await UserRepository.findByIdWithOAuth(userId);
    if (!user) throw new NotFoundError('User not found');

    // Check if user has a password set (Google-only users do not)
    const authUser = await UserRepository.findByEmail(user.email);
    const hasPassword = !!(authUser && authUser.password);

    return {
      linked: !!user.google_id,
      oauth_provider: user.oauth_provider || null,
      has_password: hasPassword
    };
  }

  /**
   * Unlink Google account from user.
   * Only allowed if user has a password set (so they can still log in).
   */
  async unlinkGoogleAccount(userId) {
    const user = await UserRepository.findByIdWithOAuth(userId);
    if (!user) throw new NotFoundError('User not found');

    if (!user.google_id) {
      throw new ValidationError('No Google account is linked to your account.');
    }

    // Fetch full auth record to check password_hash
    const authUser = await UserRepository.findByEmail(user.email);
    if (!authUser || !authUser.password) {
      throw new ValidationError(
        'You must set a password before unlinking Google. Otherwise you would not be able to log in.'
      );
    }

    const updated = await UserRepository.unlinkGoogleAccount(userId);
    logger.info('Google account unlinked', { userId });
    return updated;
  }
}

module.exports = new AuthService();