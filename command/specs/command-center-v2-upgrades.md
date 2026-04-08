# Spec: Command Center v2 Upgrades
_Author: Leo (Sonnet) | Date: 2026-04-06 | Status: PENDING GEMINI PRO REVIEW_

## Context
Command Center v1 is built (7 phases + 2 bridge waves). It works but has rough edges. These upgrades transform it from a functional dashboard into a daily-driver operations tool.

---

## Upgrade 1: Signals Intelligence Tab (complete redesign)

### Problem
The signals tab shows raw DB fields (`reddit_signal`, truncated text, numeric relevance scores). It's not actionable. Yohann needs: source, link, score, reasoning, and one-click outreach.

### Design

**New signal card layout:**
```
┌─────────────────────────────────────────────────────┐
│ 🔴 Score 4.2/5                        Reddit signal │
│                                                      │
│ "Looking for SDR replacement... hit $50K MRR but     │
│ invisible in market. Tried freelancers, nothing      │
│ stuck."                                              │
│                                                      │
│ 👤 u/Academic_Flamingo302 • r/smallbusiness          │
│ 🏢 B2B consulting/service operator                   │
│ 🎯 ICP Match: The Table (Sprint)                     │
│                                                      │
│ 💡 Why scored high: Founder at $50K+ MRR, no         │
│    marketing function, tried and failed with          │
│    freelancers. Classic Sprint ICP.                   │
│                                                      │
│ 🔗 reddit.com/r/smallbusiness/comments/1sd...  →     │
│                                                      │
│ [Draft Outreach]  [Dismiss]  [Snooze 7d]            │
└─────────────────────────────────────────────────────┘
```

### Implementation

**1. API enrichment (`command-api.js`):**
- The `signals` table has `raw_data JSONB` which stores the full signal JSON from signal-scout, including:
  - `signal_text` (the quote)
  - `source_url` (permalink)
  - `score` (1-5)
  - The signal scout doesn't currently store reasoning. Add `scoring_reason` to the bridge ingest.
- `prospect_signals` has `handle`, `company`, `signal_type`, `signal_source`, `relevance_score`
- Join signals + entity_signals + contacts to get ICP match info

Update the signals query to return richer data:
```sql
SELECT 
  s.*,
  es.entity_id,
  es.relevance_score,
  c.name as contact_name,
  c.tier as contact_tier,
  s.raw_data->>'scoring_reason' as scoring_reason,
  s.raw_data->>'icp_match' as icp_match,
  s.raw_data->>'handle' as handle,
  s.raw_data->>'subreddit' as subreddit
FROM signals s
LEFT JOIN entity_signals es ON s.id = es.signal_id
LEFT JOIN contacts c ON es.entity_id = c.id
WHERE s.score >= 3
ORDER BY s.created_at DESC
LIMIT 50
```

**2. Frontend signal card (`app.js` + `styles.css`):**
- Redesign `renderSignals()` with the card layout above
- Score indicator: color-coded bar (red 4+, amber 3-4, gray <3)
- Source icon: Reddit 🔗, X/Twitter 𝕏, LinkedIn 💼, Other 🌐
- Truncated quote with expand on click
- "Draft Outreach" button → opens outreach compose panel pre-filled with contact + context
- "Dismiss" → marks signal as `acted_on: true, outcome: 'not_relevant'`
- "Snooze" → hides for 7 days (add `snoozed_until` field or use metadata)
- Filter bar: by source (Reddit/X/LinkedIn), by score (3+/4+/5), by ICP match, by date range

**3. Update `ingest-signal.js` bridge:**
- Accept `scoring_reason` and `icp_match` fields in the JSON payload
- Store them in `signals.raw_data` JSONB

**4. Update signal-scout SOP:**
- When calling the bridge, include `scoring_reason` (1-2 sentence explanation of why scored high) and `icp_match` (which ICP: Sprint/AI Workforce/Deal Flow)

---

