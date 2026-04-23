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
        logger.info('Database tables already exist, running migrations...');

        // Always run migrations to add missing tables/columns on existing DBs
        await this.runMigrations();
        logger.info('Migrations completed');

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

  /**
   * Run incremental migrations for existing databases.
   * All statements use IF NOT EXISTS / DO NOTHING so they are idempotent.
   */
  async runMigrations() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

      // ── users table: fix nullable password_hash, add missing columns ──────
      await client.query(`
        ALTER TABLE users
          ALTER COLUMN password_hash DROP NOT NULL
      `).catch(() => { }); // already nullable → ignore

      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS online_status VARCHAR(20) DEFAULT 'offline'
      `);
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)
      `);
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50)
      `);
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(50) DEFAULT 'active'
          CHECK (account_status IN ('active','pending_deletion','anonymized'))
      `).catch(() => { });
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_code VARCHAR(10)
      `);
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP WITH TIME ZONE
      `);

      // Unique constraint on google_id (safe to add if not there)
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE users ADD CONSTRAINT users_google_id_key UNIQUE (google_id);
        EXCEPTION WHEN duplicate_table THEN NULL;
        END $$
      `);

      // ── answers ────────────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS answers (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          discussion_id INTEGER REFERENCES discussions(id) ON DELETE CASCADE,
          author_id UUID REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          images JSONB DEFAULT '[]',
          replies JSONB DEFAULT '[]',
          reply_count INTEGER DEFAULT 0,
          vote_count INTEGER DEFAULT 0,
          upvotes INTEGER DEFAULT 0,
          downvotes INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── answer_votes ───────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS answer_votes (
          answer_id UUID REFERENCES answers(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('up','down')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (answer_id, user_id)
        )
      `);

      // ── discussion_votes ───────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS discussion_votes (
          discussion_id INTEGER REFERENCES discussions(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('up','down')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (discussion_id, user_id)
        )
      `);

      // ── conversations ──────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          participant1_id UUID REFERENCES users(id) ON DELETE CASCADE,
          participant2_id UUID REFERENCES users(id) ON DELETE CASCADE,
          last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (participant1_id, participant2_id)
        )
      `);

      // ── messages ───────────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
          sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── notifications ──────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL DEFAULT 'system',
          title TEXT,
          message TEXT,
          related_id UUID,
          related_type VARCHAR(50),
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── search_history ─────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS search_history (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          query TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── words (dictionary core table) ──────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS words (
          id SERIAL PRIMARY KEY,
          english VARCHAR(500) NOT NULL,
          lisu VARCHAR(500),
          part_of_speech VARCHAR(100),
          definition TEXT,
          example_sentence TEXT,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── word_categories ────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS word_categories (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── word_category_mappings ─────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS word_category_mappings (
          word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
          category_id UUID REFERENCES word_categories(id) ON DELETE CASCADE,
          PRIMARY KEY (word_id, category_id)
        )
      `);

      // ── missing indexes (idempotent) ────────────────────────────────────────
      const idxStatements = [
        `CREATE INDEX IF NOT EXISTS idx_answers_discussion ON answers(discussion_id)`,
        `CREATE INDEX IF NOT EXISTS idx_answers_author ON answers(author_id)`,
        `CREATE INDEX IF NOT EXISTS idx_answer_votes_answer ON answer_votes(answer_id)`,
        `CREATE INDEX IF NOT EXISTS idx_discussion_votes_discussion ON discussion_votes(discussion_id)`,
        `CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON conversations(participant1_id)`,
        `CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON conversations(participant2_id)`,
        `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`,
        `CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`,
        `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read)`,
        `CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_words_english ON words USING gin(to_tsvector('english', english))`,
        `CREATE INDEX IF NOT EXISTS idx_words_lisu ON words USING gin(to_tsvector('english', COALESCE(lisu, '')))`,
      ];
      for (const stmt of idxStatements) {
        await client.query(stmt).catch(e => logger.warn(`Index migration warning: ${e.message}`));
      }

      // ── updated_at trigger on new tables ───────────────────────────────────
      const triggerTables = ['answers', 'words'];
      for (const tbl of triggerTables) {
        await client.query(`
          DO $$ BEGIN
            CREATE TRIGGER update_${tbl}_updated_at
              BEFORE UPDATE ON ${tbl}
              FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$
        `).catch(e => logger.warn(`Trigger migration warning (${tbl}): ${e.message}`));
      }

      // ── login_attempts (brute-force / Fail2Ban persistence) ───────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS login_attempts (
          ip_address         VARCHAR(45)  PRIMARY KEY,
          attempt_count      INTEGER      NOT NULL DEFAULT 0,
          first_fail_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          banned_until       TIMESTAMP WITH TIME ZONE,
          last_attempt_type  VARCHAR(20)  DEFAULT 'login' CHECK (last_attempt_type IN ('login','register')),
          last_email         VARCHAR(255),
          updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_login_attempts_banned_until ON login_attempts(banned_until)
      `);
      // Add new columns to existing login_attempts tables (idempotent)
      await client.query(`
        ALTER TABLE login_attempts
          ADD COLUMN IF NOT EXISTS last_attempt_type VARCHAR(20) DEFAULT 'login'
            CHECK (last_attempt_type IN ('login','register'))
      `).catch(() => { });
      await client.query(`
        ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS last_email VARCHAR(255)
      `).catch(() => { });
      // ── users: add IP tracking columns ────────────────────────────────────
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45)
      `).catch(() => { });
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_ip VARCHAR(45)
      `).catch(() => { });
      await client.query('COMMIT');
      logger.info('Database migrations applied successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Migration failed:', error);
      throw error;
    } finally {
      client.release();
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

      // Drop all tables in dependency order
      await client.query(`
        DROP TABLE IF EXISTS user_favorites CASCADE;
        DROP TABLE IF EXISTS word_category_mappings CASCADE;
        DROP TABLE IF EXISTS word_categories CASCADE;
        DROP TABLE IF EXISTS words CASCADE;
        DROP TABLE IF EXISTS answer_votes CASCADE;
        DROP TABLE IF EXISTS answers CASCADE;
        DROP TABLE IF EXISTS discussion_votes CASCADE;
        DROP TABLE IF EXISTS discussions CASCADE;
        DROP TABLE IF EXISTS messages CASCADE;
        DROP TABLE IF EXISTS conversations CASCADE;
        DROP TABLE IF EXISTS notifications CASCADE;
        DROP TABLE IF EXISTS search_history CASCADE;
        DROP TABLE IF EXISTS tags CASCADE;
        DROP TABLE IF EXISTS audit_logs CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
      `);

      // ── users ──────────────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255),
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
          online_status VARCHAR(20) DEFAULT 'offline',
          google_id VARCHAR(255) UNIQUE,
          oauth_provider VARCHAR(50),
          last_login TIMESTAMP WITH TIME ZONE,
          last_login_ip VARCHAR(45),
          registered_ip VARCHAR(45),
          profile_photo_url TEXT,
          deleted_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── discussions ────────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE discussions (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          category VARCHAR(50) DEFAULT 'general' CHECK (category IN ('general','javascript','python','java','cpp','csharp','php','go','rust','other')),
          author_id UUID REFERENCES users(id) ON DELETE SET NULL,
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

      // ── discussion_votes ───────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE discussion_votes (
          discussion_id INTEGER REFERENCES discussions(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('up','down')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (discussion_id, user_id)
        )
      `);

      // ── answers ────────────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE answers (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          discussion_id INTEGER REFERENCES discussions(id) ON DELETE CASCADE,
          author_id UUID REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          images JSONB DEFAULT '[]',
          replies JSONB DEFAULT '[]',
          reply_count INTEGER DEFAULT 0,
          vote_count INTEGER DEFAULT 0,
          upvotes INTEGER DEFAULT 0,
          downvotes INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── answer_votes ───────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE answer_votes (
          answer_id UUID REFERENCES answers(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('up','down')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (answer_id, user_id)
        )
      `);

      // ── tags ───────────────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE tags (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) UNIQUE NOT NULL,
          slug VARCHAR(100) UNIQUE NOT NULL,
          usage_count INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── words ──────────────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE words (
          id SERIAL PRIMARY KEY,
          english VARCHAR(500) NOT NULL,
          lisu VARCHAR(500),
          part_of_speech VARCHAR(100),
          definition TEXT,
          example_sentence TEXT,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── word_categories ────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE word_categories (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── word_category_mappings ─────────────────────────────────────────────
      await client.query(`
        CREATE TABLE word_category_mappings (
          word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
          category_id UUID REFERENCES word_categories(id) ON DELETE CASCADE,
          PRIMARY KEY (word_id, category_id)
        )
      `);

      // ── user_favorites ─────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE user_favorites (
          id SERIAL PRIMARY KEY,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, word_id)
        )
      `);

      // ── conversations ──────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE conversations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          participant1_id UUID REFERENCES users(id) ON DELETE CASCADE,
          participant2_id UUID REFERENCES users(id) ON DELETE CASCADE,
          last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (participant1_id, participant2_id)
        )
      `);

      // ── messages ───────────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
          sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── notifications ──────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE notifications (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL DEFAULT 'system',
          title TEXT,
          message TEXT,
          related_id UUID,
          related_type VARCHAR(50),
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── search_history ─────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE search_history (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          query TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── audit_logs ─────────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE audit_logs (
          id SERIAL PRIMARY KEY,
          user_id UUID REFERENCES users(id),
          action VARCHAR(100) NOT NULL,
          table_name VARCHAR(100),
          record_id VARCHAR(100),
          old_values JSONB,
          new_values JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.createIndexes(client);
      await this.createTriggers(client);

      // ── login_attempts ─────────────────────────────────────────────────────
      await client.query(`
        CREATE TABLE IF NOT EXISTS login_attempts (
          ip_address         VARCHAR(45)  PRIMARY KEY,
          attempt_count      INTEGER      NOT NULL DEFAULT 0,
          first_fail_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          banned_until       TIMESTAMP WITH TIME ZONE,
          last_attempt_type  VARCHAR(20)  DEFAULT 'login' CHECK (last_attempt_type IN ('login','register')),
          last_email         VARCHAR(255),
          updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_login_attempts_banned_until ON login_attempts(banned_until)
      `);
      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createIndexes(client) {
    // Performance indexes (all use IF NOT EXISTS so they're idempotent)
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
      'CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)',

      'CREATE INDEX IF NOT EXISTS idx_discussions_category ON discussions(category)',
      'CREATE INDEX IF NOT EXISTS idx_discussions_author ON discussions(author_id)',
      'CREATE INDEX IF NOT EXISTS idx_discussions_created_at ON discussions(created_at)',

      'CREATE INDEX IF NOT EXISTS idx_answers_discussion ON answers(discussion_id)',
      'CREATE INDEX IF NOT EXISTS idx_answers_author ON answers(author_id)',

      'CREATE INDEX IF NOT EXISTS idx_answer_votes_answer ON answer_votes(answer_id)',
      'CREATE INDEX IF NOT EXISTS idx_discussion_votes_discussion ON discussion_votes(discussion_id)',

      'CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug)',
      'CREATE INDEX IF NOT EXISTS idx_tags_usage_count ON tags(usage_count)',

      `CREATE INDEX IF NOT EXISTS idx_words_english ON words USING gin(to_tsvector('english', english))`,
      `CREATE INDEX IF NOT EXISTS idx_words_lisu ON words USING gin(to_tsvector('english', COALESCE(lisu, '')))`,
      'CREATE INDEX IF NOT EXISTS idx_words_part_of_speech ON words(part_of_speech)',
      'CREATE INDEX IF NOT EXISTS idx_words_created_by ON words(created_by)',
      'CREATE INDEX IF NOT EXISTS idx_words_created_at ON words(created_at)',

      'CREATE INDEX IF NOT EXISTS idx_word_categories_name ON word_categories(name)',
      'CREATE INDEX IF NOT EXISTS idx_word_category_mappings_word ON word_category_mappings(word_id)',
      'CREATE INDEX IF NOT EXISTS idx_word_category_mappings_category ON word_category_mappings(category_id)',

      'CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_user_favorites_word ON user_favorites(word_id)',

      'CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON conversations(participant1_id)',
      'CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON conversations(participant2_id)',

      'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)',

      'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read)',

      'CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at)',

      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)'
    ];

    for (const indexQuery of indexes) {
      try {
        await client.query(indexQuery);
      } catch (error) {
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

    // Create triggers (skip duplicates silently)
    const triggerTables = ['users', 'discussions', 'answers', 'words'];
    for (const tbl of triggerTables) {
      await client.query(`
        DO $$ BEGIN
          CREATE TRIGGER update_${tbl}_updated_at
            BEFORE UPDATE ON ${tbl}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `).catch(e => logger.warn(`Trigger creation warning (${tbl}): ${e.message}`));
    }
  }
}

module.exports = DatabaseInitializer;