#!/bin/bash
# Deploy Command Center to command.aloomii.com
# Prereqs: cloudflared installed + configured tunnel pointing to localhost:3200
#
# Required env vars (set in environment or .env):
#   CF_AUD         — Cloudflare Access Audience tag
#   CF_TEAM_DOMAIN — Cloudflare team domain
#   DATABASE_URL   — PostgreSQL connection string

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "  🦁 Command Center — Deploy"
echo "  ─────────────────────────────────────"

# Validate prerequisites
if ! command -v node &> /dev/null; then
  echo "  ERROR: node not found. Install Node.js first."
  exit 1
fi

if ! command -v cloudflared &> /dev/null; then
  echo "  WARNING: cloudflared not found. Tunnel will not be established."
fi

# Load env from .env if present
if [ -f "$SCRIPT_DIR/.env" ]; then
  echo "  Loading env from $SCRIPT_DIR/.env"
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# Set defaults
export PORT="${PORT:-3200}"
export CF_AUD="${CF_AUD:-}"
export CF_TEAM_DOMAIN="${CF_TEAM_DOMAIN:-aloomii}"
export DATABASE_URL="${DATABASE_URL:-postgresql://superhana@localhost:5432/aloomii}"

echo "  Port:       $PORT"
echo "  CF_AUD:     ${CF_AUD:+configured} ${CF_AUD:-not set (dev mode)}"
echo "  DB:         $DATABASE_URL"
echo "  Cloudflare: ${CF_AUD:+production (JWT auth)} ${CF_AUD:-dev (no auth)}"
echo ""
echo "  Starting server..."
echo ""

node "$SCRIPT_DIR/serve-local.js"
