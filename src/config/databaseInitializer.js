const { Pool } = require('pg');
const logger = require('../utils/logger');

/**
 * Database Initializer
 * Automatically creates database schema and populates initial data
 */
class DatabaseInitializer {
  constructor(pool) {
    this.pool = pool;
  }

  async initialize() {
    try {
      logger.info('Starting database initialization...');

      // Check if tables already exist
      const tablesExist = await this.checkTablesExist();

      if (!tablesExist) {
        logger.info('Creating database schema...');
        await this.createSchema();
        logger.info('Database schema created successfully');

        logger.info('Creating admin user...');
        await this.createAdminUser();
        logger.info('Admin user created successfully');
      } else {
        logger.info('Database tables already exist, skipping initialization');

        // Check if admin user exists, create if not
        const adminExists = await this.checkAdminExists();
        if (!adminExists) {
          logger.info('Admin user not found, creating admin user...');
          await this.createAdminUser();
          logger.info('Admin user created successfully');
        }
      }

      logger.info('Database initialization completed');

    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async checkTablesExist() {
    try {
      const client = await this.pool.connect();
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'users'
        );
      `);
      client.release();
      return result.rows[0].exists;
    } catch (error) {
      logger.error('Error checking if tables exist:', error);
      return false;
    }
  }

  async checkAdminExists() {
    try {
      const client = await this.pool.connect();
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM users 
          WHERE role = 'admin' OR username = 'admin'
        );
      `);
      client.release();
      return result.rows[0].exists;
    } catch (error) {
      logger.error('Error checking if admin exists:', error);
      return false;
    }
  }

