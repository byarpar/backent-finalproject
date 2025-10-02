-- Migration: Add likes functionality for discussions
-- Created: 2025-10-01

-- Create discussion_likes table
CREATE TABLE IF NOT EXISTS discussion_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    discussion_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT fk_discussion_likes_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_discussion_likes_discussion_id 
        FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate likes
    CONSTRAINT unique_user_discussion_like 
        UNIQUE (user_id, discussion_id)
);

-- Add like_count column to discussions table
ALTER TABLE discussions 
ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_discussion_likes_user_id ON discussion_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_discussion_likes_discussion_id ON discussion_likes(discussion_id);
CREATE INDEX IF NOT EXISTS idx_discussion_likes_created_at ON discussion_likes(created_at);

-- Create trigger function to update like_count automatically
CREATE OR REPLACE FUNCTION update_discussion_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment like count
        UPDATE discussions 
        SET like_count = COALESCE(like_count, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.discussion_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement like count
        UPDATE discussions 
        SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.discussion_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic like count updates
DROP TRIGGER IF EXISTS trigger_discussion_like_count_insert ON discussion_likes;
CREATE TRIGGER trigger_discussion_like_count_insert
    AFTER INSERT ON discussion_likes
    FOR EACH ROW EXECUTE FUNCTION update_discussion_like_count();

DROP TRIGGER IF EXISTS trigger_discussion_like_count_delete ON discussion_likes;
CREATE TRIGGER trigger_discussion_like_count_delete
    AFTER DELETE ON discussion_likes
    FOR EACH ROW EXECUTE FUNCTION update_discussion_like_count();

-- Create trigger function for updated_at timestamp
CREATE OR REPLACE FUNCTION update_discussion_likes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at on discussion_likes
DROP TRIGGER IF EXISTS trigger_discussion_likes_updated_at ON discussion_likes;
CREATE TRIGGER trigger_discussion_likes_updated_at
    BEFORE UPDATE ON discussion_likes
    FOR EACH ROW EXECUTE FUNCTION update_discussion_likes_updated_at();

-- Initialize like_count for existing discussions (set to 0 if NULL)
UPDATE discussions 
SET like_count = 0 
WHERE like_count IS NULL;

-- Create a function to get user's liked discussions
CREATE OR REPLACE FUNCTION get_user_liked_discussions(user_uuid UUID)
RETURNS TABLE(discussion_id UUID) AS $$
BEGIN
    RETURN QUERY
    SELECT dl.discussion_id
    FROM discussion_likes dl
    WHERE dl.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON TABLE discussion_likes IS 'Stores user likes for discussions';
COMMENT ON COLUMN discussion_likes.user_id IS 'UUID of the user who liked the discussion';
COMMENT ON COLUMN discussion_likes.discussion_id IS 'UUID of the discussion that was liked';
COMMENT ON COLUMN discussions.like_count IS 'Cached count of likes for this discussion';

-- Grant necessary permissions (adjust as needed for your user)
-- GRANT SELECT, INSERT, DELETE ON discussion_likes TO your_app_user;
-- GRANT UPDATE ON discussions TO your_app_user;

-- Verification queries (uncomment to test after migration)
-- SELECT 'Migration completed successfully' as status;
-- SELECT COUNT(*) as total_discussions FROM discussions;
-- SELECT COUNT(*) as total_likes FROM discussion_likes;