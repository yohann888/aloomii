# Spec: Influencer Outreach Tracking (Final — Gemini 3.1 Pro Reviewed)
**Date:** 2026-04-25
**Author:** Leo (CoS)
**Reviewer:** Gemini 3.1 Pro
**Status:** Approved — ready to build

---

## 1. Context

The CRM section has an **Influencers** panel listing `influencer_pipeline` records. It shows handle, platform, followers, engagement, lead score, tier, email, status — but **no outreach tracking**. We need to see who was contacted, when, via what channel, and what the outcome was.

**Current data flows:**
```
EnsembleData API → influencer_pipeline (raw discovery data)
  ↓
influencer-email-finder (weekly cron) → updates email, email_source
  ↓
influencer-outreach-drafter (weekly cron) → creates drafts
  ↓
[GAP: no tracking of sent/replied/booked]
```

**Existing tables:**
- `influencer_pipeline` — integer PK, discovery data
- `outreach_drafts` — UUID PK, linked to `contacts` (UUID), stores draft text + scoring
- `outreach_queue` — UUID PK, linked to contacts, scheduling

---

## 2. Gemini 3.1 Pro Review Summary

| # | Question | Gemini Verdict | Applied? |
|---|----------|---------------|----------|
| 1 | New table or reuse existing? | **New table** — cleaner separation, PK mismatch (int vs UUID) | ✅ |
| 2 | Outcome enum correct? | **Rename `outcome` → `status`** — represents state machine, not just terminal result | ✅ |
| 3 | Denormalize `last_outreach_at` + `last_status`? | **Yes** — critical for fast list sorting/filtering in UI | ✅ (revised from no) |
| 4 | Link to `outreach_drafts` via `influencer_id`? | **No** — keep self-contained. Add `subject` + `body` to log table | ✅ (revised from yes) |
| 5 | Missing fields? | Add `paid_at`, `channel_contact_details`, `subject`, `body` | ✅ |
| 6 | Minimal-change improvements? | Don't alter existing tables at all (except 2 denormalized columns) | ✅ |

---

## 3. DB Migration (037)

```sql
-- Migration 037: Influencer Outreach Tracking (Gemini Reviewed)
-- 2026-04-25

CREATE TABLE influencer_outreach_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id   INTEGER NOT NULL REFERENCES influencer_pipeline(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL DEFAULT 'email',
  channel_contact_details TEXT,  -- specific handle/URL per channel (e.g. Twitter DM handle)
  subject         TEXT,          -- self-contained draft subject
  body            TEXT,          -- self-contained draft body
  sent_at         TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  follow_up_at    DATE,
  paid_at         TIMESTAMPTZ,   -- when payment occurred (not just status = 'paid')
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

-- Denormalized for fast list view sorting/filtering (Gemini: critical for UX)
ALTER TABLE influencer_pipeline
  ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_outreach_status TEXT;

-- Verify
SELECT 'Migration 037 complete' AS status,
       (SELECT COUNT(*) FROM influencer_outreach_log) AS log_rows,
       (SELECT COUNT(*) FROM influencer_pipeline) AS influencers;
```

---

## 4. State Machine

```
drafted → sent → replied → in_negotiation → contracted → content_submitted → live → paid
    ↓         ↓         ↓
ghosted   declined   follow_up (loop back to sent)
```

**11 states total.**

---

## 5. API Routes

### POST /api/command/influencers/:id/outreach
Log or update outreach for an influencer.

```json
{
  "channel": "email" | "dm" | "comment",
  "channel_contact_details": "@handle or email",
  "subject": "string (optional)",
  "body": "string (optional, the draft text)",
  "status": "drafted" | "sent" | "replied" | "follow_up" | "in_negotiation" | "contracted" | "content_submitted" | "live" | "paid" | "declined" | "ghosted",
  "outcome_note": "string (optional)",
  "sent_at": "ISO timestamp (optional, default NOW)",
  "follow_up_at": "YYYY-MM-DD (optional)",
  "paid_at": "ISO timestamp (optional)",
  "cost": 1234.56,
  "content_url": "https://... (optional)"
}
```

**Logic:**
1. INSERT into `influencer_outreach_log`
2. UPDATE `influencer_pipeline` SET `last_outreach_at = NOW()`, `last_outreach_status = $status`
3. Return `{ success: true, log_id }`

### GET /api/command/influencers/:id/outreach
Get outreach history for one influencer.

```json
{
  "history": [
    {
      "id": "uuid",
      "status": "sent",
      "channel": "email",
      "sent_at": "2026-04-20T14:00:00Z",
      "body": "Hey...",
      "outcome_note": "..."
    }
  ],
  "last_outreach_at": "2026-04-20T14:00:00Z",
  "last_outreach_status": "sent"
}
```

---

## 6. Frontend Changes

### Influencer Card Additions
- **Status badge** — color-coded (drafted=gray, sent=blue, replied=green, paid=purple, ghosted=red)
- **"Log" button** → opens modal
  - Channel dropdown (email, dm, comment)
  - Status dropdown (11 states)
  - Subject + body textareas
  - Note textarea
  - Date pickers: sent_at, follow_up_at, paid_at
  - Cost input
  - Content URL input
- **Quick-action buttons** (visible inline):
  - "Mark Sent" | "Mark Replied" | "Mark Ghosted" | "Mark Declined"
- **History accordion** — last 2 entries visible, "Show all" expands

### Filter Bar Additions
- **Status filter:** All | Drafted | Sent | Replied | Follow Up | In Negotiation | Contracted | Content Submitted | Live | Paid | Declined | Ghosted
- **Last outreach:** Any | Today | This Week | This Month | Never | Overdue Follow-up
- **Sort by:** Lead Score | Followers | Last Outreach Date | Status

---

## 7. Cron Changes

**No new crons.** Existing crons update status via API:
- `influencer-outreach-drafter` → POST `{ status: "drafted", body: "..." }`
- Manual CC actions → POST `{ status: "sent" }`, etc.

---

## 8. Implementation Order

| # | Task | Effort |
|---|------|--------|
| 1 | Migration 037 | 5 min |
| 2 | API: POST + GET routes | 20 min |
| 3 | Frontend: status badge + log modal | 45 min |
| 4 | Frontend: filter bar + quick actions | 20 min |
| 5 | Test end-to-end | 15 min |

**Total: ~1.7 hours**

---

## 9. Key Decisions (Gemini Reviewed)

1. **New table** — don't reuse `outreach_drafts`/`outreach_queue` (polymorphic FK mess)
2. **Self-contained drafts** — `subject` + `body` in log table, not linked to `outreach_drafts`
3. **Denormalize** — `last_outreach_at` + `last_outreach_status` on `influencer_pipeline` for fast UI
4. **11 statuses** — full lifecycle from draft to paid, with exits
5. **2 API routes** — POST log + GET history
6. **No existing table changes** except 2 nullable columns on `influencer_pipeline`

**Ready to build.**
