/**
 * User Repository
 * Professional user data access layer with enhanced security and functionality
 */

const BaseRepository = require('./BaseRepository');
const bcrypt = require('bcryptjs');
const { ConflictError, NotFoundError, ValidationError } = require('../utils');
const logger = require('../utils/logger');
const { env: config } = require('../config');

const getBcryptRounds = () => {
  const rounds = Number(config?.auth?.bcryptRounds || config?.BCRYPT_ROUNDS || 12);
  return Number.isFinite(rounds) && rounds > 3 ? rounds : 12;
};

class UserRepository extends BaseRepository {
  constructor() {
    super('users');

    // Define safe columns to return (excluding sensitive data by default)
    this.safeColumns = `
      id, email, username, full_name, bio, location, native_language,
      role, is_active, email_verified, last_login, profile_photo_url,
      created_at, updated_at
    `;

    this.authColumns = `
      id, email, username, full_name, password_hash as password,
      role, is_active, email_verified, deleted_at, last_login,
      created_at
    `;
  }

  /**
   * Find user by ID (without password)
   */
  async findById(id) {
    const query = `SELECT ${this.safeColumns} FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL`;
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find user by email (with password for authentication)
   */
  async findByEmail(email) {
    const query = `SELECT ${this.authColumns} FROM ${this.tableName} WHERE email = $1`;
    const result = await this.db.query(query, [email]);
    return result.rows[0] || null;
  }

  /**
   * Find user by username
   */
  async findByUsername(username) {
    const query = `SELECT ${this.safeColumns} FROM ${this.tableName} WHERE username = $1`;
    const result = await this.db.query(query, [username]);
    return result.rows[0] || null;
  }

  /**
   * Find users by multiple usernames (for mentions)
   */
  async findByUsernames(usernames) {
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return [];
    }

    // Create placeholders for parameterized query
    const placeholders = usernames.map((_, index) => `$${index + 1}`).join(', ');

    const query = `
      SELECT ${this.safeColumns} 
      FROM ${this.tableName} 
      WHERE LOWER(username) IN (${placeholders}) 
      AND deleted_at IS NULL 
      AND is_active = true
    `;

    // Convert usernames to lowercase for case-insensitive matching
    const lowercaseUsernames = usernames.map(username => username.toLowerCase());

    const result = await this.db.query(query, lowercaseUsernames);
    return result.rows;
  }

  /**
   * Search users for mention suggestions
   */
  async searchUsersForMentions(searchTerm, limit = 10) {
    const query = `
      SELECT id, username, full_name, profile_photo_url
      FROM ${this.tableName}
      WHERE (
        username ILIKE $1 OR
        full_name ILIKE $1
      )
      AND deleted_at IS NULL
      AND is_active = true
      ORDER BY 
        CASE 
          WHEN username ILIKE $2 THEN 1  -- Exact username match gets priority
          WHEN username ILIKE $1 THEN 2  -- Username contains gets second priority
          WHEN full_name ILIKE $1 THEN 3 -- Full name contains gets third priority
          ELSE 4
        END,
        username ASC
      LIMIT $3
    `;

    const searchPattern = `%${searchTerm}%`;
    const exactSearchPattern = `${searchTerm}%`; // For prefix matching

    const result = await this.db.query(query, [searchPattern, exactSearchPattern, limit]);
    return result.rows;
  }

  /**
   * Find user by Google ID
   */
  async findByGoogleId(googleId) {
    const query = `
      SELECT ${this.safeColumns}, google_id, oauth_provider
      FROM ${this.tableName}
      WHERE google_id = $1
    `;
    const result = await this.db.query(query, [googleId]);
    return result.rows[0] || null;
  }

