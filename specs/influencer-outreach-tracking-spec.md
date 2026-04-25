# Spec: Influencer Outreach Tracking (Minimal-Change Integration)
**Date:** 2026-04-25
**Author:** Leo (CoS)
**Status:** Draft — pending Gemini 3.1 Pro review

---

## 1. Context

The CRM section currently has an **Influencers** panel that lists `influencer_pipeline` records from the DB. It shows: handle, platform, followers, engagement, lead score, tier, email, status. There is **no outreach tracking** — you can't see who you've contacted, who replied, or what the outcome was.

This spec adds lightweight outreach tracking to the existing Influencers section with **minimal DB and API changes**.

---

## 2. Current State

### 2.1 DB Table: `influencer_pipeline`
```sql
id               serial PK
handle           varchar(255)
platform         varchar(50)      -- tiktok, instagram, youtube, twitter, linkedin
followers        integer
engagement_rate  numeric
niche_tags       text
vibe_score       integer
collab_readiness text
pricing_estimate text
contact_method   varchar(100)
profile_url      text
notes            text
status           varchar(50)      -- default: 'Identified'
email            text
email_source     text
email_found_at   timestamptz
platform_primary text
icp_target       text
lead_score       integer
lead_tier        text
score            numeric(6,1)
platforms_count  integer
created_at       timestamp
```

**Current statuses in DB:**
```sql
SELECT DISTINCT status FROM influencer_pipeline;
-- Identified, Contacted, Replied, Negotiating, Contracted, Declined, Drafted
```

### 2.2 Current API Routes
- `GET /api/command/influencers` — list with filters
- `GET /api/command/influencers/export` — CSV download
- `GET /api/command/influencers/budget` — EnsembleData budget
- `GET /api/command/influencers/config` — active ICPs

### 2.3 Current Cron
- `influencer-pipeline-scanner` — runs daily, populates `influencer_pipeline`
- `influencer-email-finder` — runs weekly, finds emails
- `influencer-outreach-drafter` — runs weekly, creates drafts

### 2.4 Data Flow
```
EnsembleData API → influencer_pipeline (raw data)
  ↓
Email finder → updates email, email_source
  ↓
Outreach drafter → creates drafts in outreach_drafts (linked by influencer_id)
  ↓
[GAP: no tracking of sent/replied/booked for influencers]
```

---

## 3. Proposed Changes (Minimal)

### 3.1 DB Migration (1 new table, 1 column addition)

**New table: `influencer_outreach_log`**
```sql
CREATE TABLE influencer_outreach_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id   INTEGER NOT NULL REFERENCES influencer_pipeline(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL DEFAULT 'email', -- email, dm, comment
  draft_text      TEXT,
  sent_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  outcome         TEXT NOT NULL DEFAULT 'drafted', -- drafted, sent, replied, booked, declined, ghosted
  outcome_note    TEXT,
  logged_by       TEXT DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_influencer_outreach_influencer ON influencer_outreach_log(influencer_id);
CREATE INDEX idx_influencer_outreach_outcome ON influencer_outreach_log(outcome);
```

**Add to `influencer_pipeline`:**
```sql
ALTER TABLE influencer_pipeline
  ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_outcome TEXT;
```

**Rationale:**
- New table for audit trail (who, when, what, outcome)
- Denormalized columns on `influencer_pipeline` for fast filtering/sorting in list view
- `outcome` enum: drafted → sent → replied | booked | declined | ghosted

### 3.2 API Additions (3 routes)

**POST /api/command/influencers/:id/outreach**
```js
// Log an outreach attempt
// Body: { channel, draft_text, sent_at }
// Action: INSERT into influencer_outreach_log, UPDATE influencer_pipeline.status = 'Contacted'
```

**PATCH /api/command/influencers/:id/outcome**
```js
// Update outcome
// Body: { outcome, note }
// Allowed: 'sent', 'replied', 'booked', 'declined', 'ghosted'
// Action: INSERT log row, UPDATE influencer_pipeline.last_outcome + last_outreach_at
```

**GET /api/command/influencers/:id/outreach**
```js
// Get outreach history for one influencer
// Returns: array of log rows, ordered by created_at DESC
```

### 3.3 Frontend Changes (Influencers tab)

**Add to existing influencer card:**
- Status badge (Identified → Contacted → Replied → Booked | Declined)
- "Log Outreach" button → opens modal with channel + draft + send date
- "Mark Replied" / "Mark Booked" / "Mark Declined" quick buttons
- Outreach history accordion (last 3 attempts visible)

**Add filter bar:**
- Status filter: All | Identified | Contacted | Replied | Booked | Declined
- Last outreach: Any | Today | This week | This month | Never

### 3.4 Cron Changes (Minimal)

No new cron needed. Existing crons can update status:
- `influencer-outreach-drafter` → sets `status = 'Drafted'` when draft created
- Manual CC actions → set `status = 'Contacted'`, `'Replied'`, etc.

### 3.5 Data Flow (After)

```
EnsembleData API → influencer_pipeline
  ↓
Email finder → updates email, email_source
  ↓
Outreach drafter → creates drafts, sets status = 'Drafted'
  ↓
CC user action → influencer_outreach_log row + status update
  ↓
influencer_pipeline.last_outreach_at + last_outcome (denormalized)
```

---

## 4. Migration

```sql
-- Migration 037: Influencer Outreach Tracking
-- 2026-04-25

CREATE TABLE IF NOT EXISTS influencer_outreach_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id   INTEGER NOT NULL REFERENCES influencer_pipeline(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL DEFAULT 'email',
  draft_text      TEXT,
  sent_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  outcome         TEXT NOT NULL DEFAULT 'drafted',
  outcome_note    TEXT,
  logged_by       TEXT DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_influencer_outreach_influencer ON influencer_outreach_log(influencer_id);
CREATE INDEX idx_influencer_outreach_outcome ON influencer_outreach_log(outcome);

ALTER TABLE influencer_pipeline
  ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_outcome TEXT;
```

---

## 5. Implementation Order

| # | Task | Effort | Owner |
|---|------|--------|-------|
| 1 | Migration 037 | 5 min | Leo |
| 2 | API routes (3) | 30 min | Leo |
| 3 | Frontend: status badge + log buttons | 1 hr | Leo |
| 4 | Frontend: filter bar | 30 min | Leo |
| 5 | Test end-to-end | 30 min | Yohann |

**Total: ~2.5 hours**

---

## 6. Open Questions for Gemini 3.1 Pro Review

1. Is `influencer_outreach_log` the right abstraction, or should we reuse `outreach_queue`/`outreach_drafts` tables?
2. Should `outcome` be an enum type for DB-level safety?
3. Is denormalizing `last_outreach_at` + `last_outcome` on `influencer_pipeline` worth the complexity, or should we compute on read?
4. Any missing states in the status flow?
