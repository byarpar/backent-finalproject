-- ===============================================
-- English-Lisu Dictionary Database Schema
-- Complete migration for English-Lisu Dictionary application
-- Created: 2025-09-20
-- ===============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===============================================
-- Users Table
-- ===============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active BOOLEAN DEFAULT true,
    dark_mode BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- ===============================================
-- Words Table
-- ===============================================
CREATE TABLE IF NOT EXISTS words (
    id SERIAL PRIMARY KEY,
    english_word VARCHAR(255) NOT NULL,
    lisu_translation TEXT NOT NULL,
    part_of_speech VARCHAR(50) CHECK (part_of_speech IN (
        'noun', 'verb', 'adjective', 'adverb', 'pronoun',
        'preposition', 'conjunction', 'interjection', 'article'
    )),
    definition TEXT,
    example_usage TEXT,
    phonetic VARCHAR(255),
    synonyms TEXT,
    antonyms TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for words table
CREATE INDEX IF NOT EXISTS idx_words_english_word ON words(english_word);
CREATE INDEX IF NOT EXISTS idx_words_lisu_translation ON words(lisu_translation);
CREATE INDEX IF NOT EXISTS idx_words_part_of_speech ON words(part_of_speech);
CREATE INDEX IF NOT EXISTS idx_words_created_by ON words(created_by);
CREATE INDEX IF NOT EXISTS idx_words_created_at ON words(created_at);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_words_english_search ON words USING gin(to_tsvector('english', english_word || ' ' || COALESCE(definition, '') || ' ' || COALESCE(example_usage, '')));
CREATE INDEX IF NOT EXISTS idx_words_lisu_search ON words USING gin(to_tsvector('simple', lisu_translation));

-- ===============================================
-- Etymology Table
-- ===============================================
CREATE TABLE IF NOT EXISTS etymology (
    id SERIAL PRIMARY KEY,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    origin TEXT,
    historical_development TEXT,
    first_recorded_date DATE,
    etymology_notes TEXT,
    linguistic_family VARCHAR(255),
    related_words TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for etymology table
CREATE INDEX IF NOT EXISTS idx_etymology_word_id ON etymology(word_id);
CREATE INDEX IF NOT EXISTS idx_etymology_linguistic_family ON etymology(linguistic_family);
CREATE INDEX IF NOT EXISTS idx_etymology_created_by ON etymology(created_by);
CREATE INDEX IF NOT EXISTS idx_etymology_created_at ON etymology(created_at);

-- ===============================================
-- Discussions Table
-- ===============================================
CREATE TABLE IF NOT EXISTS discussions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id INTEGER REFERENCES words(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) DEFAULT 'general' CHECK (category IN (
        'general', 'translation', 'pronunciation', 'etymology', 'usage', 'grammar'
    )),
    tags TEXT[], -- Array of tags
    is_featured BOOLEAN DEFAULT false,
    is_resolved BOOLEAN DEFAULT false,
    view_count INTEGER DEFAULT 0,
    images TEXT[], -- Array of image URLs/paths
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for discussions table
CREATE INDEX IF NOT EXISTS idx_discussions_word_id ON discussions(word_id);
CREATE INDEX IF NOT EXISTS idx_discussions_author_id ON discussions(author_id);
CREATE INDEX IF NOT EXISTS idx_discussions_category ON discussions(category);
CREATE INDEX IF NOT EXISTS idx_discussions_is_featured ON discussions(is_featured);
CREATE INDEX IF NOT EXISTS idx_discussions_is_resolved ON discussions(is_resolved);
CREATE INDEX IF NOT EXISTS idx_discussions_created_at ON discussions(created_at);
CREATE INDEX IF NOT EXISTS idx_discussions_tags ON discussions USING gin(tags);

-- Full-text search for discussions
CREATE INDEX IF NOT EXISTS idx_discussions_search ON discussions USING gin(to_tsvector('english', title || ' ' || content));

-- ===============================================
-- Discussion Answers Table
-- ===============================================
CREATE TABLE IF NOT EXISTS discussion_answers (
    id SERIAL PRIMARY KEY,
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    parent_answer_id INTEGER REFERENCES discussion_answers(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_accepted BOOLEAN DEFAULT false,
    images TEXT[], -- Array of image URLs/paths
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for discussion_answers table
CREATE INDEX IF NOT EXISTS idx_discussion_answers_discussion_id ON discussion_answers(discussion_id);
CREATE INDEX IF NOT EXISTS idx_discussion_answers_parent_answer_id ON discussion_answers(parent_answer_id);
CREATE INDEX IF NOT EXISTS idx_discussion_answers_author_id ON discussion_answers(author_id);
CREATE INDEX IF NOT EXISTS idx_discussion_answers_is_accepted ON discussion_answers(is_accepted);
CREATE INDEX IF NOT EXISTS idx_discussion_answers_created_at ON discussion_answers(created_at);



-- ===============================================
-- Search History Table
-- ===============================================
CREATE TABLE IF NOT EXISTS search_history (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    search_query VARCHAR(255) NOT NULL,
    search_type VARCHAR(50) DEFAULT 'basic' CHECK (search_type IN ('basic', 'advanced')),
    results_count INTEGER DEFAULT 0,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for search_history table
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_search_query ON search_history(search_query);
CREATE INDEX IF NOT EXISTS idx_search_history_search_type ON search_history(search_type);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at);

-- ===============================================
-- Audit Logs Table
-- ===============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    table_name VARCHAR(100),
    record_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for audit_logs table
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ===============================================
-- Triggers for updated_at timestamps
-- ===============================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables with updated_at column
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_words_updated_at 
    BEFORE UPDATE ON words 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_etymology_updated_at 
    BEFORE UPDATE ON etymology 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discussions_updated_at 
    BEFORE UPDATE ON discussions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discussion_answers_updated_at 
    BEFORE UPDATE ON discussion_answers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discussion_likes_updated_at 
    BEFORE UPDATE ON discussion_likes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_answer_likes_updated_at 
    BEFORE UPDATE ON answer_likes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===============================================
-- Views for commonly used queries
-- ===============================================

-- View for words with creator information
CREATE OR REPLACE VIEW words_with_creator AS
SELECT 
    w.*,
    u.name as creator_name,
    u.email as creator_email
FROM words w
LEFT JOIN users u ON w.created_by = u.id;

-- View for discussions with stats
CREATE OR REPLACE VIEW discussions_with_stats AS
SELECT 
    d.*,
    u.name as author_name,
    u.email as author_email,
    COALESCE(answer_count.answer_count, 0) as calculated_answer_count
FROM discussions d
LEFT JOIN users u ON d.author_id = u.id
LEFT JOIN (
    SELECT 
        discussion_id,
        COUNT(*) as answer_count
    FROM discussion_answers
    GROUP BY discussion_id
) answer_count ON d.id = answer_count.discussion_id;-- View for answers with author and stats
CREATE OR REPLACE VIEW answers_with_stats AS
SELECT 
    da.*,
    u.name as author_name,
    u.email as author_email
FROM discussion_answers da
LEFT JOIN users u ON da.author_id = u.id;



-- ===============================================
-- Initial Data
-- ===============================================

-- Create default admin user (password: admin123)
INSERT INTO users (id, email, password, name, role, is_active) 
VALUES (
    gen_random_uuid(),
    'admin@lisudictionary.com',
    '$2a$10$7ZqQZ8WqS5k5kUzY8sF8/.Vr5Yn5F0QY8kN5Q8F8sF8sF8sF8sF8s', -- bcrypt hash for 'admin123'
    'Dictionary Admin',
    'admin',
    true
) ON CONFLICT (email) DO NOTHING;

-- ===============================================
-- Comments and Documentation
-- ===============================================

COMMENT ON TABLE users IS 'User accounts for the English-Lisu Dictionary application';
COMMENT ON TABLE words IS 'English words with their Lisu translations and linguistic information';
COMMENT ON TABLE etymology IS 'Etymology information for words, tracking their historical development';
COMMENT ON TABLE discussions IS 'Discussion threads about words, translations, and language topics';
COMMENT ON TABLE discussion_answers IS 'Answers and replies to discussions, supporting hierarchical structure';
COMMENT ON TABLE search_history IS 'Track user search queries for analytics and improvements';
COMMENT ON TABLE audit_logs IS 'Audit trail for tracking changes and user actions';

-- ===============================================
-- Migration Complete
-- ===============================================

-- Log migration completion
INSERT INTO audit_logs (action, table_name, record_id, new_values, created_at)
VALUES (
    'DATABASE_MIGRATION_COMPLETE',
    'english_lisu_dictionary',
    'initial_schema',
    '{"migration": "english_lisu_dictionary.sql", "version": "1.0.0", "date": "2025-09-20"}',
    CURRENT_TIMESTAMP
);

-- Final success message
DO $$
BEGIN
    RAISE NOTICE 'English-Lisu Dictionary database schema created successfully!';
    RAISE NOTICE 'Migration completed at: %', CURRENT_TIMESTAMP;
END $$;