  /**
   * Find user by ID including google_id and oauth_provider fields
   */
  async findByIdWithOAuth(id) {
    const query = `
      SELECT ${this.safeColumns}, google_id, oauth_provider
      FROM ${this.tableName}
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Link a Google account to an existing user
   */
  async linkGoogleAccount(userId, googleId, oauthProvider = 'google') {
    const query = `
      UPDATE ${this.tableName}
      SET google_id = $1, oauth_provider = $2, updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING ${this.safeColumns}, google_id, oauth_provider
    `;
    const result = await this.db.query(query, [googleId, oauthProvider, userId]);
    if (!result.rows[0]) throw new Error('User not found');
    delete result.rows[0].password_hash;
    return result.rows[0];
  }

  /**
   * Unlink Google account from a user (requires password_hash to exist)
   */
  async unlinkGoogleAccount(userId) {
    const query = `
      UPDATE ${this.tableName}
      SET google_id = NULL, oauth_provider = NULL, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING ${this.safeColumns}, google_id, oauth_provider
    `;
    const result = await this.db.query(query, [userId]);
    if (!result.rows[0]) throw new Error('User not found');
    delete result.rows[0].password_hash;
    return result.rows[0];
  }

  /**
   * Create new user with hashed password
   */
  async create(userData) {
    const {
      email,
      password,
      username,
      full_name,
      role = 'user',
      google_id = null,
      oauth_provider = null,
      profile_photo_url = null,
      email_verified = false
    } = userData;

    // Check if user already exists
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new ConflictError('Email already exists', { field: 'email' });
    }

    // Check if username exists (if provided)
    if (username) {
      const existingUsername = await this.findByUsername(username);
      if (existingUsername) {
        throw new ConflictError('Username already exists', { field: 'username' });
      }
    }

    // Hash password if provided
    let password_hash = null;
    if (password) {
      password_hash = await bcrypt.hash(password, getBcryptRounds());
    }

    try {
      const query = `
        INSERT INTO ${this.tableName} (
          id, email, password_hash, username, full_name, role,
          google_id, oauth_provider, profile_photo_url, email_verified
        )
        VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${this.safeColumns}
      `;

      const result = await this.db.query(query, [
        email,
        password_hash,
        username,
        full_name,
        role,
        google_id,
        oauth_provider,
        profile_photo_url,
        email_verified
      ]);

      logger.info('User created successfully', {
        userId: result.rows[0].id,
        email,
        role
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error creating user', { error: error.message });
      throw error;
    }
  }

  /**
   * Update user
   */
  async update(id, userData) {
    // Ensure sensitive fields are not updated through this method
    delete userData.password_hash;
    delete userData.password;
    delete userData.id;
    delete userData.created_at;
    delete userData.deleted_at;

    const user = await super.update(id, userData);

    logger.info('User updated successfully', {
      userId: id,
      updatedFields: Object.keys(userData)
    });

    // Return without sensitive data
    delete user.password_hash;
    return user;
  }

  /**
   * Update user password
   */
  async updatePassword(id, newPassword) {
    const password_hash = await bcrypt.hash(newPassword, getBcryptRounds());

    const query = `
      UPDATE ${this.tableName}
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id
    `;

    const result = await this.db.query(query, [password_hash, id]);

    if (!result.rows[0]) {
      throw new NotFoundError('User');
    }

    logger.info('User password updated', { userId: id });
    return true;
  }

  /**
   * Verify user password
   */
  async verifyPassword(email, password) {
    const user = await this.findByEmail(email);

    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      throw new AuthenticationError('Invalid credentials');
    }

    return user;
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id) {
    const query = `
      UPDATE ${this.tableName}
      SET last_login = NOW()
      WHERE id = $1
      RETURNING id
    `;

    await this.db.query(query, [id]);
  }

  /**
   * Store email verification code
   */
  async storeVerificationCode(email, code, expiresInMinutes = 10) {
    const expiryDate = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const query = `
      UPDATE ${this.tableName}
      SET 
        email_verification_code = $1,
        email_verification_expires = $2,
        updated_at = NOW()
      WHERE email = $3
      RETURNING ${this.safeColumns}
    `;

    const result = await this.db.query(query, [code, expiryDate, email]);

    if (!result.rows[0]) {
      throw new NotFoundError('User');
    }

    logger.info('Verification code stored', { email });
    return result.rows[0];
  }

  /**
   * Verify email with code
   */
  async verifyEmailWithCode(email, code) {
    // First check if code matches and hasn't expired
    const checkQuery = `
      SELECT * FROM ${this.tableName}
      WHERE email = $1 
        AND email_verification_code = $2
        AND email_verification_expires > NOW()
        AND deleted_at IS NULL
    `;

    const checkResult = await this.db.query(checkQuery, [email, code]);

    if (!checkResult.rows[0]) {
      throw new ValidationError('Invalid or expired verification code');
    }

    // Update user to mark email as verified and clear verification code
    const updateQuery = `
      UPDATE ${this.tableName}
      SET 
        email_verified = true,
        email_verification_code = NULL,
        email_verification_expires = NULL,
        updated_at = NOW()
      WHERE email = $1
      RETURNING ${this.safeColumns}
    `;

    const result = await this.db.query(updateQuery, [email]);

    logger.info('Email verified successfully', { email });
    return result.rows[0];
  }

  /**
   * Verify user email (without code - for backward compatibility)
   */
  async verifyEmail(email) {
    const query = `
      UPDATE ${this.tableName}
      SET email_verified = true, updated_at = NOW()
      WHERE email = $1
      RETURNING ${this.safeColumns}
    `;

    const result = await this.db.query(query, [email]);

    if (!result.rows[0]) {
      throw new NotFoundError('User');
    }

    logger.info('Email verified', { email });
    return result.rows[0];
  }

  /**
   * Activate/Deactivate user
   */
  async setActiveStatus(id, isActive) {
    return await this.update(id, { is_active: isActive });
  }

  /**
   * Get user statistics
   */
  async getStatistics(id) {
    const query = `
      SELECT
        0 as words_contributed,
        (SELECT COUNT(*) FROM discussions WHERE author_id = $1) as discussions_started,
        (SELECT COUNT(*) FROM answers WHERE author_id = $1) as answers_posted,
        (SELECT COUNT(*) FROM saved_discussions WHERE user_id = $1) as saved_discussions_count,
        0 as favorites_count,
        -- Voting statistics
        (SELECT COUNT(*) FROM discussion_votes WHERE user_id = $1 AND vote_type = 'up') as upvoted_discussions,
        (SELECT COUNT(*) FROM discussion_votes WHERE user_id = $1 AND vote_type = 'down') as downvoted_discussions,
        (SELECT COUNT(*) FROM answer_votes WHERE user_id = $1 AND vote_type = 'up') as upvoted_answers,
        (SELECT COUNT(*) FROM answer_votes WHERE user_id = $1 AND vote_type = 'down') as downvoted_answers
    `;

    const result = await this.db.query(query, [id]);
    return result.rows[0];
  }

  /**
   * List users with pagination and filters
   */
  async list(options = {}) {
    const {
      page = 1,
      limit = 1000, // High default to effectively remove limit
      role = null,
      isActive = null,
      search = null,
      orderBy = 'created_at',
      order = 'DESC'
    } = options;

    const criteria = {};
    if (role) criteria.role = role;
    if (isActive !== null) criteria.is_active = isActive;

    // For activity sorting, we need to join with statistics
    const isActivitySort = orderBy === 'activity';

    // Build safe column list with u. prefix (single line to avoid SQL syntax issues)
    const safeUserColumns = 'u.id, u.email, u.username, u.full_name, u.bio, u.location, u.native_language, u.role, u.is_active, u.email_verified, u.last_login, u.profile_photo_url, u.created_at, u.updated_at';

    let query = isActivitySort
      ? `SELECT ${safeUserColumns},
         COALESCE((SELECT COUNT(*) FROM discussions WHERE author_id = u.id), 0) as discussion_count,
         COALESCE((SELECT COUNT(*) FROM answers WHERE author_id = u.id), 0) as reply_count,
         0 as total_contributions,
         COALESCE((SELECT COUNT(*) FROM discussions WHERE author_id = u.id), 0) + 
         COALESCE((SELECT COUNT(*) FROM answers WHERE author_id = u.id), 0) as activity_score
         FROM ${this.tableName} u`
      : `SELECT ${safeUserColumns},
         COALESCE((SELECT COUNT(*) FROM discussions WHERE author_id = u.id), 0) as discussion_count,
         COALESCE((SELECT COUNT(*) FROM answers WHERE author_id = u.id), 0) as reply_count,
         0 as total_contributions
         FROM ${this.tableName} u`;

    const values = [];
    const conditions = [];
    let paramIndex = 1;

    // Build where conditions (both queries now use 'u' alias)
    if (Object.keys(criteria).length > 0) {
      for (const [key, value] of Object.entries(criteria)) {
        conditions.push(`u.${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    // Add search condition
    if (search) {
      conditions.push(`(
        u.email ILIKE $${paramIndex} OR
        u.username ILIKE $${paramIndex} OR
        u.full_name ILIKE $${paramIndex}
      )`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    // Add deleted_at filter (exclude soft-deleted users)
    conditions.push('u.deleted_at IS NULL');

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Order by clause (use u. prefix for regular columns, no prefix for calculated columns)
    const orderColumn = isActivitySort ? 'activity_score' : `u.${orderBy}`;
    query += ` ORDER BY ${orderColumn} ${order}`;

    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await this.db.query(query, values);

    // Count total (both queries now use 'u' alias)
    let countQuery = `SELECT COUNT(*) as total FROM ${this.tableName} u`;
    const countValues = values.slice(0, -2); // Remove limit and offset

    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
    }

    const countResult = await this.db.query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    return {
      users: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        total_pages: totalPages, // Legacy support
        hasNext: page < totalPages,
        has_next: page < totalPages, // Legacy support
        hasPrev: page > 1,
        has_prev: page > 1, // Legacy support
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null
      }
    };
  }

  /**
   * Find deleted user by email
   */
  async findDeletedByEmail(email) {
    const query = `
      SELECT id, email, username, deleted_at, account_status
      FROM ${this.tableName}
      WHERE email = $1 AND deleted_at IS NOT NULL
    `;
    const result = await this.db.query(query, [email]);
    return result.rows[0] || null;
  }

  /**
   * Find deleted user by Google ID
   */
  async findDeletedByGoogleId(googleId) {
    const query = `
      SELECT id, email, username, deleted_at, account_status
      FROM ${this.tableName}
      WHERE google_id = $1 AND deleted_at IS NOT NULL
    `;
    const result = await this.db.query(query, [googleId]);
    return result.rows[0] || null;
  }

  /**
   * Restore deleted account
   */
  async restore(email) {
    const query = `
      UPDATE ${this.tableName}
      SET 
        deleted_at = NULL,
        is_active = true,
        account_status = 'active',
        updated_at = NOW()
      WHERE email = $1 AND deleted_at IS NOT NULL
      RETURNING ${this.safeColumns}
    `;
    const result = await this.db.query(query, [email]);

    if (!result.rows[0]) {
      throw new NotFoundError('Deleted user');
    }

    logger.info('User account restored', { email });
    return result.rows[0];
  }

  /**
   * Soft delete user
   */
  async delete(id) {
    const query = `
      UPDATE ${this.tableName}
      SET 
        deleted_at = NOW(),
        is_active = false,
        account_status = 'pending_deletion',
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `;
    const result = await this.db.query(query, [id]);

    if (!result.rows[0]) {
      throw new NotFoundError('User');
    }

    logger.info('User account soft deleted', { userId: id });
    return result.rows[0];
  }

  /**
   * Hard delete user (permanent)
   */
  async hardDelete(id) {
    return await super.delete(id);
  }

  /**
   * Create follow relationship
   */
  async createFollow(followerId, followingId) {
    const query = `
      INSERT INTO user_follows (follower_id, following_id, created_at)
      VALUES ($1, $2, NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [followerId, followingId]);
    return result.rows[0];
  }

  /**
   * Delete follow relationship
   */
  async deleteFollow(followerId, followingId) {
    const query = `
      DELETE FROM user_follows 
      WHERE follower_id = $1 AND following_id = $2
      RETURNING *
    `;
    const result = await this.db.query(query, [followerId, followingId]);
    return result.rows[0];
  }

  /**
   * Find follow relationship
   */
  async findFollow(followerId, followingId) {
    const query = `
      SELECT * FROM user_follows 
      WHERE follower_id = $1 AND following_id = $2
    `;
    const result = await this.db.query(query, [followerId, followingId]);
    return result.rows[0];
  }

  /**
   * Get followers count
   */
  async getFollowersCount(userId) {
    const query = `
      SELECT COUNT(*) as count 
      FROM user_follows 
      WHERE following_id = $1
    `;
    const result = await this.db.query(query, [userId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * Get following count
   */
  async getFollowingCount(userId) {
    const query = `
      SELECT COUNT(*) as count 
      FROM user_follows 
      WHERE follower_id = $1
    `;
    const result = await this.db.query(query, [userId]);
    return parseInt(result.rows[0].count);
  }

  /**
   * Get user's followers
   */
  async getFollowers(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const query = `
      SELECT u.id, u.username, u.full_name, u.profile_photo_url, uf.created_at as followed_at
      FROM user_follows uf
      JOIN users u ON uf.follower_id = u.id
      WHERE uf.following_id = $1 AND u.deleted_at IS NULL
      ORDER BY uf.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.db.query(query, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Get users that a user is following
   */
  async getFollowing(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const query = `
      SELECT u.id, u.username, u.full_name, u.profile_photo_url, uf.created_at as followed_at
      FROM user_follows uf
      JOIN users u ON uf.following_id = u.id
      WHERE uf.follower_id = $1 AND u.deleted_at IS NULL
      ORDER BY uf.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.db.query(query, [userId, limit, offset]);
    return result.rows;
  }
}

// Export singleton instance
module.exports = new UserRepository();
