ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS human_outreach_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_outreach_reason TEXT,
  ADD COLUMN IF NOT EXISTS monitor_last_run_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_human_outreach
  ON contacts (human_outreach_flag)
  WHERE human_outreach_flag = true;
