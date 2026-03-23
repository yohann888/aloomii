# Cron Fleet Reference
_Load via memory_search. Last updated: 2026-03-20_

## Active Crons

| Job | Model | Schedule | Notes |
|---|---|---|---|
| signal-scout | gemini-3-flash | 6,10,14,18,22h ET | 3-layer pipeline: scrapling→MiniMax→Flash. Dedup: seen-handles.txt (NOT signals.md). Phases 1.8+1.9 added (IndieHackers, job boards). Timeout fixed: 165s. Now wired to CRM match (crm-signal-match.js) |
| village-enrich | gemini-3-flash | 3pm ET daily | Auth fixed 2026-03-17 (user-scoped JWT). Batch limit: 150 (raised from 50). LinkedIn 2,453 connections seeded. |
| senior-pm-daily | gemini-3-flash | 6:30am ET | writes daily/pm-brief.md |
| senior-pm-weekly | gemini-3-flash | Fri 3pm ET | weekly strategy review |
| reconnection-engine | gemini-3-flash | Mon 9am ET | FIXED 2026-03-03: YAML multi-line block scalar crash in contacts.yaml. Script now strips entire block (header + continuation lines). |
| nightly-audit | gemini-3-flash | nightly | writes output/nightly-audit-YYYY-MM-DD.md |
| relationship-monitor | MiniMax | 7am ET daily | silent delivery → pipeline/follow-ups.md |
| senior-coder-weekly | MiniMax | weekly | |
| spend-alert | zai-flash | every 2h | FIXED 2026-03-03: (1) shell hang from backtick/$ in execSync → switched to execFileSync. (2) timeout bumped 60s → 120s |
| metrics-sync | zai-flash | 9am ET | |
| junior-coder | zai-flash | 5am ET | daily maintenance sweep |
| documentation-agent | MiniMax | nightly ~11pm | observer bot |
| event-scanner | gemini-3-flash | Mon + Thu 6am ET | UPGRADED 2026-03-04 (Phase 1): schedule 2x/week. Dropped trades/HVAC/real estate. Added Toronto, Montreal, SF, NYC, Miami, major recurring conferences. 5-dimension scoring matrix. 60-day lookback. UPGRADED 2026-03-05 (Phases 3–4): cron prompt now calls event-crm-match.js → event-action-gen.js → event-speaker-watch.js → event-recurrence.js in sequence. Full pipeline first run: Thu Mar 5 6AM ET. |
| marketplace-sniper | flash | every 2h | ADDED ~2026-03-05. THROTTLED 2026-03-06: 15m → 2h. ID: 7c5acd8a. Targets UPDATED 2026-03-06 afternoon: Primary = PSA 10 SV151 Charizard ex #183 (offer $95-$105, net ~$25-$35), Secondary = PSA 10 SV151 Charizard ex #199 SIR (offer $750-$850, net ~$80-$136). Canada profit model baked in (CA→US ship $16-$18, 13% eBay fees). Stale listing flag (>7 days). Announces to channel 824304330340827198. |
| lexi-b2b-signals | flash | 6AM + 2PM ET daily | ADDED 2026-03-06. ID: 0f99b264. Runs lexi-b2b-signals.js ingestion. Announces to Discord. |
| entity-linker | flash | 6:15AM + 2:15PM ET daily | ADDED 2026-03-06. ID: 9451ec77. Runs entity-linker.js after each ingest. Links signals → CRM entities. Announces to Discord. |
| b2-backup | zai-flash | daily 3:30am ET | ADDED 2026-03-03. Encrypted rclone backup: workspace + Postgres dump + cron config → B2 crypt:. Script: scripts/backup.sh. ID: bf8c4375 |
| contact-news-alert | gemini-3-flash | Mon 7am ET | ADDED 2026-03-03. Gemini search on all Tier 1+2 contacts for funding/news. Appends to research/leads/[id].md. Announces hot signals to Discord. Script: scripts/contact-news-alert.js |
| db-dedup-sweep | zai-flash | 1st of month 4am ET | ADDED 2026-03-03. 3-tier dedup: email+handle exact (auto-delete) + fuzzy trgm+levenshtein (flag only). Script: scripts/db-dedup-sweep.js. ID: 4266cb4b |
| daily-metrics-capture | zai-flash | 6am ET daily | ADDED 2026-03-03. Captures: agent activity (activity_log), PBN clip performance, prospect signals → daily/metrics-YYYY-MM-DD.md. LinkedIn + YouTube = STUBBED pending API/OAuth. Script: scripts/daily-metrics-capture.js |
| weekly-metrics-summary | zai-flash | Mon 7am ET | ADDED 2026-03-03. Aggregates 7 daily files. WoW comparison + anomaly detection (2x threshold). Posts to Discord 824304330340827198. Script: scripts/weekly-metrics-summary.js |
| reminder-pitch-night-mar19 | zai-flash | Mar 16 9am ET (one-shot) | ADDED 2026-03-03. Reminds Yohann to prep 60s pitch + slide for Startup Investor Drinks Mar 19. Self-disables after firing. |

