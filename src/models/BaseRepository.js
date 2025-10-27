/**
 * Base Repository Pattern
 * Provides common database operations for all models
 */

const { db } = require('../config/database');
const { DatabaseError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = db;
  }

  /**
   * Find record by ID
   */
  async findById(id, columns = '*') {
    try {
      const query = `SELECT ${columns} FROM ${this.tableName} WHERE id = $1`;
      const result = await this.db.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error finding ${this.tableName} by ID`, { id, error: error.message });
      throw new DatabaseError(`Failed to find ${this.tableName} by ID`);
    }
  }

  /**
   * Find one record by criteria
   */
  async findOne(criteria, columns = '*') {
    try {
      const { whereClause, values } = this._buildWhereClause(criteria);
      const query = `SELECT ${columns} FROM ${this.tableName} WHERE ${whereClause} LIMIT 1`;
      const result = await this.db.query(query, values);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error finding ${this.tableName}`, { criteria, error: error.message });
      throw new DatabaseError(`Failed to find ${this.tableName}`);
    }
  }

  /**
   * Find multiple records by criteria
   */
  async findMany(criteria = {}, options = {}) {
    try {
      const {
        columns = '*',
        orderBy = 'created_at',
        order = 'DESC',
        limit = 10,
        offset = 0
      } = options;

      let query = `SELECT ${columns} FROM ${this.tableName}`;
      let values = [];

      if (Object.keys(criteria).length > 0) {
        const { whereClause, values: whereValues } = this._buildWhereClause(criteria);
        query += ` WHERE ${whereClause}`;
        values = whereValues;
      }

      query += ` ORDER BY ${orderBy} ${order}`;
      query += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, offset);

      const result = await this.db.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error(`Error finding ${this.tableName} records`, { criteria, error: error.message });
      throw new DatabaseError(`Failed to find ${this.tableName} records`);
    }
  }

  /**
   * Create new record
   */
  async create(data) {
    try {
      const { columns, placeholders, values } = this._buildInsertClause(data);
      const query = `
        INSERT INTO ${this.tableName} (${columns})
        VALUES (${placeholders})
        RETURNING *
      `;
      const result = await this.db.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error creating ${this.tableName}`, { error: error.message });
      throw new DatabaseError(`Failed to create ${this.tableName}`, {
        error: error.message,
        code: error.code
      });
    }
  }

  /**
   * Update record by ID
   */
  async update(id, data) {
    try {
      const { setClause, values } = this._buildUpdateClause(data);
      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}, updated_at = NOW()
        WHERE id = $${values.length + 1}
        RETURNING *
      `;
      values.push(id);

      const result = await this.db.query(query, values);

      if (!result.rows[0]) {
        throw new NotFoundError(this.tableName);
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error(`Error updating ${this.tableName}`, { id, error: error.message });
      throw new DatabaseError(`Failed to update ${this.tableName}`);
    }
  }

  /**
   * Delete record by ID (hard delete)
   */
  async delete(id) {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING id`;
      const result = await this.db.query(query, [id]);

      if (!result.rows[0]) {
        throw new NotFoundError(this.tableName);
      }

      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error(`Error deleting ${this.tableName}`, { id, error: error.message });
      throw new DatabaseError(`Failed to delete ${this.tableName}`);
    }
  }

  /**
   * Soft delete record by ID
   */
  async softDelete(id) {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET deleted_at = NOW(), is_active = false
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `;
      const result = await this.db.query(query, [id]);

      if (!result.rows[0]) {
        throw new NotFoundError(this.tableName);
      }

      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error(`Error soft deleting ${this.tableName}`, { id, error: error.message });
      throw new DatabaseError(`Failed to soft delete ${this.tableName}`);
    }
  }

  /**
   * Count records
   */
  async count(criteria = {}) {
    try {
      let query = `SELECT COUNT(*) as total FROM ${this.tableName}`;
      let values = [];

      if (Object.keys(criteria).length > 0) {
        const { whereClause, values: whereValues } = this._buildWhereClause(criteria);
        query += ` WHERE ${whereClause}`;
        values = whereValues;
      }

      const result = await this.db.query(query, values);
      return parseInt(result.rows[0].total, 10);
    } catch (error) {
      logger.error(`Error counting ${this.tableName}`, { error: error.message });
      throw new DatabaseError(`Failed to count ${this.tableName}`);
    }
  }

  /**
   * Check if record exists
   */
  async exists(criteria) {
    const count = await this.count(criteria);
    return count > 0;
  }

  /**
   * Paginate results
   */
  async paginate(criteria = {}, options = {}) {
    const { page = 1, limit = 10, ...findOptions } = options;
    const offset = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.findMany(criteria, { ...findOptions, limit, offset }),
      this.count(criteria)
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null
      }
    };
  }

  /**
   * Build WHERE clause from criteria object
   */
  _buildWhereClause(criteria) {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(criteria)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        conditions.push(`${key} = ANY($${paramIndex})`);
        values.push(value);
        paramIndex++;
      } else {
        conditions.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    return {
      whereClause: conditions.join(' AND '),
      values
    };
  }

  /**
   * Build INSERT clause from data object
   */
  _buildInsertClause(data) {
    const columns = [];
    const placeholders = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        columns.push(key);
        placeholders.push(`$${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    return {
      columns: columns.join(', '),
      placeholders: placeholders.join(', '),
      values
    };
  }

  /**
   * Build UPDATE SET clause from data object
   */
  _buildUpdateClause(data) {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key !== 'id' && key !== 'created_at') {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    return {
      setClause: setClauses.join(', '),
      values
    };
  }

  /**
   * Execute raw query
   */
  async raw(query, params = []) {
    try {
      return await this.db.query(query, params);
    } catch (error) {
      logger.error('Raw query error', { query, error: error.message });
      throw new DatabaseError('Query execution failed');
    }
  }

  /**
   * Execute transaction
   */
  async transaction(callback) {
    return await this.db.transaction(callback);
  }
}

module.exports = BaseRepository;
