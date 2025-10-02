const { Pool } = require('pg');
const DatabaseInitializer = require('./databaseInitializer');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * Optimized Database Manager with high-performance configurations
 * Features: Connection pooling, prepared statements, query optimization
 */
class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.metrics = {
      totalQueries: 0,
      totalConnections: 0,
      avgQueryTime: 0,
      errors: 0
    };

    // Optimized connection configuration
    this.connectionConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'english_lisu_dictionary',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,

      // High-performance pool settings
      max: parseInt(process.env.DB_POOL_MAX) || 25,
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
      acquireTimeoutMillis: 30000,

      // Performance optimizations
      keepAlive: true,
      keepAliveInitialDelayMillis: 0,
      allowExitOnIdle: false,

      // Query optimizations
      query_timeout: 15000,
      statement_timeout: 30000,

      // Production SSL
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

    // Prepared statements cache
    this.preparedStatements = new Map();
  }

  async initialize() {
    try {
      this.pool = new Pool(this.connectionConfig);

      // Optimized event handlers
      this.pool.on('connect', (client) => {
        this.isConnected = true;
        this.metrics.totalConnections++;

        // Set optimized session parameters
        client.query(`
          SET search_path TO public;
          SET timezone TO 'UTC';
          SET statement_timeout TO '30s';
          SET lock_timeout TO '5s';
          SET idle_in_transaction_session_timeout TO '60s';
        `).catch(err => console.warn('Session optimization failed:', err.message));
      });

      this.pool.on('error', (err) => {
        this.metrics.errors++;
        logger.dbError('Pool error', err, {
          poolStats: {
            totalClients: this.pool?.totalCount || 0,
            idleClients: this.pool?.idleCount || 0,
            waitingClients: this.pool?.waitingCount || 0
          }
        });
      });

      // Test connection with optimized query
      await this.testConnection();
      logger.info('Database connected successfully');

      // Initialize database schema and sample data
      const initializer = new DatabaseInitializer(this.pool);
      await initializer.initialize();

      return this.pool;
    } catch (error) {
      logger.dbError('Database initialization failed', error);
      throw error;
    }
  }

  async testConnection() {
    const startTime = process.hrtime.bigint();
    try {
      const result = await this.pool.query('SELECT 1 as status, NOW() as timestamp');
      const endTime = process.hrtime.bigint();
      const queryTime = Number(endTime - startTime) / 1000000; // Convert to ms

      this.updateMetrics(queryTime);
      return result.rows[0];
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * High-performance query method with metrics and prepared statements
   */
  async query(text, params = []) {
    const startTime = process.hrtime.bigint();
    this.metrics.totalQueries++;

    try {
      const result = await this.pool.query(text, params);
      const endTime = process.hrtime.bigint();
      const queryTime = Number(endTime - startTime) / 1000000;

      this.updateMetrics(queryTime);
      
      // Log slow queries
      if (queryTime > 1000) {
        logger.performance('Slow database query', queryTime, {
          query: text.substring(0, 100),
          params: params.length,
          cause: 'SlowQuery'
        });
      }
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.dbError('Query execution failed', error, {
        query: text.substring(0, 100),
        params: params.length,
        queryTime: Number(process.hrtime.bigint() - startTime) / 1000000
      });
      throw error;
    }
  }

  /**
   * Optimized transaction wrapper with automatic rollback
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    const startTime = process.hrtime.bigint();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');

      const endTime = process.hrtime.bigint();
      const queryTime = Number(endTime - startTime) / 1000000;
      this.updateMetrics(queryTime);

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.metrics.errors++;
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Batch query execution for improved performance
   */
  async batchQuery(queries) {
    const client = await this.pool.connect();
    const results = [];
    const startTime = process.hrtime.bigint();

    try {
      await client.query('BEGIN');

      for (const { text, params } of queries) {
        const result = await client.query(text, params);
        results.push(result);
      }

      await client.query('COMMIT');

      const endTime = process.hrtime.bigint();
      const queryTime = Number(endTime - startTime) / 1000000;
      this.updateMetrics(queryTime);

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      this.metrics.errors++;
      throw error;
    } finally {
      client.release();
    }
  }

  updateMetrics(queryTime) {
    this.metrics.avgQueryTime = (
      (this.metrics.avgQueryTime * (this.metrics.totalQueries - 1) + queryTime) /
      this.metrics.totalQueries
    );
  }

  getMetrics() {
    return {
      ...this.metrics,
      poolStats: {
        totalClients: this.pool?.totalCount || 0,
        idleClients: this.pool?.idleCount || 0,
        waitingClients: this.pool?.waitingCount || 0
      },
      isConnected: this.isConnected
    };
  }

  getConnectionStats() {
    return this.getMetrics();
  }

  async healthCheck() {
    try {
      const result = await this.query(`
        SELECT 
          current_database() as database,
          current_user as user,
          version() as version,
          NOW() as timestamp,
          pg_database_size(current_database()) as size_bytes
      `);

      return {
        status: 'healthy',
        ...result.rows[0],
        metrics: this.getMetrics()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        metrics: this.getMetrics()
      };
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database connections closed');
    }
  }

}

// Create singleton instance for optimal resource usage
const databaseManager = new DatabaseManager();

// Export both the class and the singleton instance
module.exports = {
  DatabaseManager,
  db: databaseManager,
  default: databaseManager
};