### guildwood-gdpr-purge
- **Script:** `scripts/data/guildwood-gdpr-purge.js`
- **Schedule:** Daily 2:00 AM EST
- **Model:** N/A (no LLM — pure DB operation)
- **Purpose:** GDPR/CASL compliance — disqualifies guildwood_pool records not triggered within 180 days
- **Legal:** Required per General Counsel sign-off 2026-03-06 (docs/architecture/guildwood-pool-plan.md)
- **Status:** Active

## Backlog — Add When Ready

| Job | Script | Schedule | Trigger | Notes |
|-----|--------|----------|---------|-------|
| client-monitor-001 | `scripts/apify/client-monitor.js` | Mon/Wed/Fri 7AM ET | First client onboards | Requires `APIFY_API_KEY` env var. Scrapes client websites + founder X handles → Gemini signal extraction → activity_log + Discord alerts. Add Twitter handles to `scripts/apify/data/clients.json` first. |
| client-monitor-linkedin | `scripts/apify/lib/proxycurl-client.js` (integrated in client-monitor.js) | same as client-monitor-001 | Proxycurl API key obtained | Add `PROXYCURL_API_KEY` to ~/.zshrc. Fill `founders_linkedin` + `linkedin_company` fields in `scripts/apify/data/clients.json`. ~$0.50/week at 8 clients 3x/week. Get key: nubela.co/proxycurl |

## Disabled Crons
| Job | Disabled | Reason |
| vibrnt-tiktok-daily | 2026-03-05 | **PERMANENTLY DELETED** from jobs.json (was disabled since 2026-03-01 but still existed). Also cleaned senior-pm-weekly (removed TikTok performance ref) and trend-scout (removed Vibrnt fashion trend bullet). No more VIBRNT TikTok warnings. |
|---|---|---|
| content-engine | 2026-02-28 | Content generation killed per strategy shift |
| vibrnt-tiktok-daily | 2026-03-04 | Permanently removed — pipeline, media, and heartbeat check deleted |
| youtube-analytics-poller | 2026-03-02 | Created but disabled — needs YouTube OAuth first (`python3 scripts/youtube-auth.py`) |
| call-analysis-watcher | 2026-03-04 | Disabled by default — enable in jobs.json when first client onboards |

## Fleet Rules
- **Opus BANNED** from all crons
- `/reset` between major task blocks — prevents session bloat
- All crons must have `bestEffort: true` on delivery targets
- Full protocol: `_shared/reset-protocol.md`
- Cron model override location: `payload.model` inside each job in `~/.openclaw/cron/jobs.json`

### 2026-03-03 Evening Changes
| Job | Change |
|-----|--------|
| pbn-clip-watcher | timeout 600→1800s; error state cleared; delivery updated to discord channel explicitly |
| reconnection-engine | prompt rewritten — explicit "do NOT use message tools, output draft text only"; consecutiveErrors reset to 0 |

### 2026-03-04 Changes
| Job | Change |
|-----|--------|
| trend-scout | Schedule `0 7 * * *` → `0 8,22 * * *` (8 AM + 10 PM ET); brand `--brand all`; prompt updated to reflect dual-run cadence |

| pilot-intel-sweep | glm-4.7-flash | Mon 6am ET | ADDED 2026-03-04. Weekly Gemini research sweep on all 10 pilot companies. 3 searches/company (contacts, news, pain signals). Append-only to research/pilots/[slug].md. Script: scripts/pilot-intel-sweep.js. ID: 1ac10929-391c-4df6-804c-3d62753b630a |

| investor-location-sweep | gemini-3-flash | Mon 7am ET | ADDED 2026-03-04. Weekly sweep of 20-30 Tier 1 investor/PBN-guest contacts to find upcoming events (next 60 days). 2 Gemini searches per contact. Detects collision opportunities (2+ contacts at same event) → Discord alert. Outreach window = event date - 7 days. Script: scripts/investor-location-sweep.js. |

