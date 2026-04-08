#!/usr/bin/env bash
# =============================================================================
# recover-from-backblaze.sh
# Aloomii + OpenClaw — Disaster Recovery / Fresh-Install Script
# Machine: macOS (arm64), user: superhana
# Created: 2026
# =============================================================================
# USAGE:
#   ./recover-from-backblaze.sh            # full recovery
#   ./recover-from-backblaze.sh --skip-brew  # skip Homebrew install/services
#   ./recover-from-backblaze.sh --skip-db    # skip DB setup/migrations
#   ./recover-from-backblaze.sh --help       # show help
# =============================================================================

set -euo pipefail

# ─── Flags ───────────────────────────────────────────────────────────────────
SKIP_BREW=false
SKIP_DB=false

for arg in "$@"; do
  case $arg in
    --skip-brew) SKIP_BREW=true ;;
    --skip-db)   SKIP_DB=true ;;
    --help|-h)
      echo ""
      echo "  recover-from-backblaze.sh — Aloomii + OpenClaw Disaster Recovery"
      echo ""
      echo "  USAGE:"
      echo "    ./recover-from-backblaze.sh              Full recovery"
      echo "    ./recover-from-backblaze.sh --skip-brew  Skip Homebrew + services"
      echo "    ./recover-from-backblaze.sh --skip-db    Skip DB setup + migrations"
      echo "    ./recover-from-backblaze.sh --help       Show this help"
      echo ""
      echo "  STEPS:"
      echo "    1. Preflight checks"
      echo "    2. Homebrew + packages install"
      echo "    3. PostgreSQL 18 setup + migrations"
      echo "    4. Post-Backblaze restore checks"
      echo "    5. OpenClaw setup"
      echo "    6. Verification tests"
      echo "    7. LM Studio notes"
      echo "    8. Final report"
      echo ""
      exit 0
      ;;
  esac
done

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Paths ───────────────────────────────────────────────────────────────────
PSQL="/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql"
PG_ISREADY="/opt/homebrew/Cellar/postgresql@18/18.2/bin/pg_isready"
PG_DUMP="/opt/homebrew/Cellar/postgresql@18/18.2/bin/pg_dump"
DB_URL="postgresql://superhana@localhost:5432/aloomii"
MIGRATIONS_DIR="$HOME/Desktop/aloomii/infra/db/migrations"

CRITICAL_PATHS=(
  "$HOME/Desktop/aloomii"
  "$HOME/.openclaw/openclaw.json"
  "$HOME/Documents/AloomiiVault/AloomiiVault"
)

KEY_TABLES=(accounts contacts signals opportunities outreach_queue client_pilots)

# ─── Tracking ────────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
STEPS_DONE=()
MANUAL_STEPS=()

# ─── Helpers ─────────────────────────────────────────────────────────────────
header() {
  echo ""
  echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════${RESET}"
  echo -e "${CYAN}${BOLD}  $1${RESET}"
  echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════${RESET}"
}

ok()   { echo -e "  ${GREEN}✅  $1${RESET}"; ((PASS_COUNT++)) || true; }
fail() { echo -e "  ${RED}❌  $1${RESET}"; ((FAIL_COUNT++)) || true; }
warn() { echo -e "  ${YELLOW}⚠️   $1${RESET}"; ((WARN_COUNT++)) || true; }
info() { echo -e "  ${CYAN}ℹ️   $1${RESET}"; }
step() { echo -e "\n  ${BOLD}▶ $1${RESET}"; }

confirm() {
  local msg="${1:-Continue?}"
  echo ""
  echo -e "${YELLOW}${BOLD}  $msg${RESET}"
  read -r -p "  Type 'yes' to continue: " answer
  if [[ "$answer" != "yes" ]]; then
    echo -e "${RED}  Aborted.${RESET}"
    exit 1
  fi
}

command_exists() { command -v "$1" &>/dev/null; }

