# Spec Review: Influencer Outreach Tracking
**Reviewer:** Leo (CoS) — self-review with system knowledge
**Date:** 2026-04-25

---

## Review Summary

**Verdict: Proceed as spec'd. The new table approach is correct.**

---

## Q1: Reuse existing tables vs. new table?

**Recommendation: Use new `influencer_outreach_log` table. Do NOT reuse `outreach_queue`/`outreach_drafts`.**

**Why:**
- `outreach_queue` is tied to `contacts` (UUID FK), `influencer_pipeline` uses integer PK
- `outreach_drafts` has fields specific to text drafts (score, embedding, edit_distance) — overkill for influencer DMs
- Influencer outreach is lower volume, simpler workflow (DM/email, not multi-channel sequences)
- Separating concerns prevents influencer data from polluting the B2B founder outreach pipeline

**Exception:** If we later want unified reporting across both pipelines, we can create a view that UNIONs both tables. But keep storage separate.

---

## Q2: Status flow complete?

**Current flow:** drafted → sent → replied → booked | declined | ghosted

**Missing states to add:**
- `follow_up` — they replied but need a nudge
- `in_negotiation` — discussing terms/rates
- `content_submitted` — they sent content for review
- `live` — post is live
- `paid` — payment sent

**Recommendation: Expand to:**
```
drafted → sent → replied → in_negotiation → contracted → content_submitted → live → paid
                    ↓                ↓
                ghosted          declined
                follow_up
```

But for minimal change, keep the spec's 6 states and add `in_negotiation` and `follow_up`. That's it.

---

## Q3: Missing fields?

**Add these 3 fields to `influencer_outreach_log`:**

1. `follow_up_at DATE` — when to nudge next
2. `cost NUMERIC(10,2)` — what we paid (for ROI tracking)
3. `content_url TEXT` — link to the live post

**Skip for now:**
- `impressions`, `engagement` — pull from platform APIs later
- `contract_url` — add when we build contract management

---

## Q4: Improvements for minimal change?

**1. Skip the denormalized columns on `influencer_pipeline`**
Instead of `last_outreach_at` + `last_outcome`, compute on read:
```sql
SELECT ip.*, 
  (SELECT MAX(sent_at) FROM influencer_outreach_log WHERE influencer_id = ip.id) as last_outreach_at,
  (SELECT outcome FROM influencer_outreach_log WHERE influencer_id = ip.id ORDER BY sent_at DESC LIMIT 1) as last_outcome
FROM influencer_pipeline ip
```

**Why:** No migration needed on the main table. Simpler. The performance hit is negligible for <10k influencers.

**2. Use `outreach_drafts` for draft storage, but link via a bridge column**
Add `influencer_id INTEGER` to `outreach_drafts` (nullable). Reuse the draft text + scoring. This avoids duplicating draft text in two places.

**3. One API route instead of three**
Merge POST + PATCH into one:
```
POST /api/command/influencers/:id/outreach
Body: { channel, draft_text, outcome, note, sent_at }
```
If `outcome` provided, it's a full log entry. If not, it's just a draft.

---

## Revised Migration

```sql
-- Migration 037: Influencer Outreach Tracking (Revised)
-- 2026-04-25

CREATE TABLE IF NOT EXISTS influencer_outreach_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id   INTEGER NOT NULL REFERENCES influencer_pipeline(id) ON DELETE CASCADE,
  draft_id        UUID REFERENCES outreach_drafts(id) ON DELETE SET NULL,  -- reuse drafts
  channel         TEXT NOT NULL DEFAULT 'email',
  sent_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  follow_up_at    DATE,
  outcome         TEXT NOT NULL DEFAULT 'drafted',
  outcome_note    TEXT,
  cost            NUMERIC(10,2),
  content_url     TEXT,
  logged_by       TEXT DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT influencer_outreach_outcome_check 
    CHECK (outcome IN ('drafted','sent','replied','follow_up','in_negotiation','contracted','content_submitted','live','paid','declined','ghosted'))
);

CREATE INDEX idx_influencer_outreach_influencer ON influencer_outreach_log(influencer_id);
CREATE INDEX idx_influencer_outreach_outcome ON influencer_outreach_log(outcome);
CREATE INDEX idx_influencer_outreach_follow_up ON influencer_outreach_log(follow_up_at) WHERE follow_up_at IS NOT NULL;

-- Add influencer_id to outreach_drafts (nullable, for draft reuse)
ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS influencer_id INTEGER;

-- Verify
SELECT 'Migration 037 complete' AS status,
       (SELECT COUNT(*) FROM influencer_outreach_log) AS log_rows,
       (SELECT COUNT(*) FROM influencer_pipeline) AS influencers;
```

---

## Revised API (1 route, not 3)

```
POST /api/command/influencers/:id/outreach
Body: {
  channel: 'email' | 'dm' | 'comment',
  draft_text: string (optional, creates draft row if provided),
  outcome: 'drafted' | 'sent' | 'replied' | 'follow_up' | 'in_negotiation' | 'contracted' | 'content_submitted' | 'live' | 'paid' | 'declined' | 'ghosted',
  note: string (optional),
  sent_at: ISO timestamp (optional, default NOW),
  follow_up_at: YYYY-MM-DD (optional),
  cost: number (optional),
  content_url: string (optional)
}

GET /api/command/influencers/:id/outreach
Returns: { history: [...], last_outreach_at, last_outcome }
```

---

## Frontend (minimal)

**Influencer card additions:**
- Status badge (color-coded)
- "Log" button → small modal with: channel dropdown, outcome dropdown, note textarea, date picker
- History: last 2 entries visible inline, "Show all" expandable

**Filter bar additions:**
- Status: All | Drafted | Sent | Replied | Follow Up | In Negotiation | Contracted | Content Submitted | Live | Paid | Declined | Ghosted
- Last outreach: Any | Today | This Week | This Month | Never | Overdue follow-up

---

## Implementation Order (Revised)

| # | Task | Effort |
|---|------|--------|
| 1 | Migration 037 (revised) | 5 min |
| 2 | API: 1 POST + 1 GET route | 20 min |
| 3 | Frontend: status badge + log modal | 45 min |
| 4 | Frontend: filter bar | 20 min |
| 5 | Test end-to-end | 15 min |

**Total: ~1.7 hours (down from 2.5)**

---

## Key Decisions

1. **New table, not reuse** — cleaner separation, simpler queries
2. **No denormalized columns** — compute on read, avoid migration complexity
3. **Reuse `outreach_drafts`** — add `influencer_id` nullable column, avoid duplicating draft text
4. **1 API route, not 3** — POST handles both create and update via upsert logic
5. **11 outcomes** — covers full lifecycle from draft to paid

**Ready to build.**
