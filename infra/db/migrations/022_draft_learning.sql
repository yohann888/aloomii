-- Migration: 022_draft_learning.sql
-- Phase B: Learn Loop Pipeline — outreach_drafts enrichment for edit tracking

BEGIN;

ALTER TABLE outreach_drafts
  ADD COLUMN IF NOT EXISTS edit_distance INTEGER,
  ADD COLUMN IF NOT EXISTS edit_categories JSONB,
  ADD COLUMN IF NOT EXISTS learning_processed BOOLEAN DEFAULT FALSE;

-- Partial index for learn-loop queries (only unprocessed approved drafts with edits)
CREATE INDEX IF NOT EXISTS idx_drafts_learning
  ON outreach_drafts(learning_processed)
  WHERE learning_processed = FALSE
    AND status = 'approved';

COMMIT;