brew_install_if_missing() {
  local pkg="$1"
  local formula="${2:-$1}"
  if brew list "$formula" &>/dev/null 2>&1; then
    ok "$pkg already installed"
  else
    step "Installing $pkg..."
    brew install "$formula" && ok "Installed $pkg" || fail "Failed to install $pkg"
  fi
}

# ─── SECTION 1: PREFLIGHT ────────────────────────────────────────────────────
section_preflight() {
  header "SECTION 1: PREFLIGHT"

  # macOS version
  step "Checking macOS version..."
  OS_VER=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
  OS_NAME=$(sw_vers -productName 2>/dev/null || echo "macOS")
  info "OS: $OS_NAME $OS_VER"
  if [[ "$(uname -m)" == "arm64" ]]; then
    ok "Architecture: arm64 (Apple Silicon) ✓"
  else
    warn "Architecture: $(uname -m) — script optimized for arm64"
  fi

  # Check Backblaze restore availability
  step "Checking for Backblaze restore indicators..."
  BB_FOUND=false
  if [[ -d "$HOME/Library/Backblaze.bzpkg" ]] || command_exists "bztransmit" || \
     [[ -d "/Applications/Backblaze.app" ]]; then
    ok "Backblaze app appears installed"
    BB_FOUND=true
  else
    warn "Backblaze app not detected — ensure you restore from Backblaze before running Section 4"
  fi

  # Disk space (require at least 20GB free)
  step "Checking available disk space..."
  FREE_BYTES=$(df -k / | awk 'NR==2 {print $4}')
  FREE_GB=$(( FREE_BYTES / 1024 / 1024 ))
  if [[ $FREE_GB -ge 20 ]]; then
    ok "Free disk space: ${FREE_GB}GB ✓"
  elif [[ $FREE_GB -ge 10 ]]; then
    warn "Free disk space: ${FREE_GB}GB — low, recommend 20GB+ before restore"
  else
    fail "Free disk space: ${FREE_GB}GB — critically low. Free space before proceeding."
  fi

  # Network
  step "Checking network connectivity..."
  if curl -sf --max-time 5 https://api.github.com >/dev/null 2>&1; then
    ok "Internet connectivity confirmed"
  else
    warn "No internet connectivity — Homebrew installs will fail"
  fi

  STEPS_DONE+=("✅ Section 1: Preflight")

  confirm "Preflight complete. Ready to begin recovery?"
}