  async createAdminUser() {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Insert admin user with secure hashed password
      // Password: LisuDict@2025!Admin (please change this after first login)
      await client.query(`
        INSERT INTO users (email, password_hash, username, full_name, role, bio, location, native_language, is_active) 
        VALUES 
        ('admin@englishlisudict.com', '$2a$12$/UvN927dgaMuyfyTNvDW6ueqpI1FkGZ1pa1nqgo8kAxstx1kkWeFy', 'admin', 'Admin User', 'admin', 'System administrator for the English-Lisu Dictionary', 'Online', 'English', true)
        ON CONFLICT (email) DO NOTHING
      `);

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createSchema() {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Enable UUID extension
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

      // Drop existing tables if they exist (for development)
      await client.query(`
        DROP TABLE IF EXISTS user_sessions CASCADE;
        DROP TABLE IF EXISTS user_favorites CASCADE;
        DROP TABLE IF EXISTS discussions CASCADE;
        DROP TABLE IF EXISTS word_etymology CASCADE;
        DROP TABLE IF EXISTS word_category_mappings CASCADE;
        DROP TABLE IF EXISTS word_categories CASCADE;
        DROP TABLE IF EXISTS search_history CASCADE;
        DROP TABLE IF EXISTS audit_logs CASCADE;
        DROP TABLE IF EXISTS etymology CASCADE;
        DROP TABLE IF EXISTS words CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
      `);

      // Create users table
      await client.query(`
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          username VARCHAR(100) UNIQUE,
          full_name VARCHAR(200),
          role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
          is_active BOOLEAN DEFAULT true,
          bio TEXT,
          location VARCHAR(255),
          native_language VARCHAR(100),
          last_login TIMESTAMP WITH TIME ZONE,
          profile_photo_url VARCHAR(500),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create words table
      await client.query(`
        CREATE TABLE words (
          id SERIAL PRIMARY KEY,
          english_word VARCHAR(255) NOT NULL,
          lisu_word VARCHAR(255) NOT NULL,
          english_definition TEXT,
          lisu_definition TEXT,
          part_of_speech VARCHAR(50),
          pronunciation_english VARCHAR(255),
          pronunciation_lisu VARCHAR(255),
          examples JSONB DEFAULT '[]',
          tags JSONB DEFAULT '[]',
          difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
          frequency_score INTEGER DEFAULT 0,
          is_verified BOOLEAN DEFAULT false,
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create word categories table
      await client.query(`
        CREATE TABLE word_categories (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          color VARCHAR(7),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create word category mappings table
      await client.query(`
        CREATE TABLE word_category_mappings (
          id SERIAL PRIMARY KEY,
          word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
          category_id INTEGER REFERENCES word_categories(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(word_id, category_id)
        )
      `);

      // Create etymology table
      await client.query(`
        CREATE TABLE etymology (
          id SERIAL PRIMARY KEY,
          word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
          origin_language VARCHAR(100),
          etymology_text TEXT,
          historical_development TEXT,
          first_recorded_use VARCHAR(100),
          related_words JSONB DEFAULT '[]',
          sources JSONB DEFAULT '[]',
          notes TEXT,
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create word etymology linking table
      await client.query(`
        CREATE TABLE word_etymology (
          id SERIAL PRIMARY KEY,
          word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
          etymology_id INTEGER REFERENCES etymology(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(word_id, etymology_id)
        )
      `);

      // Create discussions table
      await client.query(`
        CREATE TABLE discussions (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          category VARCHAR(50) DEFAULT 'general',
          author_id UUID REFERENCES users(id),
          is_pinned BOOLEAN DEFAULT false,
          is_locked BOOLEAN DEFAULT false,
          views_count INTEGER DEFAULT 0,
          last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create user favorites table
      await client.query(`
        CREATE TABLE user_favorites (
          id SERIAL PRIMARY KEY,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, word_id)
        )
      `);

      // Create user sessions table
      await client.query(`
        CREATE TABLE user_sessions (
          id SERIAL PRIMARY KEY,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          session_token VARCHAR(500) UNIQUE NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create search history table
      await client.query(`
        CREATE TABLE search_history (
          id SERIAL PRIMARY KEY,
          user_id UUID REFERENCES users(id),
          search_query VARCHAR(500) NOT NULL,
          language VARCHAR(20) DEFAULT 'auto',
          results_count INTEGER DEFAULT 0,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create audit logs table
      await client.query(`
        CREATE TABLE audit_logs (
          id SERIAL PRIMARY KEY,
          user_id UUID REFERENCES users(id),
          action VARCHAR(100) NOT NULL,
          table_name VARCHAR(100),
          record_id INTEGER,
          old_values JSONB,
          new_values JSONB,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.createIndexes(client);
      await this.createTriggers(client);

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createIndexes(client) {
    // Performance indexes
    const indexes = [
      'CREATE INDEX idx_users_email ON users(email)',
      'CREATE INDEX idx_users_username ON users(username)',
      'CREATE INDEX idx_users_role ON users(role)',
      'CREATE INDEX idx_users_active ON users(is_active)',

      'CREATE INDEX idx_words_english ON words USING gin(to_tsvector(\'english\', english_word))',
      'CREATE INDEX idx_words_lisu ON words USING gin(to_tsvector(\'english\', lisu_word))',
      'CREATE INDEX idx_words_definition ON words USING gin(to_tsvector(\'english\', english_definition))',
      'CREATE INDEX idx_words_created_at ON words(created_at)',
      'CREATE INDEX idx_words_frequency ON words(frequency_score DESC)',
      'CREATE INDEX idx_words_created_by ON words(created_by)',

      'CREATE INDEX idx_word_categories_name ON word_categories(name)',
      'CREATE INDEX idx_word_category_mappings_word ON word_category_mappings(word_id)',
      'CREATE INDEX idx_word_category_mappings_category ON word_category_mappings(category_id)',

      'CREATE INDEX idx_etymology_word_id ON etymology(word_id)',
      'CREATE INDEX idx_etymology_origin ON etymology(origin_language)',
      'CREATE INDEX idx_etymology_created_by ON etymology(created_by)',

      'CREATE INDEX idx_discussions_category ON discussions(category)',
      'CREATE INDEX idx_discussions_author ON discussions(author_id)',
      'CREATE INDEX idx_discussions_created_at ON discussions(created_at)',

      'CREATE INDEX idx_user_favorites_user ON user_favorites(user_id)',
      'CREATE INDEX idx_user_favorites_word ON user_favorites(word_id)',

      'CREATE INDEX idx_search_history_user_id ON search_history(user_id)',
      'CREATE INDEX idx_search_history_created_at ON search_history(created_at)',

      'CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id)',
      'CREATE INDEX idx_audit_logs_action ON audit_logs(action)',
      'CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at)'
    ];

    for (const indexQuery of indexes) {
      try {
        await client.query(indexQuery);
      } catch (error) {
        // Index might already exist, continue
        logger.warn(`Index creation warning: ${error.message}`);
      }
    }
  }

  async createTriggers(client) {
    // Update trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    // Create triggers
    const triggers = [
      'CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      'CREATE TRIGGER update_words_updated_at BEFORE UPDATE ON words FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      'CREATE TRIGGER update_etymology_updated_at BEFORE UPDATE ON etymology FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      'CREATE TRIGGER update_discussions_updated_at BEFORE UPDATE ON discussions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()'
    ];

    for (const triggerQuery of triggers) {
      try {
        await client.query(triggerQuery);
      } catch (error) {
        // Trigger might already exist, continue
        logger.warn(`Trigger creation warning: ${error.message}`);
      }
    }
  }
}

module.exports = DatabaseInitializer;