/**
 * Base Repository
 * Professional base class for all repositories with common database operations
 * 
 * Features:
 * - Transaction management
 * - Common CRUD operations
 * - Query building
 * - Error handling
 * - Pagination
 * - Soft deletes
 */

const { db } = require('../config/database');
const { DatabaseError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

class BaseRepository {
  /**
   * Create a new repository instance
   * @param {string} tableName - Name of the database table
   */
  constructor(tableName) {
    this.tableName = tableName;
    this.db = db;
  }

  /**
   * Execute a query with error handling
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} client - Optional database client for transactions
   * @returns {Promise<Object>} Query result
   */
  async query(query, params = [], client = null) {
    try {
      const executor = client || this.db;
      return await executor.query(query, params);
    } catch (error) {
      logger.error(`Database query error in ${this.tableName}:`, {
        error: error.message,
        query: query.substring(0, 100),
        params
      });
      throw new DatabaseError(`Database operation failed: ${error.message}`);
    }
  }

  /**
   * Find a record by ID
   * @param {number|string} id - Record ID
   * @param {string} columns - Columns to select
   * @returns {Promise<Object|null>} Record or null
   */
  async findById(id, columns = '*') {
    const query = `SELECT ${columns} FROM ${this.tableName} WHERE id = $1`;
    const result = await this.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find all records with optional conditions
   * @param {Object} options - Query options
   * @param {string} options.where - WHERE clause
   * @param {Array} options.params - Query parameters
   * @param {string} options.columns - Columns to select
   * @param {string} options.orderBy - ORDER BY clause
   * @param {number} options.limit - LIMIT
   * @param {number} options.offset - OFFSET
   * @returns {Promise<Array>} Array of records
   */
  async findAll(options = {}) {
    const {
      where = '',
      params = [],
      columns = '*',
      orderBy = 'id DESC',
      limit = null,
      offset = null
    } = options;

    let query = `SELECT ${columns} FROM ${this.tableName}`;

    if (where) {
      query += ` WHERE ${where}`;
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    if (offset) {
      query += ` OFFSET ${offset}`;
    }

    const result = await this.query(query, params);
    return result.rows;
  }

  /**
   * Find one record with optional conditions
   * @param {Object} options - Query options
   * @returns {Promise<Object|null>} Record or null
   */
  async findOne(options = {}) {
    const records = await this.findAll({ ...options, limit: 1 });
    return records[0] || null;
  }

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @param {Object} client - Optional database client for transactions
   * @returns {Promise<Object>} Created record
   */
  async create(data, client = null) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const query = `
      INSERT INTO ${this.tableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.query(query, values, client);
    return result.rows[0];
  }

  /**
   * Update a record by ID
   * @param {number|string} id - Record ID
   * @param {Object} data - Update data
   * @param {Object} client - Optional database client for transactions
   * @returns {Promise<Object>} Updated record
   */
  async update(id, data, client = null) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');

    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.query(query, [id, ...values], client);

    if (result.rows.length === 0) {
      throw new NotFoundError(`${this.tableName} not found with id: ${id}`);
    }

    return result.rows[0];
  }

  /**
   * Delete a record by ID
   * @param {number|string} id - Record ID
   * @param {Object} client - Optional database client for transactions
   * @returns {Promise<boolean>} Success status
   */
  async delete(id, client = null) {
    const query = `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING id`;
    const result = await this.query(query, [id], client);

    if (result.rows.length === 0) {
      throw new NotFoundError(`${this.tableName} not found with id: ${id}`);
    }

    return true;
  }

  /**
   * Soft delete a record (if deleted_at column exists)
   * @param {number|string} id - Record ID
   * @param {Object} client - Optional database client for transactions
   * @returns {Promise<Object>} Soft deleted record
   */
  async softDelete(id, client = null) {
    const query = `
      UPDATE ${this.tableName}
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.query(query, [id], client);

    if (result.rows.length === 0) {
      throw new NotFoundError(`${this.tableName} not found or already deleted with id: ${id}`);
    }

    return result.rows[0];
  }

  /**
   * Count records with optional conditions
   * @param {Object} options - Query options
   * @returns {Promise<number>} Count
   */
  async count(options = {}) {
    const { where = '', params = [] } = options;

    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;

    if (where) {
      query += ` WHERE ${where}`;
    }

    const result = await this.query(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Check if a record exists
   * @param {Object} options - Query options
   * @returns {Promise<boolean>} Exists status
   */
  async exists(options = {}) {
    const count = await this.count(options);
    return count > 0;
  }

  /**
   * Execute a query within a transaction
   * @param {Function} callback - Transaction callback function
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback) {
    return await this.db.transaction(callback);
  }

  /**
   * Paginate records
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Paginated results
   */
  async paginate(options = {}) {
    const {
      page = 1,
      limit = 10,
      where = '',
      params = [],
      columns = '*',
      orderBy = 'id DESC'
    } = options;

    const offset = (page - 1) * limit;

    // Get total count
    const totalCount = await this.count({ where, params });

    // Get paginated data
    const data = await this.findAll({
      where,
      params,
      columns,
      orderBy,
      limit,
      offset
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limit),
        has_next: page < Math.ceil(totalCount / limit),
        has_prev: page > 1
      }
    };
  }

  /**
   * Bulk insert records
   * @param {Array<Object>} records - Array of records to insert
   * @param {Object} client - Optional database client for transactions
   * @returns {Promise<Array>} Inserted records
   */
  async bulkCreate(records, client = null) {
    if (!records || records.length === 0) {
      return [];
    }

    const keys = Object.keys(records[0]);
    const columns = keys.join(', ');

    const valuesClauses = [];
    const allValues = [];
    let paramCounter = 1;

    records.forEach(record => {
      const recordValues = keys.map(key => record[key]);
      const placeholders = keys.map(() => `$${paramCounter++}`).join(', ');
      valuesClauses.push(`(${placeholders})`);
      allValues.push(...recordValues);
    });

    const query = `
      INSERT INTO ${this.tableName} (${columns})
      VALUES ${valuesClauses.join(', ')}
      RETURNING *
    `;

    const result = await this.query(query, allValues, client);
    return result.rows;
  }

  /**
   * Execute raw SQL query
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} client - Optional database client for transactions
   * @returns {Promise<Object>} Query result
   */
  async raw(query, params = [], client = null) {
    return await this.query(query, params, client);
  }
}

module.exports = BaseRepository;
