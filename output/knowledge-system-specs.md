# Knowledge System Recommendations: Build Specs

## 1. Decisions Table + Cross-Referencing Memory

### DB Schema
```sql
CREATE TABLE decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    context TEXT NOT NULL,           -- "Wrangler deploy for PBN"
    rationale TEXT,                -- "GitHub Action has 39 failures"
    reversibility VARCHAR(20) CHECK (reversibility IN ('reversible', 'irreversible', 'partial')),
    owner VARCHAR(100),            -- "Yohann" or agent name
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'reversed', 'superseded')),
    source_message_id VARCHAR(100),  -- Discord message ID that triggered it
    memory_file_path VARCHAR(200),   -- "memory/decisions-log.md"
    tags TEXT[] DEFAULT '{}',
    search_vector TSVECTOR
);

CREATE INDEX idx_decisions_created ON decisions(created_at DESC);
CREATE INDEX idx_decisions_status ON decisions(status);
CREATE INDEX idx_decisions_tags ON decisions USING GIN(tags);
CREATE INDEX idx_decisions_search ON decisions USING GIN(search_vector);

-- Trigger to auto-update search_vector
CREATE OR REPLACE FUNCTION update_decision_search()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', COALESCE(NEW.context, '') || ' ' || COALESCE(NEW.rationale, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER decisions_search_update
    BEFORE INSERT OR UPDATE ON decisions
    FOR EACH ROW EXECUTE FUNCTION update_decision_search();
```

### Implementation
- **Phase 1:** Add table, backfill from `memory/decisions-log.md` via script
- **Phase 2:** Update agent logic: when user says "decided" or "let's go with", INSERT into decisions + append to decisions-log.md
- **Phase 3:** Build `!decision` Discord command to query: "!decision wrangler" → returns matching decisions

### Cross-Referencing
- Add `memory_entities` table: links between markdown files and DB entities
- When daily note mentions a contact name matching `contacts.name`, auto-create link
- Agent queries: "what did we decide about X?" → checks decisions table first, falls back to grep on memory files

---

## 2. Daily Brief Cron

### Cron Config
```yaml
# Add to cron fleet
daily-brief:
  schedule: "0 6 * * 1-5"  # 6 AM, weekdays
  model: gemini-3.1-pro-preview
  script: scripts/crons/daily-brief.js
```

### Script: `scripts/crons/daily-brief.js`
```javascript
// 1. Query DB for last 24h signals
const signals = await db.query(`
    SELECT s.*, c.name, c.company, c.tier 
    FROM signals s 
    LEFT JOIN contacts c ON s.contact_id = c.id 
    WHERE s.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY s.severity DESC 
    LIMIT 10
`);

// 2. Query last 7 days activities
const activities = await db.query(`
    SELECT a.*, c.name 
    FROM activities a
    LEFT JOIN contacts c ON a.contact_id = c.id
    WHERE a.created_at > NOW() - INTERVAL '7 days'
    ORDER BY a.created_at DESC
`);

// 3. Query contacts with no touch in 14 days
const staleContacts = await db.query(`
    SELECT c.*, MAX(a.created_at) as last_touch
    FROM contacts c
    LEFT JOIN activities a ON c.id = a.contact_id
    WHERE c.tier = 'Tier 1'
    GROUP BY c.id
    HAVING MAX(a.created_at) < NOW() - INTERVAL '14 days' OR MAX(a.created_at) IS NULL
    ORDER BY c.updated_at DESC
    LIMIT 10
`);

// 4. Build prompt for agent
const prompt = `You are the Chief of Staff for Aloomii. Here is yesterday's intelligence:

NEW SIGNALS (${signals.length}):
${signals.map(s => `- ${s.severity}/5: ${s.title} (${s.source_type})`).join('\n')}

RECENT ACTIVITIES (${activities.length}):
${activities.slice(0, 5).map(a => `- ${a.type}: ${a.description} (${a.name})`).join('\n')}

