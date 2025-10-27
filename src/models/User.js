const { db } = require('../config/database');

class User {
  static async findById(id) {
    const result = await db.query(
      'SELECT id, email, username, full_name, bio, location, native_language, role, is_active, last_login, profile_photo_url, created_at, updated_at FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await db.query(
      'SELECT id, email, username, full_name, password_hash as password, role, is_active, email_verified, last_login, deleted_at, created_at FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    return result.rows[0];
  }

  static async findByUsername(username) {
    const result = await db.query(
      'SELECT id, email, username, full_name, password_hash as password, role, is_active, last_login, created_at FROM users WHERE username = $1 AND deleted_at IS NULL',
      [username]
    );
    return result.rows[0];
  }

  static async findByGoogleId(googleId) {
    const result = await db.query(
      'SELECT id, email, username, full_name, google_id, oauth_provider, profile_photo_url, role, is_active, email_verified, last_login, created_at FROM users WHERE google_id = $1 AND deleted_at IS NULL',
      [googleId]
    );
    return result.rows[0];
  }

  static async findDeletedByGoogleId(googleId) {
    const result = await db.query(
      'SELECT id, email, username, deleted_at, account_status FROM users WHERE google_id = $1 AND deleted_at IS NOT NULL',
      [googleId]
    );
    return result.rows[0];
  }

  static async findDeletedByEmail(email) {
    const result = await db.query(
      'SELECT id, email, username, deleted_at, account_status FROM users WHERE email = $1 AND deleted_at IS NOT NULL',
      [email]
    );
    return result.rows[0];
  }

  static async restore(email) {
    // Restore deleted account (clear deleted_at, set account_status to active, reactivate)
    const result = await db.query(
      `UPDATE users 
       SET deleted_at = NULL, 
           is_active = true, 
           account_status = 'active',
           updated_at = NOW()
       WHERE email = $1 AND deleted_at IS NOT NULL
       RETURNING id, email, username, full_name, role, email_verified, created_at`,
      [email]
    );
    return result.rows[0];
  }

  static async create(userData) {
    const {
      email, password, username, full_name, role = 'user',
      google_id, oauth_provider, profile_photo_url, email_verified = false
    } = userData;

    const result = await db.query(`
      INSERT INTO users (
        id, email, password_hash, username, full_name, role,
        google_id, oauth_provider, profile_photo_url, email_verified
      )
      VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, email, username, full_name, role, google_id, oauth_provider, 
                profile_photo_url, email_verified, created_at
    `, [email, password, username, full_name, role, google_id, oauth_provider, profile_photo_url, email_verified]);
    return result.rows[0];
  }

  static async update(id, userData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(userData).forEach(key => {
      if (userData[key] !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(userData[key]);
        paramIndex++;
      }
    });

    // If no fields to update, just return the current user
    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = await db.query(`
      UPDATE users 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, email, username, full_name, role, is_active, bio, location, native_language, last_login, profile_photo_url, created_at, updated_at
    `, values);

    return result.rows[0];
  }

  static async delete(id) {
    // Soft delete: set deleted_at timestamp, set account_status to pending_deletion, and deactivate account
    await db.query(
      'UPDATE users SET deleted_at = NOW(), is_active = false, account_status = $1 WHERE id = $2',
      ['pending_deletion', id]
    );
  }

  static async hardDelete(id) {
    // Hard delete: completely remove the user (use with caution)
    await db.query('DELETE FROM users WHERE id = $1', [id]);
  }

  static async list(options = {}) {
    const { page = 1, limit = 10, sort = 'created_at', order = 'DESC' } = options;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT id, email, role, is_active, created_at, updated_at
      FROM users
      WHERE deleted_at IS NULL
      ORDER BY ${sort} ${order}
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await db.query('SELECT COUNT(*) as total FROM users WHERE deleted_at IS NULL');

    return {
      users: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
      totalPages: Math.ceil(countResult.rows[0].total / limit)
    };
  }
}

module.exports = User;
