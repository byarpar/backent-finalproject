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
const { DatabaseError, NotFoundError } = require('../utils');
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

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total: totalCount,
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

  /**
   * Common voting logic for discussions and answers
   * @param {string} tableName - Name of the votes table (e.g., 'discussion_votes', 'answer_votes')
   * @param {string} itemIdColumn - Name of the item ID column (e.g., 'discussion_id', 'answer_id')
   * @param {string|number} itemId - ID of the item being voted on
   * @param {string} userId - ID of the user voting
   * @param {string} voteType - Type of vote ('up' or 'down')
   * @param {Function} getUserVoteMethod - Method to get existing user vote
   * @returns {Promise<Object>} Vote result with action and voteType
   */
  async _handleVote(tableName, itemIdColumn, itemId, userId, voteType, getUserVoteMethod) {
    try {
      const existingVote = await getUserVoteMethod(itemId, userId);

      let action, resultVoteType;

      if (existingVote) {
        if (existingVote === voteType) {
          // Remove vote (toggle off)
          await this.db.query(
            `DELETE FROM ${tableName} WHERE ${itemIdColumn} = $1 AND user_id = $2`,
            [itemId, userId]
          );
          action = 'removed';
          resultVoteType = null;
          logger.info('Vote removed', { tableName, itemId, userId, voteType });
        } else {
          // Update vote
          await this.db.query(
            `UPDATE ${tableName} SET vote_type = $1, updated_at = CURRENT_TIMESTAMP WHERE ${itemIdColumn} = $2 AND user_id = $3`,
            [voteType, itemId, userId]
          );
          action = 'updated';
          resultVoteType = voteType;
          logger.info('Vote updated', { tableName, itemId, userId, voteType });
        }
      } else {
        // Create new vote
        await this.db.query(
          `INSERT INTO ${tableName} (${itemIdColumn}, user_id, vote_type) VALUES ($1, $2, $3)`,
          [itemId, userId, voteType]
        );
        action = 'created';
        resultVoteType = voteType;
        logger.info('Vote created', { tableName, itemId, userId, voteType });
      }

      return { action, voteType: resultVoteType };
    } catch (error) {
      logger.error('Error handling vote', { tableName, itemId, userId, voteType, error: error.message });
      throw error;
    }
  }
}

module.exports = BaseRepository;