STALE TIER 1 CONTACTS (${staleContacts.length}):
${staleContacts.map(c => `- ${c.name} (${c.company}) — last touch: ${c.last_touch || 'never'}`).join('\n')}

Do three things:

CONNECTIONS — Find 3 most interesting connections between recent signals and older context. Be specific.
PATTERN — Identify 1 pattern across this week's captures. What is the market working on?
ACTION — Suggest 1 outreach action. One contact. One reason. One message.

Format as clean markdown. No fluff.`;

// 5. Call agent, save to file, post to Discord if hot signals
const brief = await agent.generate(prompt);
const filename = `memory/daily-brief/${today}.md`;
await fs.writeFile(filename, brief);

// 6. Post to Discord if severity 4+ signals exist
if (signals.some(s => s.severity >= 4)) {
    await discord.post(`🔥 Daily Brief — Hot signals detected:\n${brief.substring(0, 2000)}`);
}
```

### Output Format
```markdown
# Daily Brief — 2026-05-08

## Connections
1. [Signal] connects to [Contact/Deal] because...
2. ...
3. ...

## Pattern
This week the market is clearly working on...

## Action
Reach out to [Name] because [reason].
Suggested message: "..."
```

---

## 3. Weekly Synthesis Cron

### Cron Config
```yaml
weekly-synthesis:
  schedule: "0 7 * * 1"  # Monday 7 AM
  model: gemini-3.1-pro-preview
  script: scripts/crons/weekly-synthesis.js
```

### Script: `scripts/crons/weekly-synthesis.js`
```javascript
// 1. Query last 7 days of everything
const weekData = await db.query(`
    SELECT 
        (SELECT COUNT(*) FROM signals WHERE created_at > NOW() - INTERVAL '7 days') as signal_count,
        (SELECT COUNT(*) FROM activities WHERE created_at > NOW() - INTERVAL '7 days') as activity_count,
        (SELECT COUNT(*) FROM contacts WHERE created_at > NOW() - INTERVAL '7 days') as new_contacts,
        (SELECT COUNT(*) FROM mood_signals WHERE created_at > NOW() - INTERVAL '7 days') as mood_count,
        (SELECT COUNT(*) FROM content_drafts WHERE created_at > NOW() - INTERVAL '7 days') as draft_count
`);

// 2. Get top signals by category
const topSignals = await db.query(`
    SELECT pain_category, COUNT(*) as count, AVG(severity) as avg_severity
    FROM signals 
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY pain_category
    ORDER BY count DESC
    LIMIT 5
`);

// 3. Build prompt
const prompt = `You are the Chief of Staff for Aloomii. Here is the full week:

WEEK STATS:
- ${weekData.signal_count} new signals
- ${weekData.activity_count} activities logged
- ${weekData.new_contacts} new contacts
- ${weekData.mood_count} mood signals
- ${weekData.draft_count} content drafts

TOP SIGNAL CATEGORIES:
${topSignals.map(s => `- ${s.pain_category}: ${s.count} signals (avg severity: ${s.avg_severity.toFixed(1)})`).join('\n')}

I want four things:

EMERGING THESIS — What opportunity is forming without being stated explicitly?
CONTRADICTIONS — What did we learn that contradicts previous beliefs?
KNOWLEDGE GAPS — What are we clearly not monitoring?
ONE ACTION — The single highest-leverage thing to execute this week.

Be direct. Challenge assumptions.`;

// 4. Generate and save
const synthesis = await agent.generate(prompt);
const weekNum = getWeekNumber();
const filename = `memory/weekly-synthesis/2026-W${weekNum}.md`;
await fs.writeFile(filename, synthesis);
```

---

## 4. Reduce Capture Friction

### A. Contact Capture in Command Center

**Where:** Command Center → Contacts → "Add Contact" button
**Flow:**
1. User pastes LinkedIn URL in form
2. CC runs Village.do lookup via API
3. Form pre-fills: name, company, title, tier suggestion
4. User confirms/edits
5. One click: DB INSERT → memory update → Discord confirmation
6. Takes 10 seconds, zero context switching