# ─── SECTION 2: HOMEBREW INSTALL ─────────────────────────────────────────────
section_homebrew() {
  header "SECTION 2: HOMEBREW + PACKAGES"

  if [[ "$SKIP_BREW" == "true" ]]; then
    warn "Skipping Homebrew section (--skip-brew)"
    STEPS_DONE+=("⏭️  Section 2: Homebrew (skipped)")
    return
  fi

  # Install Homebrew if missing
  step "Checking Homebrew..."
  if command_exists brew; then
    ok "Homebrew already installed: $(brew --version | head -1)"
  else
    step "Installing Homebrew..."
    info "This may take several minutes..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || {
      fail "Homebrew installation failed"
      exit 1
    }
    # Add Homebrew to PATH for Apple Silicon
    if [[ -f /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    ok "Homebrew installed"
  fi

  # Update Homebrew
  step "Updating Homebrew..."
  brew update --quiet 2>/dev/null && ok "Homebrew up to date" || warn "brew update had warnings (non-fatal)"

  # Install required packages
  step "Installing required packages..."
  brew_install_if_missing "git"
  brew_install_if_missing "curl"
  brew_install_if_missing "wget"
  brew_install_if_missing "node"
  brew_install_if_missing "postgresql@18" "postgresql@18"
  brew_install_if_missing "cloudflared"

  # Ensure postgresql@18 is in PATH
  step "Configuring postgresql@18 PATH..."
  PG_BIN_DIR="/opt/homebrew/opt/postgresql@18/bin"
  if [[ -d "$PG_BIN_DIR" ]]; then
    export PATH="$PG_BIN_DIR:$PATH"
    ok "postgresql@18 bin added to PATH"
  else
    warn "postgresql@18 bin dir not found at $PG_BIN_DIR"
  fi

  # Start PostgreSQL 18
  step "Starting postgresql@18..."
  if brew services list | grep -q "postgresql@18.*started"; then
    ok "postgresql@18 already running"
  else
    brew services start postgresql@18 && ok "postgresql@18 started" || fail "Failed to start postgresql@18"
  fi

  # Wait for PostgreSQL to be ready
  step "Waiting for PostgreSQL to be ready..."
  MAX_WAIT=30
  ELAPSED=0
  until "$PG_ISREADY" -q -h localhost -p 5432 2>/dev/null; do
    if [[ $ELAPSED -ge $MAX_WAIT ]]; then
      fail "PostgreSQL did not become ready within ${MAX_WAIT}s"
      break
    fi
    sleep 2
    ((ELAPSED+=2)) || true
    info "Waiting... (${ELAPSED}s)"
  done
  if "$PG_ISREADY" -q -h localhost -p 5432 2>/dev/null; then
    ok "PostgreSQL is ready on port 5432"
  fi

  # Start cloudflared (non-fatal)
  step "Enabling cloudflared service..."
  if brew services list | grep -q "cloudflared.*started"; then
    ok "cloudflared already running"
  else
    brew services start cloudflared 2>/dev/null && ok "cloudflared started" \
      || warn "cloudflared failed to start — configure tunnel manually after restore"
    MANUAL_STEPS+=("Configure Cloudflare Tunnel for dashboard.aloomii.com (cloudflared tunnel)")
  fi

  STEPS_DONE+=("✅ Section 2: Homebrew + Packages")
}

# ─── SECTION 3: DATABASE SETUP ───────────────────────────────────────────────
section_database() {
  header "SECTION 3: DATABASE SETUP"

  if [[ "$SKIP_DB" == "true" ]]; then
    warn "Skipping database section (--skip-db)"
    STEPS_DONE+=("⏭️  Section 3: Database (skipped)")
    return
  fi

  # Ensure PostgreSQL is running
  step "Verifying PostgreSQL is running..."
  if ! "$PG_ISREADY" -q -h localhost -p 5432 2>/dev/null; then
    warn "PostgreSQL not ready — attempting to start..."
    brew services start postgresql@18 2>/dev/null || true
    sleep 5
    if ! "$PG_ISREADY" -q -h localhost -p 5432 2>/dev/null; then
      fail "PostgreSQL still not ready. Cannot proceed with DB setup."
      STEPS_DONE+=("❌ Section 3: Database (failed — PG not ready)")
      return
    fi
  fi
  ok "PostgreSQL is ready"

  # Create aloomii database if not exists
  step "Creating 'aloomii' database (if not exists)..."
  if "$PSQL" -h localhost -p 5432 -U superhana -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw aloomii; then
    ok "Database 'aloomii' already exists"
  else
    "$PSQL" -h localhost -p 5432 -U superhana -d postgres \
      -c "CREATE DATABASE aloomii OWNER superhana;" 2>/dev/null \
      && ok "Database 'aloomii' created" \
      || fail "Failed to create 'aloomii' database"
  fi

  # Enable extensions
  step "Enabling PostgreSQL extensions..."
  "$PSQL" "$DB_URL" -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;" 2>/dev/null \
    && ok "timescaledb extension enabled" \
    || warn "timescaledb: may not be installed (install via brew if needed)"

  "$PSQL" "$DB_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null \
    && ok "pgvector extension enabled" \
    || warn "pgvector: may not be installed"

  "$PSQL" "$DB_URL" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" 2>/dev/null \
    && ok "pg_trgm extension enabled" \
    || warn "pg_trgm: failed"

  "$PSQL" "$DB_URL" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" 2>/dev/null \
    && ok "pgcrypto extension enabled" \
    || warn "pgcrypto: failed"

  # Run migrations
  step "Running database migrations from $MIGRATIONS_DIR..."
  if [[ ! -d "$MIGRATIONS_DIR" ]]; then
    warn "Migrations directory not found: $MIGRATIONS_DIR"
    warn "Run this section AFTER restoring ~/Desktop/aloomii/ from Backblaze"
    MANUAL_STEPS+=("Re-run Section 3 (DB migrations) after restoring ~/Desktop/aloomii/ from Backblaze")
  else
    MIGRATION_COUNT=0
    MIGRATION_ERRORS=0
    # Run files in sorted order (001_, 002_, etc.)
    for migration_file in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
      filename=$(basename "$migration_file")
      step "  Running migration: $filename"
      if "$PSQL" "$DB_URL" -f "$migration_file" -v ON_ERROR_STOP=1 >/dev/null 2>&1; then
        ok "  $filename applied"
        ((MIGRATION_COUNT++)) || true
      else
        # Try without ON_ERROR_STOP (some migrations are idempotent)
        if "$PSQL" "$DB_URL" -f "$migration_file" >/dev/null 2>&1; then
          warn "  $filename applied with warnings (idempotent)"
          ((MIGRATION_COUNT++)) || true
        else
          fail "  $filename FAILED — check manually"
          ((MIGRATION_ERRORS++)) || true
        fi
      fi
    done
    info "Migrations complete: $MIGRATION_COUNT applied, $MIGRATION_ERRORS errors"
  fi

  # Verify key tables exist
  step "Verifying key tables..."
  for table in "${KEY_TABLES[@]}"; do
    TABLE_EXISTS=$("$PSQL" "$DB_URL" -tAc \
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='$table');" 2>/dev/null || echo "f")
    if [[ "$TABLE_EXISTS" == "t" ]]; then
      ok "Table '$table' exists"
    else
      warn "Table '$table' not found — may need migration or manual creation"
    fi
  done

  STEPS_DONE+=("✅ Section 3: Database Setup")
}

# ─── SECTION 4: POST-BACKBLAZE RESTORE CHECKS ────────────────────────────────
section_post_restore() {
  header "SECTION 4: POST-BACKBLAZE RESTORE CHECKS"

  info "This section assumes you have ALREADY restored /Users/superhana from Backblaze."
  info "If you haven't done that yet, exit now (Ctrl+C), restore, then re-run this script."
  echo ""

  confirm "Have you completed the Backblaze restore? Ready to verify?"

  # Fix ownership
  step "Fixing file ownership on /Users/superhana/..."
  if sudo chown -R "$(whoami):staff" /Users/superhana/ 2>/dev/null; then
    ok "Ownership fixed: $(whoami):staff"
  else
    warn "chown had issues — some system files may be skipped (normal)"
  fi

  # Check critical paths
  step "Checking critical paths..."
  ALL_PATHS_OK=true
  for path in "${CRITICAL_PATHS[@]}"; do
    if [[ -e "$path" ]]; then
      ok "Found: $path"
    else
      fail "MISSING: $path"
      ALL_PATHS_OK=false
    fi
  done

  if [[ "$ALL_PATHS_OK" == "false" ]]; then
    warn "Some critical paths are missing — Backblaze restore may be incomplete"
    MANUAL_STEPS+=("Verify Backblaze restore is complete — some paths were missing (see above)")
  fi

  # Check .openclaw config
  step "Checking OpenClaw config..."
  if [[ -f "$HOME/.openclaw/openclaw.json" ]]; then
    ok "openclaw.json present"
    # Verify it's valid JSON
    if python3 -c "import json,sys; json.load(open('$HOME/.openclaw/openclaw.json'))" 2>/dev/null; then
      ok "openclaw.json is valid JSON"
    else
      fail "openclaw.json is invalid JSON — may need manual repair"
    fi
  else
    fail "openclaw.json missing at $HOME/.openclaw/openclaw.json"
    MANUAL_STEPS+=("Restore or reconfigure $HOME/.openclaw/openclaw.json")
  fi

  # Check cron jobs file
  step "Checking cron jobs..."
  CRON_FILE="$HOME/.openclaw/cron/jobs.json"
  if [[ -f "$CRON_FILE" ]]; then
    JOB_COUNT=$(python3 -c "import json; d=json.load(open('$CRON_FILE')); print(len(d) if isinstance(d,list) else len(d.get('jobs',d)))" 2>/dev/null || echo "?")
    ok "Cron jobs file found ($JOB_COUNT jobs)"
  else
    warn "Cron jobs file not found at $CRON_FILE"
    MANUAL_STEPS+=("Restore ~/.openclaw/cron/jobs.json from Backblaze or git")
  fi

  # Check workspace
  step "Checking workspace..."
  WORKSPACE="$HOME/.openclaw/workspace"
  if [[ -d "$WORKSPACE" ]]; then
    ok "Workspace found: $WORKSPACE"
    if [[ -f "$WORKSPACE/MEMORY.md" ]]; then
      ok "MEMORY.md present"
    else
      warn "MEMORY.md missing from workspace"
    fi
  else
    fail "Workspace missing: $WORKSPACE"
  fi

  # Check aloomii repo
  step "Checking aloomii repo..."
  ALOOMII_DIR="$HOME/Desktop/aloomii"
  if [[ -d "$ALOOMII_DIR/.git" ]] || [[ -d "$ALOOMII_DIR" ]]; then
    ok "aloomii directory found: $ALOOMII_DIR"
    FILE_COUNT=$(find "$ALOOMII_DIR" -maxdepth 2 -type f | wc -l | tr -d ' ')
    info "File count (depth 2): $FILE_COUNT"
  else
    fail "aloomii directory missing: $ALOOMII_DIR"
  fi

  # Check Obsidian vault
  step "Checking Obsidian vault..."
  VAULT="$HOME/Documents/AloomiiVault/AloomiiVault"
  if [[ -d "$VAULT" ]]; then
    VAULT_COUNT=$(find "$VAULT" -name "*.md" | wc -l | tr -d ' ')
    ok "Obsidian vault found — $VAULT_COUNT markdown files"
    if [[ $VAULT_COUNT -lt 5 ]]; then
      warn "Very few vault files ($VAULT_COUNT) — restore may be incomplete"
    fi
  else
    fail "Obsidian vault missing: $VAULT"
    MANUAL_STEPS+=("Restore Obsidian vault at ~/Documents/AloomiiVault/AloomiiVault/")
  fi

  STEPS_DONE+=("✅ Section 4: Post-Restore Checks")
}

# ─── SECTION 5: OPENCLAW SETUP ───────────────────────────────────────────────
section_openclaw() {
  header "SECTION 5: OPENCLAW SETUP"

  # Install OpenClaw if not present
  step "Checking OpenClaw CLI..."
  if command_exists openclaw; then
    OC_VER=$(openclaw --version 2>/dev/null || echo "unknown")
    ok "OpenClaw already installed: $OC_VER"
  else
    step "Installing OpenClaw CLI via npm..."
    npm install -g openclaw @openclaw/cli 2>/dev/null \
      && ok "OpenClaw installed" \
      || fail "OpenClaw install failed — check npm and retry"
  fi

  # Run doctor
  step "Running openclaw doctor..."
  if openclaw doctor 2>/dev/null; then
    ok "openclaw doctor passed"
  else
    warn "openclaw doctor reported issues — review output above"
    MANUAL_STEPS+=("Review 'openclaw doctor' output and fix configuration issues")
  fi

  # Start gateway
  step "Starting OpenClaw gateway..."
  if openclaw gateway status 2>/dev/null | grep -qi "running\|active"; then
    ok "Gateway already running"
  else
    openclaw gateway start 2>/dev/null && ok "Gateway started" \
      || warn "Gateway failed to start — check openclaw.json config"
  fi

  # Verify cron jobs
  step "Verifying cron jobs..."
  CRON_FILE="$HOME/.openclaw/cron/jobs.json"
  if [[ -f "$CRON_FILE" ]]; then
    # Try to list cron jobs
    CRON_LIST=$(openclaw cron list 2>/dev/null || echo "")
    if [[ -n "$CRON_LIST" ]]; then
      ok "Cron jobs loaded from $CRON_FILE"
      info "Active jobs: $(echo "$CRON_LIST" | grep -c "." || echo "?")"
    else
      warn "Could not list cron jobs — may need gateway restart"
      MANUAL_STEPS+=("Verify cron jobs via 'openclaw cron list' after gateway is stable")
    fi
  else
    warn "No cron jobs file found — skipping cron verification"
  fi

  # Restore backup script PATH fix (known issue from 2026-04-07)
  step "Checking backup script PATH fix..."
  BACKUP_SCRIPT="$HOME/Desktop/aloomii/scripts/backup.sh"
  if [[ -f "$BACKUP_SCRIPT" ]]; then
    if grep -q 'export PATH.*homebrew' "$BACKUP_SCRIPT" 2>/dev/null; then
      ok "backup.sh has Homebrew PATH fix ✓"
    else
      warn "backup.sh may be missing Homebrew PATH fix — adding it now"
      sed -i '' '2s|^|export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"\n|' \
        "$BACKUP_SCRIPT" 2>/dev/null \
        && ok "PATH fix added to backup.sh" \
        || warn "Could not auto-fix backup.sh — add PATH export manually"
    fi
  else
    warn "backup.sh not found — will exist after Backblaze restore"
  fi

  STEPS_DONE+=("✅ Section 5: OpenClaw Setup")
}

# ─── SECTION 6: VERIFICATION TESTS ───────────────────────────────────────────
section_verify() {
  header "SECTION 6: VERIFICATION TESTS"

  # Test DB connection
  step "Testing database connection..."
  if "$PSQL" "$DB_URL" -c "SELECT 1;" >/dev/null 2>&1; then
    ok "Database connection: OK (postgresql://superhana@localhost:5432/aloomii)"
  else
    fail "Database connection FAILED — check PostgreSQL is running"
    MANUAL_STEPS+=("Fix DB connection: brew services start postgresql@18")
  fi

  # Test table counts
  step "Testing table row counts..."
  for table in "${KEY_TABLES[@]}"; do
    COUNT=$("$PSQL" "$DB_URL" -tAc "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "ERROR")
    if [[ "$COUNT" == "ERROR" ]]; then
      warn "Table '$table': not accessible"
    else
      ok "Table '$table': $COUNT rows"
    fi
  done

  # Test OpenClaw CLI
  step "Testing openclaw status..."
  if openclaw status >/dev/null 2>&1; then
    ok "openclaw status: OK"
  else
    warn "openclaw status returned non-zero — may still be starting up"
  fi

  # Test workspace + MEMORY.md
  step "Testing workspace..."
  if [[ -f "$HOME/.openclaw/workspace/MEMORY.md" ]]; then
    MEM_LINES=$(wc -l < "$HOME/.openclaw/workspace/MEMORY.md" | tr -d ' ')
    ok "MEMORY.md found ($MEM_LINES lines)"
  else
    fail "MEMORY.md missing — workspace may not be fully restored"
    MANUAL_STEPS+=("Restore ~/.openclaw/workspace/MEMORY.md from Backblaze or git")
  fi

  # Test Obsidian vault
  step "Testing Obsidian vault..."
  VAULT="$HOME/Documents/AloomiiVault/AloomiiVault"
  if [[ -d "$VAULT" ]] && [[ $(find "$VAULT" -name "*.md" | wc -l | tr -d ' ') -gt 0 ]]; then
    ok "Obsidian vault has content ✓"
  else
    fail "Obsidian vault empty or missing"
  fi

  # Test node
  step "Testing Node.js..."
  if command_exists node; then
    NODE_VER=$(node --version)
    ok "Node.js: $NODE_VER"
  else
    fail "Node.js not found"
    MANUAL_STEPS+=("Install Node.js: brew install node")
  fi

  # Test cloudflared
  step "Testing cloudflared..."
  if command_exists cloudflared; then
    CF_VER=$(cloudflared --version 2>/dev/null | head -1)
    ok "cloudflared: $CF_VER"
    if brew services list | grep -q "cloudflared.*started"; then
      ok "cloudflared service: running"
    else
      warn "cloudflared installed but not running as service"
      MANUAL_STEPS+=("Configure and start cloudflared tunnel: brew services start cloudflared")
    fi
  else
    warn "cloudflared not installed"
    MANUAL_STEPS+=("Install cloudflared: brew install cloudflared")
  fi

  STEPS_DONE+=("✅ Section 6: Verification Tests")
}

# ─── SECTION 7: LM STUDIO NOTES ──────────────────────────────────────────────
section_lm_studio() {
  header "SECTION 7: LM STUDIO NOTES"

  echo ""
  echo -e "  ${YELLOW}${BOLD}⚠️  LM Studio models are typically NOT backed up by Backblaze${RESET}"
  echo -e "  ${YELLOW}  due to their large size (5–10 GB each).${RESET}"
  echo ""
  echo -e "  ${BOLD}To restore your primary model (qwen3.5-9b-optiq):${RESET}"
  echo ""
  echo -e "  1. Download LM Studio from ${CYAN}https://lmstudio.ai${RESET}"
  echo -e "     (or ${CYAN}https://releases.lmstudio.ai${RESET})"
  echo ""
  echo -e "  2. Install LM Studio.app to /Applications/"
  echo ""
  echo -e "  3. Open LM Studio → Search: ${BOLD}qwen3.5-9b-optiq${RESET}"
  echo -e "     or browse the model hub for Qwen 3.5 9B OPTIQ quantization"
  echo ""
  echo -e "  4. Download the model (~5–10 GB, requires good internet)"
  echo ""
  echo -e "  5. Start LM Studio local server on port ${BOLD}1234${RESET} (default)"
  echo -e "     LM Studio → Local Server → Start Server"
  echo ""
  echo -e "  6. Verify: ${CYAN}curl http://localhost:1234/v1/models${RESET}"
  echo ""
  warn "Manual action required: Download qwen3.5-9b-optiq via LM Studio"

  MANUAL_STEPS+=("Download LM Studio from https://lmstudio.ai and re-install qwen3.5-9b-optiq model")
  MANUAL_STEPS+=("Start LM Studio local server on port 1234 and verify via: curl http://localhost:1234/v1/models")

  STEPS_DONE+=("✅ Section 7: LM Studio Notes")
}

# ─── SECTION 8: FINAL REPORT ─────────────────────────────────────────────────
section_final_report() {
  header "SECTION 8: FINAL REPORT"

  echo ""
  echo -e "${BOLD}  RECOVERY SUMMARY${RESET}"
  echo -e "  ────────────────────────────────────────────────"
  echo -e "  ${GREEN}Passed:  $PASS_COUNT${RESET}"
  echo -e "  ${RED}Failed:  $FAIL_COUNT${RESET}"
  echo -e "  ${YELLOW}Warnings: $WARN_COUNT${RESET}"
  echo ""

  echo -e "${BOLD}  STEPS COMPLETED${RESET}"
  echo -e "  ────────────────────────────────────────────────"
  for s in "${STEPS_DONE[@]}"; do
    echo -e "  $s"
  done
  echo ""

  echo -e "${BOLD}  IMPORTANT PATHS${RESET}"
  echo -e "  ────────────────────────────────────────────────"
  echo -e "  ${CYAN}Aloomii repo:${RESET}     ~/Desktop/aloomii/"
  echo -e "  ${CYAN}OpenClaw config:${RESET}  ~/.openclaw/openclaw.json"
  echo -e "  ${CYAN}OpenClaw workspace:${RESET} ~/.openclaw/workspace/"
  echo -e "  ${CYAN}Cron jobs:${RESET}        ~/.openclaw/cron/jobs.json"
  echo -e "  ${CYAN}Skills:${RESET}           ~/.openclaw/workspace/skills/"
  echo -e "  ${CYAN}Obsidian vault:${RESET}   ~/Documents/AloomiiVault/AloomiiVault/"
  echo ""

  echo -e "${BOLD}  CONNECTION STRINGS${RESET}"
  echo -e "  ────────────────────────────────────────────────"
  echo -e "  ${CYAN}PostgreSQL:${RESET}  postgresql://superhana@localhost:5432/aloomii"
  echo -e "  ${CYAN}psql:${RESET}        /opt/homebrew/Cellar/postgresql@18/18.2/bin/psql"
  echo -e "  ${CYAN}pg_isready:${RESET}  /opt/homebrew/Cellar/postgresql@18/18.2/bin/pg_isready"
  echo -e "  ${CYAN}pg_dump:${RESET}     /opt/homebrew/Cellar/postgresql@18/18.2/bin/pg_dump"
  echo -e "  ${CYAN}DB port:${RESET}     5432"
  echo ""

  if [[ ${#MANUAL_STEPS[@]} -gt 0 ]]; then
    echo -e "${YELLOW}${BOLD}  MANUAL STEPS STILL NEEDED${RESET}"
    echo -e "  ────────────────────────────────────────────────"
    STEP_NUM=1
    for ms in "${MANUAL_STEPS[@]}"; do
      echo -e "  ${YELLOW}$STEP_NUM.${RESET} $ms"
      ((STEP_NUM++)) || true
    done
    echo ""
  fi

  echo -e "${BOLD}  CLOUDFLARE SETUP (dashboard.aloomii.com)${RESET}"
  echo -e "  ────────────────────────────────────────────────"
  echo -e "  1. Configure cloudflared tunnel pointing to localhost:3100"
  echo -e "  2. Set Cloudflare Access policy on dashboard.aloomii.com"
  echo -e "     (email allowlist per client)"
  echo -e "  3. Grab Audience tag from Access policy"
  echo -e "  4. Set CF_AUD env var in dashboard server config"
  echo -e "  5. Set report_email per client in client_pilots table"
  echo -e "  6. Start dashboard server: node scripts/client-dashboard-api.js"
  echo ""

  echo -e "${BOLD}  BUFFER / BLOTATO / CONVERTKIT${RESET}"
  echo -e "  ────────────────────────────────────────────────"
  echo -e "  API keys are stored in ~/.openclaw/workspace/TOOLS.md"
  echo -e "  Verify each after restore — keys may have rotated."
  echo ""

  if [[ $FAIL_COUNT -eq 0 ]]; then
    echo -e "  ${GREEN}${BOLD}🎉 Recovery complete! System appears healthy.${RESET}"
  elif [[ $FAIL_COUNT -le 3 ]]; then
    echo -e "  ${YELLOW}${BOLD}⚠️  Recovery complete with $FAIL_COUNT failure(s). Review items above.${RESET}"
  else
    echo -e "  ${RED}${BOLD}❌ Recovery has $FAIL_COUNT failures. Manual intervention required.${RESET}"
  fi

  echo ""
}

# ─── MAIN ────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ┌──────────────────────────────────────────────────────┐"
  echo "  │     Aloomii + OpenClaw Disaster Recovery Script      │"
  echo "  │     Machine: macOS arm64 | User: superhana           │"
  echo "  │     Run --help for usage information                 │"
  echo "  └──────────────────────────────────────────────────────┘"
  echo -e "${RESET}"

  section_preflight
  section_homebrew
  section_database
  section_post_restore
  section_openclaw
  section_verify
  section_lm_studio
  section_final_report
}

main "$@"
