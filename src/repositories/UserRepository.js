/**
 * User Repository
 * Professional user data access layer with enhanced security and functionality
 */

const BaseRepository = require('./BaseRepository');
const bcrypt = require('bcryptjs');
const { ConflictError, NotFoundError, AuthenticationError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');
const config = require('../config/env');

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
      password_hash = await bcrypt.hash(password, config.auth.bcryptRounds);
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
    const password_hash = await bcrypt.hash(newPassword, config.auth.bcryptRounds);

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
        (SELECT COUNT(*) FROM words WHERE created_by = $1) as words_contributed,
        (SELECT COUNT(*) FROM discussions WHERE author_id = $1) as discussions_started,
        (SELECT COUNT(*) FROM answers WHERE author_id = $1) as answers_posted,
        (SELECT COUNT(*) FROM saved_discussions WHERE user_id = $1) as saved_discussions_count,
        0 as favorites_count
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
      limit = 10,
      role = null,
      isActive = null,
      search = null,
      orderBy = 'created_at',
      order = 'DESC'
    } = options;

    const criteria = {};
    if (role) criteria.role = role;
    if (isActive !== null) criteria.is_active = isActive;

    let query = `SELECT ${this.safeColumns} FROM ${this.tableName}`;
    const values = [];
    const conditions = [];
    let paramIndex = 1;

    // Build where conditions
    if (Object.keys(criteria).length > 0) {
      for (const [key, value] of Object.entries(criteria)) {
        conditions.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    // Add search condition
    if (search) {
      conditions.push(`(
        email ILIKE $${paramIndex} OR
        username ILIKE $${paramIndex} OR
        full_name ILIKE $${paramIndex}
      )`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    // Add deleted_at filter (exclude soft-deleted users)
    conditions.push('deleted_at IS NULL');

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY ${orderBy} ${order}`;

    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await this.db.query(query, values);

    // Count total
    let countQuery = `SELECT COUNT(*) as total FROM ${this.tableName}`;
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
        hasNext: page < totalPages,
        hasPrev: page > 1
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
}

// Export singleton instance
module.exports = new UserRepository();