## Upgrade 2: Outreach Draft → Learn Loop Pipeline

### Problem
Outreach drafts exist in `outreach_drafts` table. The learn-loop cron analyzes them weekly. But there's no closed loop: edits aren't tracked as training data.

### Design

**Draft lifecycle:**
```
Signal detected → Auto-draft generated → Yohann reviews in Command Center
  → Edits draft → Saves → Both versions stored (original + edited)
  → Approves → Queued for send
  → Learn-loop picks up (original, edited, outcome) → Improves future drafts
```

### Implementation

**1. Schema update (`infra/db/migrations/022_draft_learning.sql`):**
```sql
ALTER TABLE outreach_drafts 
  ADD COLUMN IF NOT EXISTS original_text TEXT,
  ADD COLUMN IF NOT EXISTS edit_distance INTEGER,
  ADD COLUMN IF NOT EXISTS edit_categories JSONB,
  ADD COLUMN IF NOT EXISTS learning_processed BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_drafts_learning ON outreach_drafts(learning_processed) 
  WHERE learning_processed = FALSE AND status = 'approved';
```

**2. API update (`command-api.js`):**
- `POST /api/command/drafts/:id/approve`:
  - Before saving `edited_text`, compute `edit_distance` (Levenshtein or word-level diff count)
  - Categorize edits: `{ tone_change: bool, length_change: 'shorter'|'longer'|'same', personalization_added: bool, cta_changed: bool }`
  - Store original_text = current text, edited_text = new text
  - Set `learning_processed = false` so learn-loop picks it up

**3. Frontend draft panel (`app.js`):**
- When editing a draft, show a live diff preview (highlight what changed)
- After saving: toast "Draft saved. Learn Loop will analyze your edits this week."
- Show a small "AI Score" vs "Your Score" comparison (the original draft score vs post-edit score)

**4. Learn-loop integration:**
- The learn-loop cron (`sops/learn-loop.md`) already queries `outreach_drafts`. Add to its query:
  ```sql
  WHERE learning_processed = FALSE 
    AND status = 'approved' 
    AND edited_text IS NOT NULL
  ```
- After processing, set `learning_processed = true`
- Learn-loop should output: "This week's patterns: Yohann shortened 80% of drafts, added personal references 60% of the time, removed CTAs in 30% of cases"

---

## Upgrade 3: Production Deploy (aloomii.com/command)

### Problem
Currently runs on localhost:3200. Needs to be accessible at `command.aloomii.com` or `aloomii.com/command` behind authentication.

### Implementation

**1. Cloudflare Tunnel:**
```bash
# Add to existing cloudflared config or create new tunnel
cloudflared tunnel route dns aloomii-tunnel command.aloomii.com
# Points to localhost:3200
```

**2. Cloudflare Access Policy:**
- Create Access Application for `command.aloomii.com`
- Auth method: email allowlist (yohann@aloomii.com, jenny@aloomii.com)
- Grab the Audience (AUD) tag
- Set `CF_AUD` env var in `command/config.js`

**3. Server updates (`serve-local.js`):**
- Add Cloudflare Access JWT validation middleware (verify the `CF_Authorization` cookie against the AUD tag)
- Remove or keep the password gate as a secondary layer
- Add `CF_AUD` check: if present, validate JWT; if absent, fall back to password gate (dev mode)
- HTTPS is handled by Cloudflare — server stays HTTP

**4. Auto-start:**
- Add to system startup (launchd plist or add to existing startup script)
- Or: run via OpenClaw cron as a long-running process

**5. Domain setup:**
- `command.aloomii.com` → CNAME to tunnel
- SSL: Cloudflare handles it

---

## Upgrade 4: Signal → Outreach One-Click Flow

### Problem
Currently: see signal → manually find contact → open outreach panel → write draft. Too many steps.

### Design
**One-click flow:** Signal card "Draft Outreach" → auto-creates outreach_queue entry + pre-fills draft with:
- Recipient: handle/name from signal
- Context: the signal quote + source
- Suggested angle: based on ICP match
- Channel: based on signal source (Reddit signal → Reddit reply, X signal → X DM, etc.)

