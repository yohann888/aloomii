ALTER TABLE outreach_queue
  ADD COLUMN IF NOT EXISTS queue_type TEXT,
  ADD COLUMN IF NOT EXISTS block_reason TEXT;

UPDATE outreach_queue
SET queue_type = CASE
  WHEN channel = 'email' THEN 'outbound_email'
  ELSE 'warm_reply'
END
WHERE queue_type IS NULL;

ALTER TABLE outreach_queue
  DROP CONSTRAINT IF EXISTS outreach_queue_queue_type_check;

ALTER TABLE outreach_queue
  ADD CONSTRAINT outreach_queue_queue_type_check
  CHECK (queue_type IN ('outbound_email', 'warm_reply'));
