-- Content drafts workflow: approve/edit/learn loop for LinkedIn drafts
ALTER TABLE content_posts 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'published')),
  ADD COLUMN IF NOT EXISTS original_text TEXT,
  ADD COLUMN IF NOT EXISTS edited_text TEXT,
  ADD COLUMN IF NOT EXISTS edit_distance INTEGER,
  ADD COLUMN IF NOT EXISTS edit_categories JSONB,
  ADD COLUMN IF NOT EXISTS learning_processed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_content_posts_status ON content_posts(status);
CREATE INDEX IF NOT EXISTS idx_content_learning ON content_posts(learning_processed) 
  WHERE learning_processed = FALSE AND status = 'approved';
