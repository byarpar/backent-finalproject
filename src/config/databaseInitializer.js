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
        DROP TABLE IF EXISTS user_favorites CASCADE;
        DROP TABLE IF EXISTS discussions CASCADE;
        DROP TABLE IF EXISTS search_history CASCADE;
        DROP TABLE IF EXISTS audit_logs CASCADE;
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
          account_status VARCHAR(50) DEFAULT 'active' CHECK (account_status IN ('active', 'pending_deletion', 'anonymized')),
          email_verified BOOLEAN DEFAULT false,
          email_verification_code VARCHAR(10),
          email_verification_expires TIMESTAMP WITH TIME ZONE,
          bio TEXT,
          location VARCHAR(255),
          native_language VARCHAR(100),
          google_id VARCHAR(255) UNIQUE,
          oauth_provider VARCHAR(50),
          last_login TIMESTAMP WITH TIME ZONE,
          profile_photo_url TEXT,
          deleted_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create discussions table
      await client.query(`
        CREATE TABLE discussions (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          category VARCHAR(50) DEFAULT 'general' CHECK (category IN ('general','javascript','python','java','cpp','csharp','php','go','rust','other')),
          author_id UUID REFERENCES users(id),
          tags TEXT[] DEFAULT '{}',
          images JSONB,
          is_pinned BOOLEAN DEFAULT false,
          is_locked BOOLEAN DEFAULT false,
          vote_count INTEGER DEFAULT 0,
          upvotes INTEGER DEFAULT 0,
          downvotes INTEGER DEFAULT 0,
          views_count INTEGER DEFAULT 0,
          answers_count INTEGER DEFAULT 0,
          last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create tags table (source of truth for tag metadata)
      await client.query(`
        CREATE TABLE tags (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) UNIQUE NOT NULL,
          slug VARCHAR(100) UNIQUE NOT NULL,
          usage_count INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

      'CREATE INDEX idx_words_english ON words USING gin(to_tsvector(\'english\', english))',
      'CREATE INDEX idx_words_lisu ON words USING gin(to_tsvector(\'english\', lisu))',
      'CREATE INDEX idx_words_part_of_speech ON words(part_of_speech)',
      'CREATE INDEX idx_words_created_by ON words(created_by)',
      'CREATE INDEX idx_words_created_at ON words(created_at)',

      'CREATE INDEX idx_word_categories_name ON word_categories(name)',
      'CREATE INDEX idx_word_category_mappings_word ON word_category_mappings(word_id)',
      'CREATE INDEX idx_word_category_mappings_category ON word_category_mappings(category_id)',

      'CREATE INDEX idx_etymology_word_id ON etymology(word_id)',
      'CREATE INDEX idx_etymology_created_by ON etymology(created_by)',

      'CREATE INDEX idx_discussions_category ON discussions(category)',
      'CREATE INDEX idx_discussions_author ON discussions(author_id)',
      'CREATE INDEX idx_discussions_created_at ON discussions(created_at)',
      'CREATE INDEX idx_tags_slug ON tags(slug)',
      'CREATE INDEX idx_tags_usage_count ON tags(usage_count)',

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