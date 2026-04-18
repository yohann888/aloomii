ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS selected_hook_id UUID REFERENCES content_hooks(id),
  ADD COLUMN IF NOT EXISTS hook_was_edited BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE content_hooks
  ADD COLUMN IF NOT EXISTS post_id INTEGER REFERENCES content_posts(id),
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'linkedin',
  ADD COLUMN IF NOT EXISTS asset_type TEXT NOT NULL DEFAULT 'hook',
  ADD COLUMN IF NOT EXISTS loop_session_id UUID,
  ADD COLUMN IF NOT EXISTS loop_role TEXT,
  ADD COLUMN IF NOT EXISTS judge_score NUMERIC,
  ADD COLUMN IF NOT EXISTS judge_rationale TEXT,
  ADD COLUMN IF NOT EXISTS is_selected BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_content_hooks_post_id
  ON content_hooks(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_hooks_platform
  ON content_hooks(platform);
CREATE INDEX IF NOT EXISTS idx_content_hooks_asset_type
  ON content_hooks(asset_type);
CREATE INDEX IF NOT EXISTS idx_content_hooks_loop_session_id
  ON content_hooks(loop_session_id);
CREATE INDEX IF NOT EXISTS idx_content_hooks_platform_asset
  ON content_hooks(platform, asset_type);

CREATE TABLE IF NOT EXISTS attention_line_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id INTEGER REFERENCES content_posts(id),
  platform TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  winner_hook_id UUID REFERENCES content_hooks(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_attention_line_sessions_post_id
  ON attention_line_sessions(post_id);
CREATE INDEX IF NOT EXISTS idx_attention_line_sessions_platform_asset
  ON attention_line_sessions(platform, asset_type);
