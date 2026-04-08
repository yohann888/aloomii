# Spec: Cron-to-Dashboard Bridge Wave 2
_Author: Leo (Sonnet) | Date: 2026-04-06 | Status: REVISED (post Gemini 3.1 Pro review v2)_

## Context
Wave 1 bridged signal-scout, pbn-content-brief, and hunter-support to the Command Center DB. Wave 2 bridges 4 more crons to eliminate remaining hardcoded data and make the dashboard fully live.

---

## Bridge A: Event Scanner → `events` table (already exists, 39 rows)

### Current State
- Event scanner cron runs Mon+Thu 6AM, searches Luma/Eventbrite/Gemini for events
- It writes to `events` table via SQL INSERT already (the SOP has DB upsert logic)
- BUT the Command Center HQ events strip is **hardcoded HTML** (3 static event cards)
- The API `/api/command` already queries `events` table and returns `data.events`

### Problem
The events data is in the DB. The API returns it. But the frontend events strip ignores it and shows hardcoded cards.

### Fix (Frontend only — no bridge script needed)

**1. Update `command/app.js`** — add `renderEventsStrip(events)`:
```js
function renderEventsStrip(events) {
  const strip = document.querySelector('.events-strip');
  if (!strip) return;
  
  strip.innerHTML = '';
  
  if (!events || events.length === 0) {
    strip.innerHTML = '<div class="empty-state">No upcoming events</div>';
    return;
  }
  
  events.forEach(event => {
    const card = document.createElement('div');
    card.className = 'event-card';
    
    // Format date
    const date = event.date ? new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD';
    const location = [event.city, event.country].filter(Boolean).join(', ');
    const contactCount = event.contact_overlap || 0;
    
    // Match status → badge class
    const badgeClass = event.match_status || 'monitor';
    
    card.innerHTML = `
      <div class="event-title">${event.name}</div>
      <div class="event-meta">${date}, ${location} • ${contactCount} contacts</div>
      ${event.match_status ? `<span class="badge ${badgeClass}">${badgeClass}</span>` : ''}
      ${event.url ? `<a href="${event.url}" target="_blank" class="event-link">→</a>` : ''}
    `;
    strip.appendChild(card);
  });
}
```

**2. Wire into `updateHQFromData(data)`** — add call:
```js
if (data.events) renderEventsStrip(data.events);
```

**3. Remove hardcoded events from `command/index.html`** — replace the static `.events-strip` content with just the empty container:
```html
<div class="events-strip" id="events-strip"></div>
```

---

## Bridge B: Reconnection Engine → `outreach_queue`

### Current State
- `scripts/reconnection-engine.js` already writes to `outreach_drafts` table (step 5 in its header comment)
- It already updates `contacts.last_outreach_date` (step 8)
- BUT it does NOT create an `outreach_queue` entry
- The Command Center CRM "Queue" tab reads from `outreach_queue`

### Fix: Add outreach_queue insert to reconnection-engine.js

**⚠️ FK ORDER MATTERS:** `outreach_drafts.outreach_queue_id` is a FK to `outreach_queue.id`. You MUST insert the queue entry FIRST, get its ID, then use that ID when inserting the draft.

**Step 1 — Insert outreach_queue FIRST:**
```sql
INSERT INTO outreach_queue (contact_id, type, channel, draft, status, fire_date)
VALUES ($1, 'reconnection', $2, $3, 'pending', CURRENT_DATE)
RETURNING id;
```

**Step 2 — Insert outreach_drafts with the queue ID:**
```sql
INSERT INTO outreach_drafts (..., outreach_queue_id)
VALUES (..., $queue_id)
RETURNING id;
```

Where:
- `$1` = contact_id (already available)
- `$2` = suggested channel from the draft (email/linkedin/twitter)
- `$3` = draft text (first 500 chars as preview)
- `$queue_id` = the UUID returned from step 1

**Edit location:** In `~/.openclaw/workspace/scripts/reconnection-engine.js` (NOT ~/Desktop/aloomii/scripts/). Find the section that does `INSERT INTO outreach_drafts`. Restructure: insert queue FIRST, capture its ID, then pass it to the drafts INSERT.

