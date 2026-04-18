#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_SCRIPT="$ROOT/scripts/chamber-demo-server.js"
PID_FILE="/tmp/chamber-demo-smoke.pid"
BASE="http://localhost:3300"

cleanup() {
  if [[ -f "$PID_FILE" ]]; then
    PID=$(cat "$PID_FILE" || true)
    if [[ -n "${PID:-}" ]] && kill -0 "$PID" >/dev/null 2>&1; then
      kill "$PID" >/dev/null 2>&1 || true
    fi
    rm -f "$PID_FILE"
  fi
}
trap cleanup EXIT

node "$SERVER_SCRIPT" >/tmp/chamber-demo-smoke.log 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

# Wait for server to be ready
for i in $(seq 1 30); do
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

curl -fsS "$BASE/health" >/dev/null
curl -fsS "$BASE/chamber-demo" >/dev/null
curl -fsS "$BASE/chamber-demo/directory" >/dev/null
curl -fsS "$BASE/chamber-demo/events" >/dev/null
curl -fsS "$BASE/chamber-demo/join" >/dev/null
curl -fsS "$BASE/demo/chamber-ui.css" >/dev/null
curl -fsS "$BASE/api/chamber-demo/directory/caledonia-regional-chamber-of-commerce" >/dev/null
curl -fsS "$BASE/api/chamber-demo/events/chamber-members-speed-networking-event" >/dev/null

curl -fsS -X POST "$BASE/api/chamber-demo/join" \
  -H 'Content-Type: application/json' \
  -d '{"organization_name":"Smoke Test Pending Org","email":"smoke-pending@caledoniachamberdemo.ca","contact_name":"Smoke Test","notes":"Created by chamber smoke script"}' >/dev/null

curl -fsS -c /tmp/chamber_admin.cookies -X POST "$BASE/api/chamber-demo/admin/login" \
  -H 'Content-Type: application/json' \
  -d '{"code":"chamberdemo888"}' >/dev/null

PENDING_ID=$(curl -fsS -b /tmp/chamber_admin.cookies "$BASE/api/chamber-demo/admin/overview" | python3 -c 'import sys,json; data=json.load(sys.stdin); target="smoke-pending@caledoniachamberdemo.ca"; print(next((org["id"] for org in data["pendingOrganizations"] if org.get("email") == target), ""))')
if [[ -n "$PENDING_ID" ]]; then
  curl -fsS -b /tmp/chamber_admin.cookies -X POST "$BASE/api/chamber-demo/admin/organizations/$PENDING_ID/approve" >/dev/null
fi

CONTENT_ID=$(curl -fsS -b /tmp/chamber_admin.cookies "$BASE/api/chamber-demo/admin/overview" | python3 -c 'import sys,json; data=json.load(sys.stdin); print((data["pendingContent"][0]["id"] if data["pendingContent"] else ""))')
if [[ -n "$CONTENT_ID" ]]; then
  curl -fsS -b /tmp/chamber_admin.cookies -X POST "$BASE/api/chamber-demo/admin/content/$CONTENT_ID/archive" >/dev/null
fi

ADMIN_AFTER=$(curl -s -b /tmp/chamber_admin.cookies -c /tmp/chamber_admin.cookies -X POST "$BASE/api/chamber-demo/admin/logout")
[[ "$ADMIN_AFTER" == *'"ok":true'* ]]
ADMIN_CODE=$(curl -s -b /tmp/chamber_admin.cookies -o /tmp/ch_admin_after.json -w "%{http_code}" "$BASE/api/chamber-demo/admin/overview")
[[ "$ADMIN_CODE" == "401" ]]

TOKEN=$(curl -fsS -X POST "$BASE/api/chamber-demo/member-auth/request-link" \
  -H 'Content-Type: application/json' \
  -d '{"email":"member+caledonia-regional-chamber-of-commerce@caledoniachamberdemo.ca"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["magicLink"].split("token=")[1])')

curl -fsS -c /tmp/chamber_member.cookies -X POST "$BASE/api/chamber-demo/member-auth/consume" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\"}" >/dev/null

curl -fsS -b /tmp/chamber_member.cookies "$BASE/api/chamber-demo/member/me" >/dev/null
MEMBER_AFTER=$(curl -s -b /tmp/chamber_member.cookies -c /tmp/chamber_member.cookies -X POST "$BASE/api/chamber-demo/member-auth/logout")
[[ "$MEMBER_AFTER" == *'"ok":true'* ]]
MEMBER_CODE=$(curl -s -b /tmp/chamber_member.cookies -o /tmp/ch_member_after.json -w "%{http_code}" "$BASE/api/chamber-demo/member/me")
[[ "$MEMBER_CODE" == "401" ]]

echo "ChamberCore smoke pass completed successfully."
