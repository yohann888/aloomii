ALTER TABLE outreach_queue
  ADD COLUMN IF NOT EXISTS personalized_by TEXT,
  ADD COLUMN IF NOT EXISTS personalized_at TIMESTAMPTZ;

ALTER TABLE outreach_queue
  DROP CONSTRAINT IF EXISTS outreach_queue_personalization_status_check;

ALTER TABLE outreach_queue
  ADD CONSTRAINT outreach_queue_personalization_status_check
  CHECK (personalization_status IN ('pending', 'ready', 'approved', 'skipped'));
