# Attention-Line Engine DB Migration Plan

## Goal
Generalize the current hook-loop idea into a cross-channel attention-line foundation while keeping phase-1 execution limited to LinkedIn hooks.

## Design rule
Core modeling fields should be explicit columns, not buried in JSONB.
Experimental details still belong in `metadata`.

## Create `infra/db/migrations/027_attention_line_phase1.sql`

### `content_posts`
```sql
ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS selected_hook_id UUID REFERENCES content_hooks(id),
  ADD COLUMN IF NOT EXISTS hook_was_edited BOOLEAN NOT NULL DEFAULT FALSE;
```

### `content_hooks`
```sql
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
```

### `attention_line_sessions`
```sql
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
```

## `content_hooks.metadata` shape
Use existing metadata for flexible fields:
```json
{
  "candidate_type": "A",
  "recommended": false,
  "scores": {
    "scroll_stopping": 8,
    "specificity": 7,
    "tension": 8,
    "memorability": 8
  },
  "critique": "raw critique text",
  "brief": {
    "topic": "...",
    "icp": "...",
    "funnel_stage": "top"
  },
  "model_used": "claude-sonnet-4-6"
}
```

## Why this model
- `platform` and `asset_type` are queryable now
- `loop_session_id` groups all candidates from one engine run
- `attention_line_sessions` gives CC a clean session-level object
- `metadata` stays free for prompt/score/brief experimentation

## Phase-1 execution rule
Only create rows with:
- `platform = 'linkedin'`
- `asset_type = 'hook'`

The schema is generic. The rollout is not.
