-- Migration 037: Influencer Outreach Tracking (Gemini Reviewed)
-- 2026-04-25

CREATE TABLE IF NOT EXISTS influencer_outreach_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id   INTEGER NOT NULL REFERENCES influencer_pipeline(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL DEFAULT 'email',
  channel_contact_details TEXT,
  subject         TEXT,
  body            TEXT,
  sent_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  follow_up_at    DATE,
  paid_at         TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'drafted',
  outcome_note    TEXT,
  cost            NUMERIC(10,2),
  content_url     TEXT,
  logged_by       TEXT DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT influencer_outreach_status_check 
    CHECK (status IN (
      'drafted','sent','replied','follow_up','in_negotiation',
      'contracted','content_submitted','live','paid','declined','ghosted'
    ))
);

CREATE INDEX idx_influencer_outreach_influencer ON influencer_outreach_log(influencer_id);
CREATE INDEX idx_influencer_outreach_status ON influencer_outreach_log(status);
CREATE INDEX idx_influencer_outreach_follow_up ON influencer_outreach_log(follow_up_at) 
  WHERE follow_up_at IS NOT NULL;

ALTER TABLE influencer_pipeline
  ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_outreach_status TEXT;

-- Verify
SELECT 'Migration 037 complete' AS status,
       (SELECT COUNT(*) FROM influencer_outreach_log) AS log_rows,
       (SELECT COUNT(*) FROM influencer_pipeline) AS influencers;
