#!/usr/bin/env python3
"""
Build script for Chamber Demo Cloudflare Worker.
Bakes live API data into HTML files so the Worker can serve them statically.
Run after starting the local server: node scripts/chamber-demo-server.js
"""
import json, re, subprocess, sys
from pathlib import Path

WORKER_DIR = Path(__file__).parent
ASSETS_DIR = WORKER_DIR / "assets"
SRC_DIR   = Path(__file__).parent.parent / "demo"
API_BASE  = "http://localhost:3300/api/chamber-demo"

def fetch_json(path):
    result = subprocess.run(["curl", "-s", f"{API_BASE}/{path}"], capture_output=True, text=True)
    return json.loads(result.stdout)

def main():
    print("Copying demo files...")
    for fname in [
        "chamber-demo.html",
        "chamber-ui.css",
        "chamber-ui.js",
        "chamber-directory.html",
        "chamber-org-detail.html",
        "chamber-events.html",
        "chamber-event-detail.html",
        "chamber-join.html",
        "chamber-member-login.html",
        "chamber-member-consume.html",
        "chamber-member-dashboard.html",
        "chamber-admin.html",
        "chamber-admin-org-detail.html",
    ]:
        src = SRC_DIR / fname
        dst = ASSETS_DIR / fname
        if src.exists():
            dst.write_text(src.read_text())
            print(f"  copied {fname}")

    import shutil
    if (SRC_DIR / "assets").exists():
        shutil.copytree(SRC_DIR / "assets", ASSETS_DIR / "assets", dirs_exist_ok=True)
        print("  copied assets/")

    print("Fetching live API data...")
    try:
        overview = fetch_json("overview")
        events   = fetch_json("events")
    except Exception as e:
        print(f"WARNING: Could not reach local API ({e}). Using fallback (empty data).")
        overview = {"error": "api unavailable", "featuredOrganizations": [], "upcomingEvents": []}
        events   = {"events": []}

    with open(ASSETS_DIR / "chamber-demo.html") as f:
        html = f.read()

    overview_json = json.dumps(overview, ensure_ascii=False)
    events_json   = json.dumps(events,   ensure_ascii=False)

    # Inject preloaded data before loadOverview
    inject = f'<script>window.__PRELOADED_OVERVIEW__ = {overview_json};window.__PRELOADED_EVENTS__ = {events_json};\\n</script>\\n'

    old_fetch = "const res = await fetch('/api/chamber-demo/overview');\n      const data = await res.json();"
    new_fetch = "const res = window.__PRELOADED_OVERVIEW__ ? { json: async () => window.__PRELOADED_OVERVIEW__ } : await fetch('/api/chamber-demo/overview');\n      const data = await res.json();"

    if old_fetch in html:
        html = html.replace(old_fetch, new_fetch, 1)
    else:
        # fallback: prepend the preloaded data anyway
        html = html.replace('<script>\n    async function loadOverview()', inject + '<script>\n    async function loadOverview()')

    with open(ASSETS_DIR / "chamber-demo.html", "w") as f:
        f.write(html)
    print("chamber-demo.html baked with live API data.")

    print(f"Assets ready in {ASSETS_DIR}/")

if __name__ == "__main__":
    main()