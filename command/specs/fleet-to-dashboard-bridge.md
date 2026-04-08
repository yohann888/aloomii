# Spec: Fleet-to-Dashboard Bridge
_Author: Leo (Sonnet) | Date: 2026-04-06 | Status: REVISED (post Gemini 3.1 Pro review)_

## Problem
The Command Center dashboard has live UI panels for signals, content queue, and tasks. But the cron fleet (signal-scout, pbn-content-brief, hunter-support-weekly, etc.) outputs only to Discord. The DB tables that feed the dashboard (`content_posts`, `prospect_signals`) have 0 rows. The `signals` table has 61 rows but only from older manual ingestion.

The result: a beautiful dashboard with no data in the Intel and Content sections.

## Goal
Every fleet output that currently goes to Discord ALSO writes structured data to PostgreSQL, so the Command Center renders it automatically. Discord remains the notification channel. DB becomes the persistence layer.

## Scope
Three ingest bridges, each a standalone Node.js script that can be `require()`'d by cron agents or run standalone:

---

## Bridge 1: Signal Scout → `prospect_signals` + `signals`

### Current Flow
```
signal-scout cron → reads Reddit/X/web → scores signals → posts to Discord
```

### New Flow
```
signal-scout cron → reads Reddit/X/web → scores signals → writes to DB → posts to Discord
```

### Implementation: `scripts/bridge/ingest-signal.js`

```js
/**
 * Usage (CLI):
 *   node scripts/bridge/ingest-signal.js '{"handle":"u/SomeUser","company":"Acme","signal_type":"reddit_signal","signal_source":"reddit","signal_text":"Looking for SDR replacement...","signal_url":"https://reddit.com/r/...","relevance_score":0.8,"score":4}'
 *
 * Usage (require):
 *   const { ingestSignal } = require('./bridge/ingest-signal');
 *   await ingestSignal({ handle, company, signal_type, signal_source, signal_text, signal_url, relevance_score, score });
 */
```

**What it does:**
1. Connects to `postgresql://superhana@localhost:5432/aloomii`
2. Generates `signal_hash` from `sha256(signal_url + handle + signal_text.slice(0,100))` for dedup
3. Inserts into `signals` table:
   - `signal_type` → map from scout types (reddit_signal, buying_signal, pain_signal, etc.)
   - `source_bu` → 'signal-scout'
   - `title` → first 120 chars of signal_text
   - `body` → full signal_text
   - `score` → numeric 0-5 (from scout scoring)
   - `source_url` → signal_url
   - `raw_data` → full JSON as JSONB
   - **Dedup:** `ON CONFLICT (source_url) WHERE source_url IS NOT NULL AND source_url <> '' DO NOTHING` (uses existing `idx_signals_source_url_dedup` unique index)
4. Inserts into `prospect_signals` table:
   - `client_id` → query `SELECT id FROM client_pilots LIMIT 1` at startup. If no rows, **skip prospect_signals insert entirely** (just write to `signals`). Never hardcode UUIDs.
   - `handle`, `company`, `signal_type`, `signal_source`, `signal_text`, `signal_url`
   - `relevance_score` → float 0-1
   - `signal_hash` → for dedup
   - **Dedup:** `prospect_signals.signal_hash` index is NOT unique. Use a pre-flight check: `SELECT id FROM prospect_signals WHERE signal_hash = $1 LIMIT 1`. If found, skip insert.
5. Returns `{ inserted: true/false, signal_id, prospect_signal_id }`

**⚠️ CONSTRAINT MAPPINGS (CRITICAL):**

`prospect_signals.signal_type` is constrained to: `job_change`, `funding`, `hiring`, `content_engagement`, `product_launch`, `regulatory_event`, `reddit_signal`, `indiehackers_signal`, `job_board`, `other`

The bridge MUST map scout signal types:
```js
const SIGNAL_TYPE_MAP = {
  'reddit_signal': 'reddit_signal',
  'indiehackers_signal': 'indiehackers_signal',
  'buying_signal': 'other',
  'pain_signal': 'other',
  'sales_intel_dwy': 'other',
  'pipeline_health': 'other',
  'sdr_replacement': 'other',
  'consulting': 'other',
  'funding_announced': 'funding',
  'expansion_signal': 'other',
  'job_change': 'job_change',
  'hiring': 'hiring',
  'product_launch': 'product_launch',
};
// Default: 'other' for any unmapped type
```

