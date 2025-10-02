const { db } = require('../config/database');

class User {
  static async findById(id) {
    const result = await db.query(
      'SELECT id, email, username, full_name, bio, location, native_language, role, is_active, last_login, profile_photo_url, dark_mode_preference, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await db.query(
      'SELECT id, email, username, full_name, password_hash as password, role, is_active, last_login, dark_mode_preference, created_at FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async findByUsername(username) {
    const result = await db.query(
      'SELECT id, email, username, full_name, password_hash as password, role, is_active, last_login, dark_mode_preference, created_at FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0];
  }

  static async create(userData) {
    const { email, password, username, full_name, role = 'user' } = userData;
    const result = await db.query(`
      INSERT INTO users (id, email, password_hash, username, full_name, role)
      VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)
      RETURNING id, email, username, full_name, role, created_at
    `, [email, password, username, full_name, role]);
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

    values.push(id);

    const result = await db.query(`
      UPDATE users 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, email, username, full_name, role, is_active, bio, location, native_language, last_login, profile_photo_url, dark_mode_preference, created_at, updated_at
    `, values);

    return result.rows[0];
  }

  static async delete(id) {
    await db.query('DELETE FROM users WHERE id = $1', [id]);
  }

  static async list(options = {}) {
    const { page = 1, limit = 10, sort = 'created_at', order = 'DESC' } = options;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT id, email, role, is_active, created_at, updated_at
      FROM users
      ORDER BY ${sort} ${order}
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await db.query('SELECT COUNT(*) as total FROM users');

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
