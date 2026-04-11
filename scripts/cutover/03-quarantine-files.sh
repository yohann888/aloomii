#!/usr/bin/env bash
# ============================================================
# 03-quarantine-files.sh
# Phase 3: Identify and move known stale artifacts out of
# active workspace inputs, then record them.
# Date: 2026-04-11
# Rollback: restore from backup dir listed in quarantine-log
# ============================================================
set -euo pipefail

WORKSPACE="${WORKSPACE:-/Users/superhana/.openclaw/workspace}"
QUARANTINE_DIR="$WORKSPACE/quarantine"
QUARANTINE_LOG="$WORKSPACE/logs/quarantine-log-$(date +%Y%m%d-%H%M%S).json"
BACKUP_DIR="${CUTOVER_BACKUP_DIR:-}"  # set by 01-freeze-jobs-and-backup.sh

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$QUARANTINE_LOG"; }

mkdir -p "$QUARANTINE_DIR" "$WORKSPACE/logs"
echo "# Quarantine run $(date)" >> "$QUARANTINE_LOG"

# ── Known stale artifacts (from changelog + lessons-learned) ──
# These are confirmed stale via human review, not auto-detected.
declare -a STALE_FILES=(
    # Present-Ad-1365 — hallucinated UUID, documented in what-to-build-next.md
    "relationships/Present-Ad-1365.md"
    # Empty stubs persistent across multiple sweeps
    "quarantine/task3.txt"
    "quarantine/task5.txt"
)

quarantined=0
skipped=0

for file in "${STALE_FILES[@]}"; do
    src="$WORKSPACE/$file"
    fname=$(basename "$file")
    dest="$QUARANTINE_DIR/${fname%.md}-stale-$(date +%Y%m%d).md"

    if [[ -f "$src" ]]; then
        # Move instead of delete (rollback-safe)
        mv "$src" "$dest"
        log "QUARANTINED: $file → $dest"
        echo "{\"original\":\"$file\",\"quarantined_to\":\"$dest\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"reason\":\"stale-signal-cutover\"}" \
            >> "$QUARANTINE_LOG"
        ((quarantined++))
    else
        log "SKIPPED (not found): $file"
        ((skipped++))
    fi
done

log "=== Quarantine complete: $quarantined moved, $skipped not found ==="
log "Log: $QUARANTINE_LOG"
log "Next step: 04-verify-cutover.js"
