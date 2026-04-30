# SOP: Event Scanner
_v2 — Updated 2026-03-04 (Phase 1: Smarter Targeting)_

## Purpose
Scan for upcoming events (conferences, meetups, demo days, pitch nights) relevant to Aloomii's fundraising, PBN guest booking, and ICP networking goals. Run 2x/week.

## Trigger
- Cron: **Monday + Thursday, 6:00 AM EST**
- Model: flash

## Step 0 — Date Awareness (mandatory)
Before searching, establish today's date. Only surface events happening **within the next 60 days**. Skip any event whose date has already passed.

## Step 0.1 — Load ICP Config

Read `config/signal-scout-icps.yaml`. Determine which ICPs are active.
- `sprint.enabled: true` → include Sprint ICP event searches (SaaS, founder GTM, B2B marketing conferences)
- `ai_workforce.enabled: true` → include AI Workforce event searches (insurance, financial services, wealth management conferences)
- File missing → treat both as ACTIVE

## Step 0.5 — Direct Feed Scrapling (run BEFORE Gemini searches — fresher results)

Scrape Luma and Eventbrite city pages directly for real-time event listings. This catches events not yet indexed by Gemini search.

```bash
# ── Luma City Pages ────────────────────────────────────────────────────────
scripts/.venv/bin/python scripts/scrapling-fetch.py https://lu.ma/toronto
scripts/.venv/bin/python scripts/scrapling-fetch.py https://lu.ma/nyc
scripts/.venv/bin/python scripts/scrapling-fetch.py https://lu.ma/sf
scripts/.venv/bin/python scripts/scrapling-fetch.py https://lu.ma/miami
scripts/.venv/bin/python scripts/scrapling-fetch.py https://lu.ma/austin
scripts/.venv/bin/python scripts/scrapling-fetch.py https://lu.ma/montreal

# ── Luma Category Pages ────────────────────────────────────────────────────
scripts/.venv/bin/python scripts/scrapling-fetch.py https://lu.ma/ai
scripts/.venv/bin/python scripts/scrapling-fetch.py https://lu.ma/crypto
scripts/.venv/bin/python scripts/scrapling-fetch.py https://lu.ma/startup

# ── Eventbrite City Searches ───────────────────────────────────────────────
scripts/.venv/bin/python scripts/scrapling-fetch.py "https://www.eventbrite.com/d/canada--toronto/business--conferences/"
scripts/.venv/bin/python scripts/scrapling-fetch.py "https://www.eventbrite.com/d/ny--new-york/technology/"
scripts/.venv/bin/python scripts/scrapling-fetch.py "https://www.eventbrite.com/d/ca--san-francisco/technology/"
scripts/.venv/bin/python scripts/scrapling-fetch.py "https://www.eventbrite.com/d/fl--miami/business--conferences/"
scripts/.venv/bin/python scripts/scrapling-fetch.py "https://www.eventbrite.com/d/tx--austin/technology/"
```

**For each event found via Scrapling, extract:**
- Event name, date, location, organizer, URL, description snippet

**Scrapling failure fallback:** If a URL errors or returns empty, skip it silently and continue. Note failures in standup.md: "Scrapling failures (events): N". Fall back to Gemini search for that city.

**Dedup:** Check event name + date against existing `events` DB table before scoring. Skip duplicates.

## Step 1 — Search (run all queries)

> ⚠️ **Search Tool Rule:** Always use `exec` with `bash scripts/gemini-search.sh "query"` for web research. Do NOT use the `web_search` tool — Brave API key is not configured.

