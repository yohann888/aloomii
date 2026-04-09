# Learn Loop Cron — SPEC

## Purpose
The Learn Loop reads approved+edited LinkedIn drafts from Postgres, analyzes edit patterns, and writes findings back to the DB so the content engine gets smarter over time. It closes the feedback loop between human approval edits and AI generation quality.

---

## Trigger
- Runs as a cron job every **Monday at 8:00 AM ET**
- Can be triggered manually via `POST /api/command/learn-loop/run`
- Idempotent — safe to re-run

---

## Data Flow

### Input
Query: `content_posts` where:
- `platform = 'linkedin'`
- `status IN ('approved', 'published')`
- `learning_processed = false`
- `edited_text IS NOT NULL`
- `edit_categories IS NOT NULL`
- At least 1 record required to run

### Processing (per record)

1. **Parse edit categories** from `edit_categories` JSON:
   - `length_change`: 'shorter' | 'same' | 'longer'
   - `personalization_added`: boolean
   - `cta_changed`: boolean
   - `newsletter_cta_present`: boolean

2. **Build pattern record** — aggregate across all pending records in this run:
   - Count by `length_change` bucket
   - Count `personalization_added`
   - Count CTA changes
   - Average `edit_distance`
   - Count total records processed

3. **Aggregate per adapter** (yohann vs jenny) — track separate patterns per author since their editing styles differ

### Output

#### DB Table: `learn_loop_results`
```sql
CREATE TABLE IF NOT EXISTS learn_loop_results (
  id SERIAL PRIMARY KEY,
  run_at TIMESTAMP DEFAULT NOW(),
  records_processed INT,
  avg_edit_distance NUMERIC,
  length_shorter_pct NUMERIC,
  length_longer_pct NUMERIC,
  personalization_rate NUMERIC,
  cta_change_rate NUMERIC,
  newsletter_cta_rate NUMERIC,
  adapter VARCHAR(50),   -- NULL = aggregate, 'yohann', 'jenny'
  pattern_summary JSONB  -- full per-adapter breakdown
);
```

#### DB Table: `content_engine_hints`
```sql
CREATE TABLE IF NOT EXISTS content_engine_hints (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  hint_type VARCHAR(50),   -- 'length_preference', 'personalization', 'cta', 'style'
  adapter VARCHAR(50),     -- 'yohann' | 'jenny' | 'general'
  hint_text TEXT,          -- human-readable guidance for next generation
  confidence NUMERIC,      -- 0-1 based on sample size
  records_based_on INT     -- how many records this hint is based on
);
```

#### Update `content_posts`
Set `learning_processed = true` for all records processed in this run.

---

## Pattern Detection Logic

### Length preference
- If >60% of edits are 'shorter' → hint: "Founder consistently trims drafts. Aim for 10-20% shorter output."
- If >60% are 'longer' → hint: "Founder consistently expands drafts. Generate 10-15% longer."

### Personalization
- If `personalization_added = true` in >40% of edits → hint: "Founder values personal voice. Inject first-person perspective."

### CTA patterns
- If `cta_changed` frequently → hint: "Founder customizes CTAs. Generate alternatives and let them choose."
- If `newsletter_cta_present` trending → hint: "Newsletter CTA performs well with this founder."

### Confidence threshold
- Minimum 5 records before emitting a hint (else low confidence = noisy signal)

---

## Per-Adapter Separation
Yohann and Jenny have different brand voices. All patterns are computed:
1. Aggregate (all records)
2. Per adapter (yohann only, jenny only)

The content engine uses the per-adapter hints when generating drafts for a specific author.

---

## Cron Schedule
```
0 8 * * 1  cd /Users/superhana/Desktop/aloomii && node scripts/dashboard/learn-loop-cron.js >> logs/learn-loop.log 2>&1
```

---

## API Endpoint (manual trigger)
```
POST /api/command/learn-loop/run
Response: {
  success: true,
  records_processed: N,
  hints_generated: M,
  run_id: <learn_loop_results.id>
}
```

---

## File Structure
- Script: `~/Desktop/aloomii/scripts/dashboard/learn-loop-cron.js`
- Logs: `~/Desktop/aloomii/logs/learn-loop.log`
- Config: `~/Desktop/aloomii/config/learn-loop-config.json` (minimum sample size, schedule, etc.)

---

## Error Handling
- If DB query fails → log error, exit with code 1, no partial writes
- If no records to process → log "Nothing to process", exit 0
- If pushToBuffer fails in learn loop → don't block, just log and continue
- All DB writes in a single transaction (atomic)

---

## Dependencies
- `query` helper from `command-api.js` (Postgres connection)
- TimescaleDB enabled (for time-series queries if needed later)
- No external API calls
