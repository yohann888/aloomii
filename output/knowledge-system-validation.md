# Knowledge System Build Spec: Validation Report

**Validator:** gemini-3.1-pro (attempted, timed out) — completed manually by Leo
**Date:** 2026-05-08
**Spec:** `output/knowledge-system-specs.md`

---

## Overall Assessment: CONDITIONAL PASS

The spec is directionally correct and architecturally sound. However, several technical issues need correction before implementation. Risk level: **MEDIUM** — none are blockers, but unaddressed they will cause performance problems or data inconsistencies within 30 days of deployment.

---

## 1. Decisions Table + Cross-Referencing Memory

### Status: NEEDS CORRECTIONS

**Issue 1A: `updated_at` trigger missing**
The schema defines `updated_at TIMESTAMPTZ DEFAULT NOW()` but provides no mechanism to auto-update it on row modification. The `update_decision_search()` trigger only updates `search_vector`, not `updated_at`.

**Fix:**
```sql
CREATE OR REPLACE FUNCTION update_decision_modified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.search_vector = to_tsvector('english', 
        COALESCE(NEW.context, '') || ' ' || COALESCE(NEW.rationale, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER decisions_modified
    BEFORE UPDATE ON decisions
    FOR EACH ROW EXECUTE FUNCTION update_decision_modified();
```

**Issue 1B: `source_message_id` type mismatch**
Discord message IDs are 17-19 digit integers. `VARCHAR(100)` works but wastes space and loses sortability. Use `BIGINT` or `VARCHAR(25)`.

**Fix:** `source_message_id BIGINT`

**Issue 1C: Missing foreign key constraint**
The `memory_entities` cross-referencing table is mentioned but not specced. Without it, the link between DB decisions and markdown files is fragile.

**Fix — add memory_entities table:**
```sql
CREATE TABLE memory_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,    -- 'decision', 'contact', 'signal'
    entity_id UUID NOT NULL,             -- references decisions.id, contacts.id, etc.
    file_path VARCHAR(500) NOT NULL,
    file_line_start INTEGER,
    file_line_end INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_type, entity_id, file_path)
);
CREATE INDEX idx_memory_entities_lookup ON memory_entities(entity_type, entity_id);
CREATE INDEX idx_memory_entities_file ON memory_entities(file_path);
```

**Issue 1D: No backfill strategy**
"Backfill from memory/decisions-log.md via script" is vague. The decisions-log.md has no structured format — entries are freeform markdown with inconsistent headers.

**Fix:** Before creating the table, run a one-time extraction script that parses decisions-log.md using regex patterns (`^### .*`, `\*\*Decision:\*\*`, date stamps) and inserts into a staging table for manual review. Expect 30-40% manual cleanup.

---

## 2. Daily Brief Cron

### Status: NEEDS CORRECTIONS

**Issue 2A: Query performance — stale contacts**
```sql
SELECT c.*, MAX(a.created_at) as last_touch
FROM contacts c
LEFT JOIN activities a ON c.id = a.contact_id
WHERE c.tier = 'Tier 1'
GROUP BY c.id
HAVING MAX(a.created_at) < NOW() - INTERVAL '14 days' OR MAX(a.created_at) IS NULL
```

This will table-scan `activities` for every run. With 100K activities, this query takes 2-3 seconds. Run twice daily = 4-6 seconds of DB time for a single cron.

**Fix:** Add composite index:
```sql
CREATE INDEX idx_activities_contact_created ON activities(contact_id, created_at DESC);
```

Better fix: precompute with a materialized view:
```sql
CREATE MATERIALIZED VIEW contact_last_touch AS
SELECT contact_id, MAX(created_at) as last_touch
FROM activities
GROUP BY contact_id;
CREATE UNIQUE INDEX idx_clt_contact ON contact_last_touch(contact_id);
-- Refresh every hour via cron
```

**Issue 2B: LEFT JOIN on signals→contacts may return NULL names**
The prompt template does `${signals.map(s => `- ${s.severity}/5: ${s.title} (${s.source_type})`).join('\n')}` but the query selects `c.name` via LEFT JOIN. If `contact_id` is NULL, `name` is NULL. The prompt will show "undefined" or blank.

**Fix:** Handle NULLs in the prompt builder:
```javascript
const signalLines = signals.map(s => 
    `- ${s.severity}/5: ${s.title || s.content?.substring(0, 80)} ` +
    `(${s.source_type}${s.name ? ' — ' + s.name : ''})`
).join('\n');
```

**Issue 2C: No error handling or retry logic**
The script assumes `db.query()` always succeeds. If the DB is under maintenance or the connection pool is exhausted, the cron will crash silently.