**Connection safety:** The script already uses a `Pool` with pg — no new connection needed. Just add the query in the same transaction block.

---

## Bridge C: Spend Alert → `economics` (API update)

### Current State
- `scripts/dashboard/daily-spend-alert.js` runs every 2h, calls `openclaw gateway call usage.cost`, parses JSON
- It posts to Discord if over threshold
- The Command Center API returns hardcoded `economics: { weekly_cost_usd: 12.10, human_value_usd: 1258, roi_multiplier: 104 }`
- The HQ "System Economics" card and "Weekly Compute" stat show these hardcoded values

### Fix: Bridge script + API update

**1. Create `scripts/bridge/ingest-economics.js`**

```js
/**
 * Writes daily cost snapshot to a simple DB table for the Command Center.
 *
 * Usage (CLI):
 *   node scripts/bridge/ingest-economics.js '{"date":"2026-04-06","cost_usd":4.32,"input_tokens":500000,"output_tokens":120000}'
 *
 * Usage (require):
 *   const { ingestEconomics } = require('./bridge/ingest-economics');
 *   await ingestEconomics({ date, cost_usd, input_tokens, output_tokens });
 */
```

**2. Migration: `infra/db/migrations/021_economics_daily.sql`**

```sql
CREATE TABLE IF NOT EXISTS economics_daily (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    input_tokens BIGINT DEFAULT 0,
    output_tokens BIGINT DEFAULT 0,
    cache_read_tokens BIGINT DEFAULT 0,
    cache_write_tokens BIGINT DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_economics_daily_date ON economics_daily(date DESC);
```

**3. Update `daily-spend-alert.js`** — after computing today's cost, call the bridge:
```js
try {
  const { ingestEconomics } = require('../bridge/ingest-economics');
  await ingestEconomics({
    date: new Date().toISOString().split('T')[0],
    cost_usd: todayCost,
    input_tokens: data.input_tokens || 0,
    output_tokens: data.output_tokens || 0
  });
} catch (e) {
  console.warn('Economics bridge failed (non-fatal):', e.message);
}
```

**4. Update `command-api.js`** — replace hardcoded economics with real data:
```js
async () => {
  try {
    // Last 7 days cost
    const weekRes = await query(`
      SELECT COALESCE(SUM(cost_usd), 0) as weekly_cost
      FROM economics_daily
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
    `);
    
    // Previous 7 days for delta
    const prevRes = await query(`
      SELECT COALESCE(SUM(cost_usd), 0) as prev_cost
      FROM economics_daily
      WHERE date >= CURRENT_DATE - INTERVAL '14 days'
        AND date < CURRENT_DATE - INTERVAL '7 days'
    `);
    
    const weeklyCost = parseFloat(weekRes.rows[0]?.weekly_cost || 0);
    const prevCost = parseFloat(prevRes.rows[0]?.prev_cost || 0);
    const delta = prevCost > 0 ? ((weeklyCost - prevCost) / prevCost * 100).toFixed(0) : 0;
    
    // Human equivalent calculation:
    // Each active agent replaces ~2hrs/week of human work at $75/hr
    // Query active agent count from fleet data (already in data.fleet)
    const activeAgents = (data.fleet?.healthy || 0) + (data.fleet?.attention || 0);
    const humanHoursPerWeek = activeAgents * 2; // 2 hrs/week per agent
    const humanEquiv = Math.round(humanHoursPerWeek * 75); // $75/hr market rate
    
    data.economics = {
      weekly_cost_usd: Math.round(weeklyCost * 100) / 100,
      human_value_usd: humanEquiv,
      roi_multiplier: weeklyCost > 0 ? Math.round(humanEquiv / weeklyCost) : 104,
      delta_pct: parseInt(delta),
      daily_breakdown: [] // could add per-day data later
    };
  } catch (e) {
    console.warn('Economics query failed:', e.message);
    data.economics = { weekly_cost_usd: 0, human_value_usd: 0, roi_multiplier: 0 };
  }
}
```

---