| call-analysis-watcher | zai-flash | every hour | ADDED 2026-03-04. **DISABLED BY DEFAULT.** Processes audio files in media/calls/inbox/. Uses Whisper for transcription, Gemini for extraction. Writes to activity_log + daily report + pipeline/objections-log.md + outreach_queue. Enable when first client onboards. Script: scripts/call-analysis/pipeline.js. |

### 2026-03-04 Evening Changes
| Job | Change |
|-----|--------|
| event-scanner | Schedule Mon-only → Mon+Thu. Cities expanded to 7 (added Montreal, Raleigh-Durham, NYC, Miami, Austin). Dropped trades/HVAC/real estate. New 5-dimension scoring matrix (1–25). 60-day lookback. Phases 2+3+4 scripts built and wired. |
| relationship-monitor | Re-enabled (was disabled since Feb 28) |
| reconnection-engine | Prompt cleaned again — ran successfully Mar 4 (selected Shubham Saboo). Error resolved. |
| vibrnt-tiktok-daily | PERMANENTLY REMOVED. All media (12MB), scripts, logs deleted. |
| jobs.json | Had JSON syntax error (missing comma) from sub-agent cron additions — fixed Mar 4. |

### 2026-03-04 Issues
| Job | Issue |
|-----|-------|
| daily-metrics-capture | DB error: `cp.id` column not found in pbn_clips JOIN — PBN clip performance skipped every run. Senior Coder fix needed. |
| embed-events | pgvector embeddings deferred — Gemini embedding API returning 404. Run `node scripts/embed-events.js` when resolved. |

### guildwood-gdpr-purge-001
- **Script:** `scripts/data/guildwood-gdpr-purge.js`
- **Schedule:** 2:00 AM EST daily
- **Model:** N/A (pure DB operation)
- **Purpose:** GDPR/CASL compliance — disqualifies guildwood_pool records not triggered within 180 days
- **Legal:** Required per General Counsel sign-off 2026-03-06
- **Status:** Active (added 2026-03-06)

## 2026-03-07 — Cron/SOP Fixes

**lexi-b2b-signals (cron: lexi-b2b-signals, 6AM+2PM)**
- Fixed: fake gemini-search/* URLs purged (40 rows), URL validation + AI filler filter hardened
- Commit: `8f4f88b` (local workspace repo only — scripts don't go to GitHub)
- Status: fixed and live

**signal-scout SOP (cron: signal-scout, 6AM/10AM/2PM/6PM/10PM)**
- Fixed: was using Reddit feed URL (/new.json?limit=15) as source_url
- Fix: 3 places in sops/signal-scout.md — extraction rule, DB insert template, Discord format
- Note: cron shows 3 consecutive errors — may need deeper investigation next session

**senior-pm SOP (cron: senior-pm-daily, 6:30AM)**
- Fixed: "5 Moves Today" now requires sourced leads (signals UUID, CRM, MEMORY)
- No more invented handles/companies in daily brief

**b2-backup (cron: 3:30AM)**
- Confirmed: logs show successful run despite "error" status in cron list
- Root cause: harness exit code mismatch — script exits 0 but harness marks error
- Logs confirm: workspace + DB + cron config all upload to B2 (encrypted via rclone crypt)
- Not a real failure — monitor but low priority

| content-engine-blog-001 | 2026-03-07 | **ACTIVE** — Runs twice daily at 9AM and 3PM EST. Calls `scripts/blog-draft-agent.js` to draft next backlog article → drops to `content/blog/drafts/`. Posts Discord notification when ready. Model: zai/glm-4.7-flash (runner only). |


## 2026-03-23 Updates

- **signal-scout** (`652c6195`) — Manual run triggered at 14:18 EDT. Fired clean. Surfaced 8 signals (2 x score 5, 6 x score 4). Status: OK.
- **File permission hardening applied:** `cron/jobs.json` → 600 (was open). All config files under `config/` → 600.
- **cron errors still unresolved:** signal-scout (1 prior error), senior-coder-weekly (1), senior-pm-weekly (1), pbn-content-brief (2), weekly-metrics-summary (1) — flagged, not yet investigated.
- **pbn_clips JOIN error persists** in daily-metrics-capture.js despite prior fix attempt. Needs `\d pbn_clips` schema inspection in psql to confirm actual column names.