**Fix:** Wrap all DB calls in try/catch with exponential backoff. Log failures to `memory/daily-brief/failures/` for review. Alert on 3 consecutive failures.

**Issue 2D: Discord post length risk**
`brief.substring(0, 2000)` is fine for Discord's 2000-char limit, but if the brief starts with a markdown header (`# Daily Brief`), truncating mid-header breaks formatting.

**Fix:** Truncate at the last complete paragraph before 2000 chars:
```javascript
const truncateToParagraph = (text, maxLen) => {
    if (text.length <= maxLen) return text;
    const truncated = text.substring(0, maxLen);
    const lastBreak = truncated.lastIndexOf('\n\n');
    return lastBreak > 0 ? truncated.substring(0, lastBreak) : truncated;
};
```

**Issue 2E: Missing `activities` table schema assumption**
The query references `activities` but the spec does not verify this table exists or has the expected columns (`type`, `description`, `contact_id`). Check `infra/db/init.sql` before assuming.

---

## 3. Weekly Synthesis Cron

### Status: ACCEPTABLE WITH NOTES

**Issue 3A: Subquery count pattern is inefficient**
```sql
SELECT 
    (SELECT COUNT(*) FROM signals WHERE created_at > NOW() - INTERVAL '7 days') as signal_count,
    (SELECT COUNT(*) FROM activities WHERE created_at > NOW() - INTERVAL '7 days') as activity_count,
    ...
```

Five sequential subqueries. Each scans a table. With 100K rows each, this is 5 full or index scans.

**Fix:** Single query with CTE:
```sql
WITH weekly_stats AS (
    SELECT 
        'signals' as table_name, COUNT(*) as cnt
    FROM signals WHERE created_at > NOW() - INTERVAL '7 days'
    UNION ALL
    SELECT 'activities', COUNT(*) FROM activities WHERE created_at > NOW() - INTERVAL '7 days'
    UNION ALL
    SELECT 'contacts', COUNT(*) FROM contacts WHERE created_at > NOW() - INTERVAL '7 days'
    UNION ALL
    SELECT 'mood_signals', COUNT(*) FROM mood_signals WHERE created_at > NOW() - INTERVAL '7 days'
    UNION ALL
    SELECT 'content_drafts', COUNT(*) FROM content_drafts WHERE created_at > NOW() - INTERVAL '7 days'
)
SELECT * FROM weekly_stats;
```

**Issue 3B: `content_drafts` table not verified**
The spec assumes `content_drafts` exists. If it doesn't, the query will error.

**Fix:** Add migration check or make the query conditional.

**Issue 3C: No historical comparison**
The weekly synthesis only looks at the current week. Without comparing to prior weeks, "emerging thesis" is just a summary, not a trend.

**Fix:** Add prior week stats to the prompt:
```sql
-- Two weeks ago for comparison
SELECT COUNT(*) FROM signals 
WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
```

---

## 4. Reduce Capture Friction

### Status: NEEDS SECURITY REVIEW

**Issue 4A: `!contact` command — wrong interface**
A chat command parsing LinkedIn URLs and doing Village lookups is fragile. Discord is a conversation interface, not a form interface. The Command Center already has forms, validation, and direct DB access.

**Fix:** Remove `!contact` from Discord. Add "Add Contact" form to Command Center → Contacts panel. Direct DB write, Village lookup, memory update — all in one UI.

**Issue 4B: Auto-capture Reddit URLs — Discord is correct for capture, CC is correct for review**
URLs arrive in conversation. One paste, zero context switching. But the review/scoring should happen in CC, not Discord.

**Fix:** Discord captures the URL → CC shows it in pending signals for review. User approves/rejects in CC.

**Issue 4C: Auto-log decisions — Discord is correct**
Decisions happen in conversation. The context is the thread. Moving to CC means: hear decision → open CC → find form → re-type → submit. That's friction.

**Fix:** Keep in Discord. But add confidence threshold (see below).

**Issue 4C: Browser bookmarklet — auth token exposure**
Embedding a Bearer token in a bookmarklet exposes it to any JavaScript on the page. Cross-site scripting on any visited page could steal the token.

**Fix:** Do not use bookmarklets with embedded tokens. Instead:
- Browser extension with isolated storage
- Or: Share-to-Discord workflow (copy URL → paste in Discord → agent processes)
- Or: Use a dedicated capture page at `capture.aloomii.com` with Clerk auth

---

## 5. DB as Center: 3-Phase Migration

### Status: NEEDS ADDITIONAL PLANNING

**Issue 5A: No rollback plan**
Phases 1-3 are described as forward-only. If Phase 2 breaks (agents reading from DB but DB is incomplete), there is no path back to files-as-primary.

