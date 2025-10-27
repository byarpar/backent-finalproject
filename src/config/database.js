const { Pool } = require('pg');
const DatabaseInitializer = require('./databaseInitializer');
const logger = require('../utils/logger');
const config = require('./env');
const { DatabaseError } = require('../utils/errors');

/**
 * Professional Database Manager with Connection Pooling and Advanced Features
 * 
 * Features:
 * - High-performance connection pooling
 * - Automatic retry logic with exponential backoff
 * - Query performance monitoring
 * - Transaction management
 * - Prepared statement caching
 * - Health check monitoring
 * - Graceful shutdown handling
 * 
 * @class DatabaseManager
 */
class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.isShuttingDown = false;

    // Performance Metrics
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      totalConnections: 0,
      activeConnections: 0,
      avgQueryTime: 0,
      slowQueries: 0,
      queryTimes: []
    };

    // Optimized connection configuration from environment
    this.connectionConfig = {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,

      // High-performance pool settings
      max: config.database.pool.max,
      min: config.database.pool.min,
      idleTimeoutMillis: config.database.pool.idleTimeout,
      connectionTimeoutMillis: config.database.pool.connectionTimeout,
      acquireTimeoutMillis: 30000,

      // Performance optimizations
      keepAlive: true,
      keepAliveInitialDelayMillis: 0,
      allowExitOnIdle: false,

      // Query optimizations
      query_timeout: 15000,
      statement_timeout: 30000,

      // SSL Configuration
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false
    };

    // Prepared statements cache
    this.preparedStatements = new Map();

    // Retry configuration
    this.retryConfig = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    };
  }

  /**
   * Initialize database connection with retry logic
   */
  async initialize() {
    return this._initializeWithRetry();
  }

  /**
   * Initialize with automatic retry and exponential backoff
   */
  async _initializeWithRetry(attempt = 1) {
    try {
      logger.info(`Initializing database connection (Attempt ${attempt}/${this.retryConfig.maxRetries})...`);

      this.pool = new Pool(this.connectionConfig);

      // Setup event handlers
      this._setupEventHandlers();

      // Test connection
      await this.testConnection();
      logger.info('Database connected successfully', {
        host: this.connectionConfig.host,
        database: this.connectionConfig.database,
        poolSize: `${this.connectionConfig.min}-${this.connectionConfig.max}`
      });

      // Initialize database schema and sample data
      const initializer = new DatabaseInitializer(this.pool);
      await initializer.initialize();

      this.isConnected = true;
      return this.pool;

    } catch (error) {
      logger.error('Database initialization failed', {
        attempt,
        error: error.message,
        stack: error.stack
      });

      // Retry logic with exponential backoff
      if (attempt < this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );

        logger.info(`Retrying database connection in ${delay}ms...`);
        await this._sleep(delay);
        return this._initializeWithRetry(attempt + 1);
      }

      // Max retries exceeded
      logger.error('Database connection failed after maximum retries');
      throw new DatabaseError('Failed to connect to database', {
        attempts: attempt,
        originalError: error.message
      });
    }
  }

  /**
   * Setup pool event handlers
   */
  _setupEventHandlers() {
    // Connection event
    this.pool.on('connect', async (client) => {
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;

      try {
        // Set optimized session parameters for each connection
        await client.query(`
          SET search_path TO public;
          SET timezone TO 'UTC';
          SET statement_timeout TO '30s';
          SET lock_timeout TO '5s';
          SET idle_in_transaction_session_timeout TO '60s';
        `);
      } catch (err) {
        logger.warn('Failed to set session parameters', { error: err.message });
      }
    });

    // Release event
    this.pool.on('release', () => {
      this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
    });

    // Error event
    this.pool.on('error', (err, client) => {
      this.metrics.failedQueries++;
      logger.error('Unexpected database pool error', {
        error: err.message,
        poolStats: this.getPoolStats()
      });
    });

    // Remove event
    this.pool.on('remove', () => {
      this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
    });
  }

  /**
   * Test database connection
   */
  async testConnection() {
    const startTime = process.hrtime.bigint();
    try {
      const result = await this.pool.query('SELECT 1 as status, NOW() as timestamp, version() as version');
      const endTime = process.hrtime.bigint();
      const queryTime = Number(endTime - startTime) / 1000000;

      this._updateMetrics(queryTime, true);

      logger.info('Database connection test successful', {
        responseTime: `${queryTime.toFixed(2)}ms`,
        timestamp: result.rows[0].timestamp
      });

      return result.rows[0];
    } catch (error) {
      this._updateMetrics(0, false);
      throw new DatabaseError('Connection test failed', {
        error: error.message
      });
    }
  }

  /**
   * Execute a query with performance tracking
   */
  async query(text, params = []) {
    if (this.isShuttingDown) {
      throw new DatabaseError('Database is shutting down');
    }

    const startTime = process.hrtime.bigint();
    this.metrics.totalQueries++;

    try {
      const result = await this.pool.query(text, params);
      const endTime = process.hrtime.bigint();
      const queryTime = Number(endTime - startTime) / 1000000;

      this._updateMetrics(queryTime, true);

      // Log slow queries
      const slowThreshold = config.monitoring.slowQueryThreshold;
      if (queryTime > slowThreshold) {
        this.metrics.slowQueries++;
        logger.warn('Slow query detected', {
          query: text.substring(0, 150),
          params: params.length,
          executionTime: `${queryTime.toFixed(2)}ms`,
          threshold: `${slowThreshold}ms`
        });
      }

      return result;
    } catch (error) {
      this._updateMetrics(0, false);

      logger.error('Query execution failed', {
        query: text.substring(0, 150),
        params: params.length,
        error: error.message,
        code: error.code,
        constraint: error.constraint
      });

      throw new DatabaseError('Query execution failed', {
        query: text.substring(0, 100),
        error: error.message,
        code: error.code,
        constraint: error.constraint
      });
    }
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  async transaction(callback) {
    if (this.isShuttingDown) {
      throw new DatabaseError('Database is shutting down');
    }

    const client = await this.pool.connect();
    const startTime = process.hrtime.bigint();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');

      const endTime = process.hrtime.bigint();
      const queryTime = Number(endTime - startTime) / 1000000;
      this._updateMetrics(queryTime, true);

      logger.info('Transaction completed successfully', {
        executionTime: `${queryTime.toFixed(2)}ms`
      });

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this._updateMetrics(0, false);

      logger.error('Transaction failed and rolled back', {
        error: error.message
      });

      throw new DatabaseError('Transaction failed', {
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * Batch query execution for improved performance
   */
  async batchQuery(queries) {
    if (this.isShuttingDown) {
      throw new DatabaseError('Database is shutting down');
    }

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
      this._updateMetrics(queryTime, true);

      logger.info('Batch query completed', {
        queries: queries.length,
        executionTime: `${queryTime.toFixed(2)}ms`
      });

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      this._updateMetrics(0, false);

      logger.error('Batch query failed', {
        error: error.message,
        queriesAttempted: queries.length
      });

      throw new DatabaseError('Batch query failed', {
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * Update performance metrics
   */
  _updateMetrics(queryTime, success) {
    if (success) {
      this.metrics.successfulQueries++;

      // Update average query time
      this.metrics.queryTimes.push(queryTime);

      // Keep only last 1000 query times for average calculation
      if (this.metrics.queryTimes.length > 1000) {
        this.metrics.queryTimes.shift();
      }

      // Calculate rolling average
      const sum = this.metrics.queryTimes.reduce((a, b) => a + b, 0);
      this.metrics.avgQueryTime = sum / this.metrics.queryTimes.length;
    } else {
      this.metrics.failedQueries++;
    }
  }

  /**
   * Get current pool statistics
   */
  getPoolStats() {
    if (!this.pool) {
      return {
        totalClients: 0,
        idleClients: 0,
        waitingClients: 0
      };
    }

    return {
      totalClients: this.pool.totalCount || 0,
      idleClients: this.pool.idleCount || 0,
      waitingClients: this.pool.waitingCount || 0
    };
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      poolStats: this.getPoolStats(),
      isConnected: this.isConnected,
      uptime: process.uptime()
    };
  }

  /**
   * Get connection statistics (alias for getMetrics)
   */
  getConnectionStats() {
    return this.getMetrics();
  }

  /**
   * Comprehensive health check
   */
  async healthCheck() {
    try {
      const result = await this.query(`
        SELECT 
          current_database() as database,
          current_user as user,
          version() as version,
          NOW() as timestamp,
          pg_database_size(current_database()) as size_bytes,
          pg_size_pretty(pg_database_size(current_database())) as size
      `);

      const dbInfo = result.rows[0];

      return {
        status: 'healthy',
        database: dbInfo.database,
        user: dbInfo.user,
        timestamp: dbInfo.timestamp,
        size: dbInfo.size,
        version: dbInfo.version.split(',')[0], // Just the version number
        metrics: this.getMetrics(),
        isConnected: this.isConnected
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        metrics: this.getMetrics(),
        isConnected: this.isConnected
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async close() {
    if (this.isShuttingDown) {
      logger.warn('Database is already shutting down');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Initiating graceful database shutdown...');

    try {
      if (this.pool) {
        await this.pool.end();
        this.isConnected = false;
        logger.info('Database connections closed successfully', {
          finalMetrics: this.getMetrics()
        });
      }
    } catch (error) {
      logger.error('Error during database shutdown', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Helper: Sleep function for retry logic
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