```bash
# ── Toronto (in-person priority) ──────────────────────────────────────────
bash scripts/gemini-search.sh "upcoming Toronto AI tech startup meetup events 2026 site:lu.ma OR site:meetup.com"
bash scripts/gemini-search.sh "Toronto VC investor angel pitch night demo day 2026"
bash scripts/gemini-search.sh "TechTO upcoming events 2026"
bash scripts/gemini-search.sh "Toronto founder networking event March April 2026"

# ── Montreal (Canadian VC cluster) ─────────────────────────────────────────
bash scripts/gemini-search.sh "Montreal AI startup investor event conference 2026"
bash scripts/gemini-search.sh "Montreal tech founder meetup demo day StartupFest 2026"

# ── Raleigh-Durham (Research Triangle) ────────────────────────────────────
bash scripts/gemini-search.sh "Raleigh Durham Research Triangle AI startup founder event 2026"
bash scripts/gemini-search.sh "NC tech startup investor meetup conference 2026"

# ── Miami ──────────────────────────────────────────────────────────────────
bash scripts/gemini-search.sh "Miami Bitcoin crypto AI startup founder conference 2026"
bash scripts/gemini-search.sh "Miami tech investor networking event 2026"

# ── Austin ─────────────────────────────────────────────────────────────────
bash scripts/gemini-search.sh "Austin AI startup founder investor event conference 2026"
bash scripts/gemini-search.sh "Austin tech meetup SXSW adjacent crypto AI 2026"

# ── New York City ──────────────────────────────────────────────────────────
bash scripts/gemini-search.sh "NYC AI founder VC networking startup event 2026"
bash scripts/gemini-search.sh "New York crypto blockchain conference summit 2026"

# ── San Francisco / Bay Area ───────────────────────────────────────────────
bash scripts/gemini-search.sh "LAUNCH Festival 2026 San Francisco"
bash scripts/gemini-search.sh "San Francisco AI founder investor summit conference 2026"
bash scripts/gemini-search.sh "YC Demo Day 2026 upcoming"
bash scripts/gemini-search.sh "SF crypto Bitcoin AI startup event 2026"

# ── Major Recurring Conferences (always check) ────────────────────────────
bash scripts/gemini-search.sh "Consensus 2026 conference date speakers"
bash scripts/gemini-search.sh "ETHDenver ETHGlobal 2026 upcoming events"
bash scripts/gemini-search.sh "Collision Conference 2026 Toronto"
bash scripts/gemini-search.sh "StartupFest 2026 Montreal"
bash scripts/gemini-search.sh "Investor Drinks Startup pitch night Hamilton Toronto 2026"

# ── Sprint ICP Conferences (run ONLY if Sprint ICP is ACTIVE) ─────────────
# B2B SaaS founders, founder GTM, B2B marketing — where Sprint buyers gather
bash scripts/gemini-search.sh "SaaStr Annual 2026 conference date tickets"
bash scripts/gemini-search.sh "Inbound 2026 HubSpot conference Boston date"
bash scripts/gemini-search.sh "AI Engineer World's Fair 2026 San Francisco"
bash scripts/gemini-search.sh "MicroConf 2026 founder SaaS conference"
bash scripts/gemini-search.sh "B2B Marketing Exchange 2026 conference"
bash scripts/gemini-search.sh "Demand Gen Summit 2026 B2B marketing"
bash scripts/gemini-search.sh "founder GTM marketing conference 2026 SaaS"

# ── AI Workforce ICP Conferences (run ONLY if AI Workforce ICP is ACTIVE) ──
# Insurance, financial services, wealth management — where AI Workforce buyers gather
bash scripts/gemini-search.sh "NAIFA annual conference 2026 insurance advisors"
bash scripts/gemini-search.sh "FPA NexGen 2026 financial planning conference"
bash scripts/gemini-search.sh "LIMRA annual conference 2026 insurance industry"
bash scripts/gemini-search.sh "InsureTech Connect 2026 conference"
bash scripts/gemini-search.sh "Wealth Management EDGE conference 2026"
bash scripts/gemini-search.sh "MDRT annual meeting 2026 financial advisors"
bash scripts/gemini-search.sh "Canada insurance broker conference 2026 IBAC"
```

## Step 2 — Base Scoring (Phase 1)

Score **1–5** on each dimension, then sum:

| Dimension | 1 | 3 | 5 |
|---|---|---|---|
| **Investor density** | General public | Mix of founders + investors | VC/angel heavy |
| **ICP density** | Unrelated audience | Some active-ICP attendees | Dense active-ICP audience (Sprint: B2B founders; AI Workforce: insurance/financial advisors) |
| **Aloomii pitch opp** | None | Networking only | Demo slot / pitch competition |
| **PBN guest potential** | No known speakers | Possible booking target | Known PBN candidate speaking |
| **Accessibility** | International travel required | 1-day trip | Toronto / online |

**Base score range:** 1–25

**Base score thresholds:**
- **20–25** → 🔴 PRIORITY — Discord alert + add to calendar
- **12–19** → 🟡 ATTEND — add to calendar, flag in upcoming-events.md
- **<12** → ⚪ MONITOR — calendar only, no alert

## Step 3 — CRM-Linked Scoring (Phase 2)

> ⚠️ Requires: Phase 2 script (`scripts/event-crm-match.js`) and DB connection

After base scoring, run the CRM matching script to cross-reference events against your network:

```bash
node scripts/event-crm-match.js
```