**Fix:** Add rollback gates:
- Phase 1: Files remain primary. DB is write-only duplicate. No read dependency.
- Phase 2 gate: Only proceed if `SELECT COUNT(*) FROM decisions` == `grep -c "^###" memory/decisions-log.md` (within 10%).
- Phase 3 gate: Only proceed if 30 consecutive days of zero DB read errors.

**Issue 5B: Write amplification in Phase 1**
Every file write becomes two writes (file + DB). For high-volume crons like signal-scout (205 signals/day), this doubles write load.

**Fix:** Batch DB writes. Signal-scout currently writes per-signal. Change to write in batches of 10-20 signals per transaction.

**Issue 5C: No data retention policy**
The spec says "nothing gets deleted" but does not address the `signals` table growing indefinitely. At 200 signals/day, that's 73K rows/year. Query performance will degrade.

**Fix:** Add retention policy:
- Hot signals (severity >= 3): retain forever
- Cold signals (severity < 3, older than 90 days): archive to `signals_archive` table or S3
- Automated monthly via cron

**Issue 5D: Missing backup strategy**
The DB is now the single source of truth, but the spec does not mention backups.

**Fix:** Add to spec:
- Daily `pg_dump` to S3 or local backup
- Test restore procedure monthly
- Point-in-time recovery via WAL archiving (if not already enabled)

---

## Missing Pieces (Not in Spec)

| Missing Item | Severity | Why It Matters |
|---|---|---|
| Error handling in all cron scripts | HIGH | Silent failures = lost data |
| Retry logic with exponential backoff | HIGH | Network blips should not kill crons |
| Monitoring/alerting for cron failures | HIGH | Currently no way to know if daily brief stops running |
| Data retention policy for signals | MEDIUM | Table will grow indefinitely |
| Backup and restore procedure | HIGH | DB is now SSoT |
| Rate limiting on Discord commands | MEDIUM | Prevents API quota exhaustion |
| Test strategy (unit + integration) | MEDIUM | No way to verify correctness before deploy |
| Rollback plan for each phase | HIGH | Migration without rollback is irreversible |
| Performance benchmarks | LOW | Need baseline query times before/after indexes |
| Documentation for manual intervention | MEDIUM | What to do when the automated system breaks? |

---

## Recommended Changes Before Implementation

### Must-Have (Do Not Build Without These)

1. **Add `updated_at` trigger** to decisions table
2. **Add composite index** on `activities(contact_id, created_at DESC)`
3. **Add error handling + retry logic** to all cron scripts
4. **Add rollback gates** between migration phases
5. **Verify `activities` and `content_drafts` table schemas** before querying
6. **Replace bookmarklet with secure capture method**
7. **Add rate limiting** to `!contact` command

### Should-Have (Build Within First Sprint)

8. **Add confidence threshold** to auto-log decisions
9. **Add prior-week comparison** to weekly synthesis
10. **Add `memory_entities` table** for cross-referencing
11. **Add data retention policy** for signals table
12. **Add backup procedure** to operational docs

### Nice-to-Have (Backlog)

13. Materialized view for contact last-touch
14. Historical trend queries for weekly synthesis
15. Automated migration verification scripts
16. Performance benchmarking before/after index additions

---

## Implementation Priority (Revised)

| Priority | Item | Effort | Risk if Skipped |
|---|---|---|---|
| 🔴 P0 | Fix decisions schema (trigger, BIGINT, memory_entities) | 2h | Data inconsistency |
| 🔴 P0 | Add error handling + retry to daily brief | 2h | Silent cron failures |
| 🔴 P0 | Add rollback gates to migration plan | 1h | Irreversible migration |
| 🟡 P1 | Add activities index + verify schema | 1h | Slow queries |
| 🟡 P1 | Replace bookmarklet with secure capture | 3h | Auth token exposure |
| 🟡 P1 | Add rate limiting to !contact | 1h | API quota exhaustion |
| 🟢 P2 | Add confidence threshold to auto-decisions | 2h | Spurious decision rows |
| 🟢 P2 | Add data retention policy | 2h | Table bloat |
| 🟢 P2 | Add backup procedure | 1h | Data loss risk |

---

## Conclusion

The spec is a strong foundation. The architecture (DB as center, crons for intelligence, Discord for capture) is correct for Aloomii's stack. The main risks are operational, not architectural: error handling, rollback planning, and security. Fix the P0 items before writing any migration scripts. The rest can ship in v1.1.

**Recommendation:** Start with the decisions table schema fixes and a single cron (daily brief) as a pilot. Run it for one week with full error logging. Validate correctness against manual review. Then proceed to weekly synthesis and capture friction reduction.
