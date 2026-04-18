ALTER TABLE outreach_queue
  ADD COLUMN IF NOT EXISTS personalization_source_type TEXT,
  ADD COLUMN IF NOT EXISTS personalization_source_url TEXT,
  ADD COLUMN IF NOT EXISTS personalization_note TEXT,
  ADD COLUMN IF NOT EXISTS personalization_opener TEXT,
  ADD COLUMN IF NOT EXISTS personalization_status TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_outreach_queue_personalization_status
  ON outreach_queue(personalization_status);