`prospect_signals.signal_source` is constrained to: `scrapling`, `x_search`, `linkedin`, `indiehackers`, `job_board`, `reddit`, `manual`, `other`

The bridge MUST map:
```js
const SIGNAL_SOURCE_MAP = {
  'reddit': 'reddit',
  'x': 'x_search',
  'x_search': 'x_search',
  'twitter': 'x_search',
  'linkedin': 'linkedin',
  'indiehackers': 'indiehackers',
  'scrapling': 'scrapling',
  'job_board': 'job_board',
};
// Default: 'other' for any unmapped source
```

### Signal Scout Integration
The cron agent's task prompt should be updated to include at the end:
```
After scoring each signal, if score >= 3, run:
  node scripts/bridge/ingest-signal.js '<JSON>'
before announcing to Discord. This writes the signal to the database for the Command Center dashboard.
```

---

## Bridge 2: PBN Content Brief → `content_posts`

### Current Flow
```
pbn-content-brief cron → generates brief → posts to Discord
```

### New Flow
```
pbn-content-brief cron → generates brief → writes to DB → posts to Discord
```

### Implementation: `scripts/bridge/ingest-content.js`

```js
/**
 * Usage (CLI):
 *   node scripts/bridge/ingest-content.js '{"platform":"pbn","post_type":"brief","topic":"Weekly Content Brief","content_text":"...full brief markdown...","scheduled_at":"2026-04-06T08:00:00Z"}'
 *
 * Usage (require):
 *   const { ingestContent } = require('./bridge/ingest-content');
 *   await ingestContent({ platform, post_type, topic, content_text, media_url, scheduled_at });
 */
```

**What it does:**
1. Connects to PostgreSQL
2. Inserts into `content_posts`:
   - `platform` → 'pbn' | 'linkedin' | 'tiktok' | 'x' | 'blog'
   - `post_type` → 'brief' | 'clip' | 'post' | 'thread' | 'newsletter'
   - `topic` → title/subject
   - `content_text` → full content (markdown OK)
   - `media_url` → optional media link
   - `scheduled_at` → when it should publish (null = immediate)
   - `published_at` → NOW() if no scheduled_at
3. Returns `{ inserted: true, post_id }`

**Content types this bridges:**
- PBN weekly briefs → `platform: 'pbn', post_type: 'brief'`
- PBN clip suggestions → `platform: 'pbn', post_type: 'clip'`
- LinkedIn posts (from content engine) → `platform: 'linkedin', post_type: 'post'`
- Blog articles → `platform: 'blog', post_type: 'post'`

### PBN Content Brief Integration
Add to the end of `scripts/pbn-content-brief.js` (after Discord delivery):
```js
// Write to DB for Command Center
try {
  const { ingestContent } = require('./bridge/ingest-content');
  await ingestContent({
    platform: 'pbn',
    post_type: 'brief',
    topic: `PBN Weekly Content Brief - ${today}`,
    content_text: briefMarkdown,
    scheduled_at: null
  });
} catch (e) {
  console.warn('DB bridge failed (non-fatal):', e.message);
}
```

---

## Bridge 3: Hunter Support → `tasks` (new table)

### Problem
Hunter support checklists are structured task lists. There's no `tasks` table yet.

### Migration: `infra/db/migrations/020_tasks_table.sql`

```sql
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    assignee TEXT,              -- 'yohann', 'jenny', 'leo', etc.
    source TEXT NOT NULL,       -- 'hunter-support', 'senior-pm', 'manual'
    category TEXT,              -- 'sales', 'content', 'ops', 'client'
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'done', 'skipped')),
    priority TEXT DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    metadata JSONB,             -- flexible: { client_id, contact_id, brief_url, etc. }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_status ON tasks(status) WHERE status != 'done';
CREATE INDEX idx_tasks_assignee ON tasks(assignee, status);
CREATE INDEX idx_tasks_source ON tasks(source);
CREATE INDEX idx_tasks_due ON tasks(due_date) WHERE status = 'pending';
```

### Implementation: `scripts/bridge/ingest-tasks.js`

