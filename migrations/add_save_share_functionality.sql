-- ===============================================
-- Add Save and Share Functionality
-- Migration for SaveButton and ShareButton features
-- Created: 2025-10-01
-- ===============================================

-- ===============================================
-- Saved Discussions Table
-- ===============================================
CREATE TABLE IF NOT EXISTS saved_discussions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure a user can only save a discussion once
    UNIQUE(user_id, discussion_id)
);

-- Create indexes for saved_discussions table
CREATE INDEX IF NOT EXISTS idx_saved_discussions_user_id ON saved_discussions(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_discussions_discussion_id ON saved_discussions(discussion_id);
CREATE INDEX IF NOT EXISTS idx_saved_discussions_created_at ON saved_discussions(created_at);

-- ===============================================
-- Discussion Shares Table
-- ===============================================
CREATE TABLE IF NOT EXISTS discussion_shares (
    id SERIAL PRIMARY KEY,
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    shared_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    share_method VARCHAR(50) NOT NULL CHECK (share_method IN ('link', 'email', 'social', 'copy')),
    share_platform VARCHAR(100), -- e.g., 'twitter', 'facebook', 'email', 'whatsapp'
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for discussion_shares table
CREATE INDEX IF NOT EXISTS idx_discussion_shares_discussion_id ON discussion_shares(discussion_id);
CREATE INDEX IF NOT EXISTS idx_discussion_shares_shared_by_user_id ON discussion_shares(shared_by_user_id);
CREATE INDEX IF NOT EXISTS idx_discussion_shares_share_method ON discussion_shares(share_method);
CREATE INDEX IF NOT EXISTS idx_discussion_shares_created_at ON discussion_shares(created_at);

-- ===============================================
-- Add save count and share count to discussions table
-- ===============================================
ALTER TABLE discussions 
ADD COLUMN IF NOT EXISTS save_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS share_count INTEGER DEFAULT 0;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_discussions_save_count ON discussions(save_count);
CREATE INDEX IF NOT EXISTS idx_discussions_share_count ON discussions(share_count);

-- ===============================================
-- Functions to update counters
-- ===============================================

-- Function to update save count when a discussion is saved/unsaved
CREATE OR REPLACE FUNCTION update_discussion_save_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE discussions 
        SET save_count = save_count + 1 
        WHERE id = NEW.discussion_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE discussions 
        SET save_count = GREATEST(save_count - 1, 0) 
        WHERE id = OLD.discussion_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE 'plpgsql';

-- Function to update share count when a discussion is shared
CREATE OR REPLACE FUNCTION update_discussion_share_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE discussions 
    SET share_count = share_count + 1 
    WHERE id = NEW.discussion_id;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- ===============================================
-- Triggers for counters
-- ===============================================

-- Trigger to update save count
CREATE TRIGGER trigger_update_save_count
    AFTER INSERT OR DELETE ON saved_discussions
    FOR EACH ROW
    EXECUTE FUNCTION update_discussion_save_count();

-- Trigger to update share count
CREATE TRIGGER trigger_update_share_count
    AFTER INSERT ON discussion_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_discussion_share_count();

-- ===============================================
-- Update existing discussions to have correct counts
-- ===============================================

-- Update save counts for existing discussions
UPDATE discussions 
SET save_count = (
    SELECT COUNT(*) 
    FROM saved_discussions 
    WHERE saved_discussions.discussion_id = discussions.id
);

-- Update share counts for existing discussions
UPDATE discussions 
SET share_count = (
    SELECT COUNT(*) 
    FROM discussion_shares 
    WHERE discussion_shares.discussion_id = discussions.id
);

-- ===============================================
-- Create view for discussions with save status
-- ===============================================
CREATE OR REPLACE VIEW discussions_with_user_actions AS
SELECT 
    d.*,
    CASE 
        WHEN sd.user_id IS NOT NULL THEN true 
        ELSE false 
    END as is_saved_by_user
FROM discussions d
LEFT JOIN saved_discussions sd ON d.id = sd.discussion_id;

-- ===============================================
-- Comments
-- ===============================================
COMMENT ON TABLE saved_discussions IS 'Tracks which discussions users have saved/bookmarked';
COMMENT ON TABLE discussion_shares IS 'Tracks sharing activities for discussions';
COMMENT ON COLUMN discussions.save_count IS 'Number of times this discussion has been saved';
COMMENT ON COLUMN discussions.share_count IS 'Number of times this discussion has been shared';
COMMENT ON VIEW discussions_with_user_actions IS 'View that includes user-specific actions like save status';