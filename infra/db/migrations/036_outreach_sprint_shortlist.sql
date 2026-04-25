-- Migration 036: Outreach Sprint Shortlist + Reply Tracking
-- Date: 2026-04-25
-- Author: Leo (CoS)

-- Table for "Save to Shortlist" workflow
CREATE TABLE IF NOT EXISTS outreach_sprint_shortlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sprint_name TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'shortlisted' 
    CHECK (status IN ('shortlisted', 'contacted', 'replied', 'booked', 'passed', 'nurture')),
  draft_id UUID REFERENCES outreach_drafts(id) ON DELETE SET NULL,
  notes TEXT,
  created_by TEXT NOT NULL DEFAULT 'leo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT outreach_sprint_shortlist_unique UNIQUE (contact_id, sprint_name)
);

CREATE INDEX IF NOT EXISTS idx_outreach_shortlist_status 
  ON outreach_sprint_shortlist(status);
CREATE INDEX IF NOT EXISTS idx_outreach_shortlist_sprint 
  ON outreach_sprint_shortlist(sprint_name, status);

COMMENT ON TABLE outreach_sprint_shortlist IS 
'Focused view for outreach sprints. Contacts flagged by Yohann/Jenny for focused outreach.
Status flow: shortlisted → contacted → replied | booked | passed | nurture';

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_outreach_shortlist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_outreach_shortlist_updated ON outreach_sprint_shortlist;
CREATE TRIGGER trigger_outreach_shortlist_updated
  BEFORE UPDATE ON outreach_sprint_shortlist
  FOR EACH ROW EXECUTE FUNCTION update_outreach_shortlist_timestamp();

-- Verify
SELECT 'Migration 036 complete' AS status,
       (SELECT COUNT(*) FROM outreach_sprint_shortlist) AS rows;