### Implementation

**1. New API route: `POST /api/command/signals/:id/draft`**
```js
// 1. Get signal details
// 2. Find or create contact from handle
// 3. Create outreach_queue entry
// 4. Auto-generate draft using signal context (template-based, no AI call needed)
// 5. Create outreach_drafts entry linked to queue
// 6. Return { queue_id, draft_id, draft_text }
```

**2. Draft template engine (`scripts/bridge/draft-templates.js`):**
```js
const templates = {
  reddit_reply: (signal) => `Hey ${signal.handle}, saw your post about ${signal.topic}. ${signal.angle}. Would love to share what's worked for founders in your position. Mind if I DM you?`,
  linkedin_connect: (signal) => `Hi ${signal.contact_name} — noticed ${signal.company} is ${signal.signal_summary}. We've been helping founders at your stage with exactly this. Would love to connect.`,
  email_cold: (signal) => `Subject: ${signal.topic}\n\n${signal.contact_name},\n\n${signal.angle}\n\nWorth a 15-min call this week?`,
};
```

**3. Frontend:** "Draft Outreach" button on signal card → calls API → opens outreach panel with pre-filled draft → Yohann edits → approves → goes to queue + learn-loop.

---

## Upgrade 5: Real-Time Notifications (WebSocket)

### Problem
Dashboard polls every 5 minutes. New signals, completed outreach, or alerts don't show up until refresh.

### Implementation
- Add WebSocket server to `serve-local.js` (use `ws` npm package)
- Bridge scripts emit events after DB writes: `{ type: 'new_signal', data: {...} }`
- Frontend connects on load, receives events, updates UI without full refresh
- Notification bell updates in real-time
- Toast on new high-score signal: "🚨 New Score 4+ signal from r/startups"

---

## Upgrade 6: Client Pilot Dashboard View

### Problem
The Command Center is Yohann's ops view. But clients (Westland, BiS, SpiceNet, etc.) need their own view showing their deliverables, signals found for them, and pipeline progress.

### Implementation
- Add `/client/:id` route that shows a filtered view
- Only shows: signals matched to that client, outreach for their contacts, content produced for them, timeline of deliverables
- Authenticated via Cloudflare Access (per-client email allowlist)
- Reuses existing components with a client_id filter
- Each client sees only their data (row-level filtering by client_pilots.id)

---

## Priority Order

| # | Upgrade | Impact | Effort | Dependencies |
|---|---------|--------|--------|---|
| 1 | Signals Intelligence Tab | 🔴 High | Medium | Bridge ingest update |
| 2 | Outreach → Learn Loop | 🔴 High | Medium | Migration + API |
| 3 | Signal → Outreach One-Click | 🔴 High | Medium | Upgrade 1 |
| 4 | Production Deploy | 🟡 Medium | Low | cloudflared config |
| 5 | Real-Time Notifications | 🟡 Medium | Medium | ws package |
| 6 | Client Dashboard View | 🟢 Future | High | Upgrades 1-4 |

## Suggested Build Split

**Phase A (Upgrades 1 + 2 — Signal Intelligence + Learn Loop):**
- MiniMax 2.7: API enrichment, schema migration, bridge updates, learn-loop query update
- Gemma 4: Signal card redesign, draft panel diff preview, CSS

**Phase B (Upgrades 3 + 4 — Deploy + One-Click Flow):**
- MiniMax 2.7: Cloudflare tunnel/access setup, draft template engine, API route
- Gemma 4: One-click flow frontend, deploy config

**Phase C (Upgrade 5 — WebSocket):**
- MiniMax 2.7: WebSocket server + bridge event emitters
- Gemma 4: Frontend WebSocket client + real-time UI updates

**Phase D (Upgrade 6 — Client View):**
- Full build after Phases A-C stable
