# Stale-Signal Cutover Package

**Date:** 2026-04-11
**Problem:** Signals and entities (e.g., Present-Ad-1365) keep resurfacing in PM briefs because there's no planning-state dimension to mark them as suppressed or quarantined.

**Solution:** Add `planning_state` enum (`active | suppressed | quarantined | archived`) to `signals` and `entities` tables, enforced via partial indexes. All PM read paths use `WHERE planning IN ('active', NULL)` as the canonical boundary.

---

## Cutover Order (run in sequence)

```
1. 01-freeze-jobs-and-backup.sh
    ├── Snapshot crontab → backups/cutover-YYYYMMDD-HHMMSS/crontab-before.txt
    ├── Backup pipeline/signals.md
    ├── pg_dump signals + entities tables → signals-entities.dump
    └── Write .cutover-frozen flag

2. Run 024_planning_state_v2.sql
    psql postgresql://superhana@localhost:5432/aloomii \
      < infra/db/migrations/024_planning_state_v2.sql

3. 02-backfill-db.js
    node scripts/cutover/02-backfill-db.js
    → Sets planning='active' for all existing rows with NULL planning

4. 03-quarantine-files.sh
    → Moves known stale artifacts out of active workspace dirs

5. 04-verify-cutover.js
    node scripts/cutover/04-verify-cutover.js
    → 7 checks; exit 0 = pass, exit 1 = fail

6. Unfreeze: remove # CUTOVER-FROZEN comments from crontab
    crontab -l | sed 's/^# CUTOVER-FROZEN //' | crontab -
```

---

## Rollback

If anything goes wrong after step 2:

```sql
-- Rollback migration
ALTER TABLE signals DROP COLUMN IF EXISTS planning;
ALTER TABLE entities DROP COLUMN IF EXISTS planning;
DROP TYPE IF EXISTS planning_state;
-- Then restore from backup:
pg_restore --dbname=postgresql://superhana@localhost:5432/aloomii \
  backups/cutover-YYYYMMDD-HHMMSS/signals-entities.dump
```

Restore crontab: `crontab backups/cutover-YYYYMMDD-HHMMSS/crontab-before.txt`

---

## Files Created

| File | Purpose |
|---|---|
| `infra/db/migrations/024_planning_state_v2.sql` | Schema migration |
| `scripts/cutover/01-freeze-jobs-and-backup.sh` | Freeze crons + backup |
| `scripts/cutover/02-backfill-db.js` | Backfill planning='active' |
| `scripts/cutover/03-quarantine-files.sh` | Move stale artifacts |
| `scripts/cutover/04-verify-cutover.js` | Verify all checks pass |
| `scripts/planning/get-active-context.js` | PM read boundary (active signals only) |
| `scripts/planning/suppress-entity.js` | Mark signal/entity as suppressed/quarantined |

---

## PM Read Boundary (what changes in PM scripts)

Before (all signals):
```sql
SELECT * FROM signals ORDER BY score DESC LIMIT 50;
```

After (active only):
```sql
SELECT * FROM signals
WHERE planning IN ('active', NULL)
ORDER BY score DESC LIMIT 50;
```

The `NULL` fallback preserves legacy rows from before the cutover.
Use `scripts/planning/get-active-context.js` as the canonical data source for PM briefs.

---

## suppress-entity.js Cheat Sheet

```bash
# Quarantine a hallucinated/stale signal
node scripts/planning/suppress-entity.js signal <uuid> quarantined "Hallucinated UUID"

# Suppress a relationship that went cold
node scripts/planning/suppress-entity.js entity <uuid> suppressed "Thread archived 2026"

# Restore if incorrectly suppressed
node scripts/planning/suppress-entity.js signal <uuid> active ""

# Archive old signals
node scripts/planning/suppress-entity.js signal <uuid> archived "15 months old"
```

---

## What Must Be Reviewed Before Running

1. **Database backup** — confirm `pg_dump` path `/opt/homebrew/Cellar/postgresql@18/18.2/bin/pg_dump` is correct on this machine.
2. **Cron freeze scope** — `01-freeze.sh` comments out any crontab entry matching `pm-brief|senior-pm|snipe|signal-scout|daily-linkedin|watch-metrics`. Verify no unintended jobs are frozen.
3. **Quarantine file list** — `03-quarantine-files.sh` hardcodes `relationships/Present-Ad-1365.md` and `quarantine/task3.txt`, `quarantine/task5.txt`. Confirm these are the only confirmed stale artifacts.
4. **PM script integration** — `get-active-context.js` must be wired into `senior-pm.js` / `pm-brief.js` as the canonical signal source before cron jobs resume. This is the **most critical read boundary patch** — do not unfreeze until this is verified.
5. **Hypertable compatibility** — `signals` and `entities` are not hypertables (unlike `activity_log`). Standard ALTER TABLE is safe here.

---

## What Is Stubbed / Needs Follow-On Work

- `get-active-context.js` is written but not yet wired into PM scripts — the **PM boundary integration** is the critical path.
- No hot-path code changes to `senior-pm.js`, `pm-brief.js`, or `snipe-reaction-handler.js` yet — those are follow-on after the package is verified.
- The `pipeline/signals.md` file is backed up but not migrated to the DB — that's a separate bridge step.
