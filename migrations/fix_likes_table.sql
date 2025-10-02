-- Fix discussion_likes table structure
-- Drop and recreate the table with correct schema

-- Drop existing table and related triggers
DROP TRIGGER IF EXISTS trigger_discussion_like_count_insert ON discussion_likes;
DROP TRIGGER IF EXISTS trigger_discussion_like_count_delete ON discussion_likes;
DROP TRIGGER IF EXISTS trigger_discussion_likes_updated_at ON discussion_likes;
DROP TABLE IF EXISTS discussion_likes CASCADE;

-- Create discussion_likes table with correct structure
CREATE TABLE discussion_likes (
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

-- Create indexes for better performance
CREATE INDEX idx_discussion_likes_user_id ON discussion_likes(user_id);
CREATE INDEX idx_discussion_likes_discussion_id ON discussion_likes(discussion_id);
CREATE INDEX idx_discussion_likes_created_at ON discussion_likes(created_at);

-- Recreate trigger function to update like_count automatically
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

-- Recreate triggers for automatic like count updates
CREATE TRIGGER trigger_discussion_like_count_insert
    AFTER INSERT ON discussion_likes
    FOR EACH ROW EXECUTE FUNCTION update_discussion_like_count();

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
CREATE TRIGGER trigger_discussion_likes_updated_at
    BEFORE UPDATE ON discussion_likes
    FOR EACH ROW EXECUTE FUNCTION update_discussion_likes_updated_at();

-- Initialize like_count for existing discussions (set to 0 if NULL)
UPDATE discussions 
SET like_count = 0 
WHERE like_count IS NULL;