```js
/**
 * Usage (CLI):
 *   node scripts/bridge/ingest-tasks.js '{"tasks":[{"title":"Draft LinkedIn comments","assignee":"jenny","category":"content","priority":"normal","due_date":"2026-04-06"}],"source":"hunter-support"}'
 *
 * Usage (require):
 *   const { ingestTasks } = require('./bridge/ingest-tasks');
 *   await ingestTasks({ source: 'hunter-support', tasks: [...] });
 */
```

**What it does:**
1. Takes an array of tasks with title, assignee, category, priority, due_date
2. Batch inserts into `tasks` table
3. Dedup: skip if exact (title + assignee + due_date) combo exists with status != 'done'
4. Returns `{ inserted: N, skipped: N }`

### Hunter Support Integration
The hunter-support cron agent should parse its checklist into structured tasks and call the bridge.

---

## Bridge 4: Command Center API Updates

### `command-api.js` additions

**New query block — Tasks:**
```js
async () => {
  try {
    const tasksRes = await query(`
      SELECT * FROM tasks
      WHERE status IN ('pending', 'in_progress')
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        due_date ASC NULLS LAST
      LIMIT 50
    `);
    data.tasks = tasksRes.rows;
  } catch (e) {
    console.warn('Tasks query failed:', e.message);
    data.tasks = [];
  }
}
```

**New PATCH route — Task status:**
```js
app.patch('/api/command/tasks/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  // Validate status, update task, return updated row
});
```

**Update initial data shape** — add `tasks: []` to the response object.

### Frontend: Tasks Widget on HQ

Add a "Tasks" card to the HQ section (after the metrics row):
- Shows pending tasks grouped by assignee
- Each task: checkbox to mark done, title, category badge, due date
- Click checkbox → PATCH /api/command/tasks/:id/status { status: 'done' }
- Empty state: "All clear. No pending tasks."

### Frontend: Content Queue in Intel

The existing `#content-queue-container` should now render `data.content_queue` (from `content_posts` table):
- Each item: platform icon, topic, post_type badge, scheduled/published date
- Click to expand: shows full content_text

---

## File Inventory

| File | Action | Description |
|---|---|---|
| `scripts/bridge/ingest-signal.js` | CREATE | Signal → DB bridge |
| `scripts/bridge/ingest-content.js` | CREATE | Content → DB bridge |
| `scripts/bridge/ingest-tasks.js` | CREATE | Tasks → DB bridge |
| `infra/db/migrations/020_tasks_table.sql` | CREATE | Tasks table migration |
| `scripts/dashboard/command-api.js` | EDIT | Add tasks query + PATCH route + data.tasks |
| `command/app.js` | EDIT | Add renderTasks() + renderContentQueue() + wire to HQ |
| `command/index.html` | EDIT | Add tasks widget to HQ section |
| `command/styles.css` | APPEND | Task card + content queue styles |

## Dependencies
- `pg` npm package (already available via command-api.js)
- PostgreSQL 18 running locally
- All bridge scripts are non-fatal: if DB is down, cron agents still post to Discord

## Connection Safety (MANDATORY)
All bridge scripts MUST enforce strict timeouts to prevent blocking cron agents:
```js
const client = new Client({
  connectionString: DB_URL,
  connectionTimeoutMillis: 2000,  // fail fast if Postgres is down
  idle_in_transaction_session_timeout: 3000,
  statement_timeout: 3000,        // no query runs longer than 3s
});
```

All scripts MUST explicitly call `await client.end()` in a `finally` block after DB operations. If omitted, the Node.js process will hang waiting on the idle connection.

```js
const client = new Client({ ... });
try {
  await client.connect();
  // ... do work ...
} finally {
  await client.end();
}
```

All queries MUST use parameterized syntax (`$1`, `$2`, etc.) — never string interpolation.

## Testing
Each bridge script should be testable standalone:
```bash
node scripts/bridge/ingest-signal.js '{"handle":"test-user","signal_type":"reddit_signal","signal_source":"reddit","signal_text":"test signal","signal_url":"https://test.com/1","relevance_score":0.5,"score":3}'

node scripts/bridge/ingest-content.js '{"platform":"pbn","post_type":"brief","topic":"Test Brief","content_text":"Test content"}'

node scripts/bridge/ingest-tasks.js '{"source":"manual","tasks":[{"title":"Test task","assignee":"yohann","category":"ops"}]}'
```

Then verify in Command Center: reload page, check CRM signals tab, Intel content queue, and HQ tasks widget.