## Bridge D: Senior PM Daily → Briefing Card (API + Frontend)

### Current State
- `senior-pm-daily` cron writes to `daily/pm-brief.md` and posts to Discord
- The Command Center HQ briefing card shows data computed from DB queries (decay, drafts, stalled opps, signals, overdue)
- This is actually already working! The API computes briefing data from live DB state

### Problem
The briefing is good but missing the PM's strategic recommendations (follow-ups, event prep, etc.). The raw DB counts are useful but the PM adds context.

### Fix: Store PM brief in tasks table + render as "Today's Focus" widget

**1. Update senior-pm-daily cron prompt** — add at the end:
```
After writing the brief to daily/pm-brief.md and announcing to Discord, also extract the top 3-5 action items and write them to the Command Center task database.

Write the JSON to a temp file first (avoids shell escaping issues with single quotes in task titles):
  1. Write the tasks JSON to /tmp/pm-tasks.json
  2. Run: cat /tmp/pm-tasks.json | node /Users/superhana/Desktop/aloomii/scripts/bridge/ingest-tasks.js

The JSON format is: {"source":"senior-pm","tasks":[{"title":"action item","assignee":"yohann","category":"sales|ops|content|client","priority":"high|normal","due_date":"YYYY-MM-DD"},...]}

⚠️ Do NOT pass JSON as a CLI argument in single quotes — task titles may contain apostrophes which break shell quoting. Always use the temp file + pipe approach.

This ensures action items appear in the Command Center HQ tasks widget. Non-blocking — if it fails, continue.
```

**2. Frontend: filter tasks by source** — The tasks widget already renders from `data.tasks`. PM tasks will show up with `source: 'senior-pm'`. Optionally group by source in the renderer for visual separation.

---

## Connection Safety Rules (apply to ALL new code)
All bridge scripts MUST:
- Use `connectionTimeoutMillis: 2000` and `statement_timeout: 3000`
- Call `await client.end()` in a `finally` block
- Use parameterized queries (`$1`, `$2`)
- Return a result object (never throw to caller)
- Handle missing tables gracefully (try/catch per query)

---

## File Inventory

| File | Action | Owner | Description |
|---|---|---|---|
| `command/app.js` | EDIT | Frontend | Add `renderEventsStrip()`, wire to data refresh |
| `command/index.html` | EDIT | Frontend | Remove hardcoded events, add empty container |
| `~/.openclaw/workspace/scripts/reconnection-engine.js` | EDIT | Backend | Add `outreach_queue` INSERT BEFORE drafts insert (FK order) |
| `scripts/bridge/ingest-economics.js` | CREATE | Backend | Economics → DB bridge |
| `infra/db/migrations/021_economics_daily.sql` | CREATE | Backend | Economics table |
| `~/.openclaw/workspace/scripts/dashboard/daily-spend-alert.js` | EDIT | Backend | Add bridge call after cost computation |
| `scripts/dashboard/command-api.js` | EDIT | Backend | Replace hardcoded economics with DB query |
| `~/.openclaw/cron/jobs.json` | EDIT | Backend | Update senior-pm-daily prompt |

## Task Split

**Gemma 4 (Frontend):**
- Bridge A: renderEventsStrip + HTML cleanup + wiring
- Bridge D frontend: tasks widget already renders, but add source-based grouping ("PM Actions" vs "Hunter Tasks" headers)

**MiniMax 2.7 (Backend):**
- Bridge B: reconnection-engine.js outreach_queue insert
- Bridge C: economics table + bridge script + spend-alert integration + API update
- Bridge D backend: senior-pm-daily cron prompt update

## Testing
After build:
1. `curl localhost:3200/api/command | python3 -c "import sys,json; d=json.load(sys.stdin); print('events:', len(d['events']), '| economics:', d['economics'], '| tasks:', len(d.get('tasks',[])))"` — should show 39 events, real economics (or 0 if no data yet), and any tasks
2. Reload Command Center — events strip should show real events from DB
3. Run `node scripts/bridge/ingest-economics.js '{"date":"2026-04-06","cost_usd":4.32}'` — then verify economics update in API response