**What it does:**
1. Fetches Tier 1 + 2 contacts from the CRM
2. For events with base score ≥3, runs Gemini search to check if any CRM contacts are speaking/attending
3. Adds CRM bonus points on top of base score:
   - Tier 1 speaker: +10 | Tier 1 attendee: +6
   - Tier 2 speaker: +6 | Tier 2 attendee: +3
   - 3+ CRM contacts at same event: +4 (stacking)
   - PBN guest candidate speaking: +5
   - Investor prospect attending: +4

**New score range:** 1–45 (base 1–25 + CRM bonus up to +20)

**New thresholds:**
- **30–45** → 🔴 CRITICAL — Discord alert + pre-event outreach drafts generated
- **20–29** → 🟠 PRIORITY — Discord alert
- **12–19** → 🟡 ATTEND — calendar only
- **<12** → ⚪ MONITOR — skip

**Output:**
- `events/crm-matches.json` — structured match data for Phase 3
- `events/calendar.yaml` — updated with `crm_matches`, `crm_bonus_score`, `total_score` fields
- `pipeline/follow-ups.md` — pre-event outreach drafts for CRITICAL events

**Testing:**
```bash
node scripts/event-crm-match.js --dry-run
```

## Step 4 — Deduplication (mandatory)
Before adding any event to `events/calendar.yaml`:
1. Read existing `calendar.yaml` — extract all `name` + `date` fields
2. Skip any event whose `name` + `date` combo already exists
3. Skip any event dated **before today**
4. Only append net-new future events

## Step 5 — Output

Write to:
- `events/calendar.yaml` — master list (append only)
- `events/upcoming-events.md` — human-readable table, newest events at top

Table format for upcoming-events.md:
```
| Date | Event | Location | Score | Why It Matters |
```

For **Priority (20–25)** events, also post to Discord #general:
```
📅 HIGH-VALUE EVENT: [Name]
📍 [Location] · [Date]
🎯 [1-sentence why it matters for Aloomii/PBN]
🔗 [URL if available]
```

## Step 6 — Annual Recurrence Flag
If an event is a known annual conference (Consensus, ETHDenver, Collision, StartupFest, LAUNCH), add `recurs_annually: true` to its calendar.yaml entry.

---

## Phase 3: Action Generation (event-action-gen.js)

After CRM matching (Step 3), run the action generation script to transform matches into pipeline:

```bash
node scripts/event-action-gen.js
```

**What it does:**
1. Reads matches from `events/crm-matches.json`
2. For each CRITICAL/PRIORITY event:
   - Generates rich personalized outreach drafts (uses contact notes from DB)
   - Creates PBN guest pitch if speaker has `pbn-guest-candidate` tag
   - Writes talking points brief to `events/briefs/[slug].md` (if within 21 days)
   - Inserts activity_log entries in DB
   - Queues post-event reminder in `events/post-event-queue.yaml`

**Output:**
- `events/briefs/[slug].md` — per-event talking points
- `pipeline/pbn-outreach.md` — PBN pitches (append-only)
- `events/post-event-queue.yaml` — post-event follow-up reminders
- DB: `activity_log` entries with type `event_match`

**Testing:**
```bash
node scripts/event-action-gen.js --dry-run
```

---

## Phase 4: Speaker Watch + Annual Auto-Queue

### Step 5 — Speaker Announcement Monitor (Phase 4a)

> ⚠️ Runs inside event-scanner cron as Step 5

```bash
node scripts/event-speaker-watch.js
```

**What it does:**
1. Reads upcoming events from calendar.yaml (next 90 days)
2. For each event, runs Gemini search for speaker lineups
3. Cross-references against CRM contacts (fuzzy match)
4. For new matches not in `speaker-watch-log.yaml`:
   - Updates calendar with new crm_matches
   - Recalculates total_score
   - Triggers Discord alert if crosses CRITICAL/PRIORITY threshold
   - Logs to speaker-watch-log.yaml (dedup)

**Dedup:** Uses `events/speaker-watch-log.yaml` to prevent double-alerts.

**Cost cap:** Max 2 searches per event × 15 events = 30 searches (~$0.03/run)

**Testing:**
```bash
node scripts/event-speaker-watch.js --dry-run
```

### Step 6 — Annual Event Auto-Queue (Phase 4c)

> ⚠️ Runs inside event-scanner cron as final step

```bash
node scripts/event-recurrence.js
```

**What it does:**
1. Reads calendar.yaml for events with `recurs_annually: true`
2. Checks if next-year version already exists
3. If not, appends placeholder entry with date "TBD"
4. Logs to `events/recurrence-log.yaml` to prevent repeat Discord announcements

**Output:**
- `events/calendar.yaml` — new placeholder entries
- `events/recurrence-log.yaml` — dedup log

**Testing:**
```bash
node scripts/event-recurrence.js --dry-run
```
