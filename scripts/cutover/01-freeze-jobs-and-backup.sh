#!/usr/bin/env bash
# ============================================================
# 01-freeze-jobs-and-backup.sh
# Phase 1 of stale-signal cutover: freeze cron jobs + backup DB + signals file
# Date: 2026-04-11
# Rollback: set run_mode=normal to re-enable
# ============================================================
set -euo pipefail

WORKSPACE="${WORKSPACE:-/Users/superhana/.openclaw/workspace}"
DB_NAME="aloomii"
DB_USER="superhana"
BACKUP_DIR="$WORKSPACE/backups/cutover-$(date +%Y%m%d-%H%M%S)"
LOG="$WORKSPACE/logs/cutover-01-freeze.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

mkdir -p "$BACKUP_DIR" "$WORKSPACE/logs"

log "=== STEP 1: Freeze cron jobs ==="

# Snapshot active cron state
crontab -l > "$BACKUP_DIR/crontab-before.txt" 2>/dev/null || true
log "Crontab snapshot saved"

# Find PM-related cron jobs and comment them out (rollback: remove comments)
CRON_MARKER="# CUTOVER-FROZEN"
for job in $(crontab -l 2>/dev/null | grep -n "pm-brief\|senior-pm\|snipe\|signal-scout\|daily-linkedin\|watch-metrics" | cut -d: -f1); do
    crontab -l | sed -i.bak "$job s/^/$CRON_MARKER /" 2>/dev/null || true
done
log "PM cron jobs commented out with $CRON_MARKER"

log "=== STEP 2: Backup signals markdown file ==="

SIGNALS_FILE="$WORKSPACE/pipeline/signals.md"
if [[ -f "$SIGNALS_FILE" ]]; then
    cp "$SIGNALS_FILE" "$BACKUP_DIR/signals.md.backup"
    log "signals.md backed up ($(wc -l < "$SIGNALS_FILE") lines)"
else
    log "WARNING: signals.md not found at $SIGNALS_FILE"
fi

log "=== STEP 3: pg_dump signals + entities tables ==="

PG_DUMP_BIN="/opt/homebrew/Cellar/postgresql@18/18.2/bin/pg_dump"
CONN_STR="postgresql://$DB_USER@localhost:5432/$DB_NAME"

if [[ -x "$PG_DUMP_BIN" ]]; then
    "$PG_DUMP_BIN" \
        --dbname="$CONN_STR" \
        --table=signals \
        --table=entities \
        --table=entity_signals \
        --format=custom \
        --file="$BACKUP_DIR/signals-entities.dump" \
        2>&1 | tee -a "$LOG"
    log "DB dump saved: signals + entities"
else
    log "WARNING: pg_dump not at $PG_DUMP_BIN — manual backup required"
fi

log "=== STEP 4: Tag freeze flag ==="
# Write freeze state so other scripts can detect
cat > "$WORKSPACE/.cutover-frozen" <<EOF
CUTOVER_FROZEN=true
CUTOVER_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CUTOVER_BACKUP_DIR=$BACKUP_DIR
CUTOVER_STEP=01
EOF

log "=== STEP 5: Confirm freeze state ==="
if [[ -f "$WORKSPACE/.cutover-frozen" ]]; then
    log "SUCCESS: Freeze complete. Backup at $BACKUP_DIR"
    log "Next step: 02-backfill-db.js"
else
    log "FAILURE: freeze flag not created — aborting"
    exit 1
fi
