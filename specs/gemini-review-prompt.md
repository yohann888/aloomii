You are an experienced database architect reviewing a spec for adding influencer outreach tracking to a CRM system. Review the following spec and provide your assessment.

## Context

We have a PostgreSQL CRM with an existing `influencer_pipeline` table (integer PK) that stores influencer discovery data from an API. We also have `outreach_drafts` (UUID PK, linked to `contacts` table) and `outreach_queue` (UUID PK, linked to contacts) for B2B founder outreach.

We need to add lightweight outreach tracking for influencers: who was contacted, when, via what channel, and what the outcome was.

## Proposed Solution

### New Table
```sql
CREATE TABLE influencer_outreach_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id INTEGER NOT NULL REFERENCES influencer_pipeline(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES outreach_drafts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  follow_up_at DATE,
  outcome TEXT NOT NULL DEFAULT 'drafted',
  outcome_note TEXT,
  cost NUMERIC(10,2),
  content_url TEXT,
  logged_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT influencer_outreach_outcome_check 
    CHECK (outcome IN ('drafted','sent','replied','follow_up','in_negotiation','contracted','content_submitted','live','paid','declined','ghosted'))
);

CREATE INDEX idx_influencer_outreach_influencer ON influencer_outreach_log(influencer_id);
CREATE INDEX idx_influencer_outreach_outcome ON influencer_outreach_log(outcome);
CREATE INDEX idx_influencer_outreach_follow_up ON influencer_outreach_log(follow_up_at) WHERE follow_up_at IS NOT NULL;
```

### Changes to Existing Tables
```sql
ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS influencer_id INTEGER;
-- No changes to influencer_pipeline (no denormalized columns)
```

### API Routes
- POST /api/command/influencers/:id/outreach — log outreach (create or update)
- GET /api/command/influencers/:id/outreach — get history + computed last_outreach_at + last_outcome

### Questions for You

1. Should we create a new table or reuse existing outreach_queue/outreach_drafts tables? The existing tables use UUID PKs and link to contacts (also UUID). Influencer_pipeline uses integer PK.

2. Is the outcome enum correct? Current flow: drafted → sent → replied → in_negotiation → contracted → content_submitted → live → paid. Exits: ghosted, declined, follow_up.

3. Should we denormalize last_outreach_at and last_outcome on influencer_pipeline for fast sorting/filtering, or compute on read via subquery?

4. Is adding a nullable influencer_id to outreach_drafts the right way to link drafts, or should we store draft_text directly in influencer_outreach_log?

5. Any missing fields or gotchas?

6. Any improvements for a minimal-change approach?

Please review each question and provide a clear recommendation.
