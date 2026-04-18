#!/usr/bin/env bash
# Build script: bakes API data into HTML files for static serving via Cloudflare Worker
set -e

WORKER_DIR="$HOME/Desktop/aloomii/chamber-worker"
ASSETS_DIR="$WORKER_DIR/assets"
SRC_DIR="$HOME/Desktop/aloomii/demo"

echo "Copying demo files..."
cp "$SRC_DIR/chamber-demo.html"         "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-ui.css"            "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-ui.js"             "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-directory.html"    "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-org-detail.html"   "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-events.html"       "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-event-detail.html" "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-join.html"         "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-member-login.html" "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-member-consume.html" "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-member-dashboard.html" "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-admin.html"       "$ASSETS_DIR/"
cp "$SRC_DIR/chamber-admin-org-detail.html" "$ASSETS_DIR/"
cp -r "$SRC_DIR/assets/"                "$ASSETS_DIR/"

echo "Fetching live API data from localhost:3300..."
OVERVIEW=$(curl -s http://localhost:3300/api/chamber-demo/overview)
EVENTS=$(curl -s http://localhost:3300/api/chamber-demo/events)
DIRECTORY=$(curl -s http://localhost:3300/api/chamber-demo/directory)

echo "Baking data into chamber-demo.html..."
python3 - <<PY
import json, re

overview = json.loads('''${OVERVIEW.replace("'", "\\'")}''')
events   = json.loads('''${EVENTS.replace("'", "\\'")}''')

with open('$ASSETS_DIR/chamber-demo.html') as f:
    html = f.read()

# Inject overview data as a global JS variable
overview_json = json.dumps(overview, ensure_ascii=False)
events_json   = json.dumps(events,   ensure_ascii=False)

# Pre-populate the overview API response to avoid a runtime fetch on the static page
# The loadOverview() function will check for window.__PRELOADED_DATA__ first
inject = f"""
<script>
window.__PRELOADED_OVERVIEW__ = {overview_json};
window.__PRELOADED_EVENTS__    = {events_json};
</script>
"""
html = html.replace('<script>\\n    async function loadOverview()', inject + '<script>\\n    async function loadOverview()')

# Patch loadOverview to use preloaded data if available
old = "const res = await fetch('/api/chamber-demo/overview');\\n      const data = await res.json();"
new = """const data = window.__PRELOADED_OVERVIEW__ || await (await fetch('/api/chamber-demo/overview')).json();"""
html = html.replace(old, new)

with open('$ASSETS_DIR/chamber-demo.html', 'w') as f:
    f.write(html)
print("chamber-demo.html baked OK")
PY

echo "Done. Files ready in $ASSETS_DIR/"