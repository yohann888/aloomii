-- Migration: Prompt Lab insights feed for Command Center
-- 2026-04-23

CREATE TABLE IF NOT EXISTS prompt_lab_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_slug    TEXT NOT NULL,
  title           TEXT NOT NULL,
  content_type    TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  total_edits     INTEGER NOT NULL DEFAULT 0,
  active_edits    INTEGER NOT NULL DEFAULT 0,
  reverted_edits  INTEGER NOT NULL DEFAULT 0,
  avg_edit_distance DECIMAL(5,4) NOT NULL DEFAULT 0,
  reversion_rate  DECIMAL(5,2) NOT NULL DEFAULT 0,
  priority        TEXT NOT NULL DEFAULT 'watch',
  signal          TEXT NOT NULL DEFAULT 'monitor',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT prompt_lab_insights_period_unique UNIQUE (content_slug, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS prompt_lab_insights_period_idx
  ON prompt_lab_insights(period_start DESC, period_end DESC);
CREATE INDEX IF NOT EXISTS prompt_lab_insights_priority_idx
  ON prompt_lab_insights(priority) WHERE priority IN ('high', 'medium');

COMMENT ON TABLE prompt_lab_insights IS 'Weekly Prompt Lab analytics summary for Command Center display. Aggregated from portal.prompt_lab_edits.';
