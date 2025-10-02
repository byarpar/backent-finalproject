-- ===============================================
-- Remove Like/Dislike Functionality Migration
-- ===============================================

-- Remove triggers first
DROP TRIGGER IF EXISTS maintain_answer_like_counts ON answer_likes;

-- Remove functions
DROP FUNCTION IF EXISTS update_discussion_like_counts();
DROP FUNCTION IF EXISTS update_answer_like_counts();

-- Remove views that depend on like tables
DROP VIEW IF EXISTS discussions_with_stats;
DROP VIEW IF EXISTS answers_with_stats;

-- Remove like/dislike tables
DROP TABLE IF EXISTS discussion_likes CASCADE;
DROP TABLE IF EXISTS answer_likes CASCADE;

-- Remove like/dislike related columns from discussion_answers table if they exist
ALTER TABLE discussion_answers DROP COLUMN IF EXISTS like_count CASCADE;
ALTER TABLE discussion_answers DROP COLUMN IF EXISTS dislike_count CASCADE;

-- Recreate views without like functionality
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
) answer_count ON d.id = answer_count.discussion_id;

-- Recreate answers view without like functionality
CREATE OR REPLACE VIEW answers_with_stats AS
SELECT 
    da.*,
    u.name as author_name,
    u.email as author_email
FROM discussion_answers da
LEFT JOIN users u ON da.author_id = u.id;

-- Log migration completion
INSERT INTO audit_logs (action, table_name, record_id, new_values, created_at)
VALUES (
    'REMOVE_LIKE_DISLIKE_FUNCTIONALITY',
    'discussions',
    'migration',
    '{"migration": "remove_like_dislike.sql", "version": "1.1.0", "date": "2025-10-01"}',
    CURRENT_TIMESTAMP
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Like/Dislike functionality removed successfully!';
    RAISE NOTICE 'Migration completed at: %', CURRENT_TIMESTAMP;
END $$;