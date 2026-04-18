ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS selected_hook_id UUID REFERENCES content_hooks(id),
  ADD COLUMN IF NOT EXISTS hook_was_edited BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE content_hooks
  ADD COLUMN IF NOT EXISTS post_id INTEGER REFERENCES content_posts(id),
  ADD COLUMN IF NOT EXISTS generation_run_id UUID,
  ADD COLUMN IF NOT EXISTS is_selected BOOLEAN NOT NULL DEFAULT FALSE;

-- Reuse existing `metadata` JSONB for generation data instead of adding a duplicate column.
-- Generation metadata shape: { candidate_type, recommended, score_total, scores, critique, judge_reasoning, brief }

CREATE INDEX IF NOT EXISTS idx_content_hooks_generation_run_id
  ON content_hooks(generation_run_id);

CREATE INDEX IF NOT EXISTS idx_content_hooks_post_id
  ON content_hooks(post_id) WHERE post_id IS NOT NULL;