**Why CC not Discord:** Forms have validation. Chat parsing is fragile. The CC already has the DB connection.

### B. Signal Review in Command Center

**Where:** Command Center → Signals → "Review" panel
**Flow:**
1. Signal-scout extracts signals to DB with `status='pending'`
2. CC shows pending signals in card format
3. User clicks: Approve (status='active') / Reject (status='archived') / Edit
4. Approved signals immediately feed into daily brief and outreach suggestions
5. No Discord message parsing needed

### C. Decision Auto-Log (Discord)

**This stays in Discord.** Natural language is the right interface for decisions.

**Trigger:** Agent detects decision language in Discord thread
**Flow:**
1. Pattern match: "decided to...", "let's go with...", "we're doing..."
2. Extract last 10 messages as context
3. INSERT into `decisions` table
4. Append to `memory/decisions-log.md`
5. Reply: "Logged: [decision context]"

**Why Discord:** Decisions happen in conversation. The context is the thread. Moving this to CC would mean: hear decision in Discord → open CC → find decision form → re-type context → submit. That's friction.

### D. Quick Capture from Discord (Keep)

**Trigger:** Paste Reddit URL or web URL in Discord
**Flow:**
1. Agent detects URL pattern
2. If Reddit: run signal-scout extraction, score, reply with summary
3. If other URL: create `signals` row with `source_type='web_capture'`, `status='pending'`
4. User sees: "Captured: [title] — review in CC → Signals"

**Why Discord:** URLs arrive in conversation. One paste, zero context switching. The review happens in CC, but capture happens where the user is.

---

## 5. DB as Center: 3-Phase Migration

### Phase 1: Duplicate Writes (Week 1-2)
- Every agent that writes to a file ALSO writes to DB
- Files remain primary read source
- Verify: count(file writes) == count(DB inserts)

### Phase 2: DB-First Reads (Week 3-4)
- Agents read from DB first, fall back to files
- Daily brief pulls from DB
- Memory files become "append-only" narrative
- Verify: all daily briefs sourced 100% from DB

### Phase 3: Files as Read-Only Narrative (Month 2+)
- All operational state in DB
- Files for human consumption only
- AGENTS.md stays as file (instruction layer)
- Build admin dashboard for DB queries
- Verify: can answer any operational question via SQL

### Verification Queries
```sql
-- Test: How many tier 1 contacts not touched in 30 days?
SELECT c.name, MAX(a.created_at) as last_touch
FROM contacts c
LEFT JOIN activities a ON c.id = a.contact_id
WHERE c.tier = 'Tier 1'
GROUP BY c.id
HAVING MAX(a.created_at) < NOW() - INTERVAL '30 days' OR MAX(a.created_at) IS NULL;

-- Test: What decisions mention 'wrangler'?
SELECT * FROM decisions
WHERE search_vector @@ plainto_tsquery('english', 'wrangler')
ORDER BY created_at DESC;

-- Test: Weekly signal trend
SELECT DATE(created_at) as date, COUNT(*) as count, AVG(severity) as avg_severity
FROM signals
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

---

## Implementation Priority

| Priority | Item | Effort | Impact |
|---|---|---|---|
| 🔴 P0 | Decisions table + auto-log | 4h | High — prevents decision loss |
| 🔴 P0 | Daily brief cron | 6h | High — daily compounding |
| 🟡 P1 | Weekly synthesis cron | 4h | Medium — strategic alignment |
| 🟡 P1 | !contact Discord command | 3h | Medium — reduces capture friction |
| 🟢 P2 | Auto-capture Reddit URLs | 2h | Low — nice to have |
| 🟢 P2 | 3-phase DB migration | 2 weeks | High — but gradual |

## Files to Create
```
scripts/crons/daily-brief.js
scripts/crons/weekly-synthesis.js
scripts/commands/contact-capture.js
infra/db/migrations/027_decisions_table.sql
infra/db/migrations/028_memory_entities_table.sql
```
