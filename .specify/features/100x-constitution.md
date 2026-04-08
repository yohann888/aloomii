# 100x Build: SpecKit Constitution
_Version: 1.0 | Date: 2026-04-03_

## Project Overview
Building 6 intelligence systems on top of the existing Aloomii stack:
Build 1: Relationship Trajectory Prediction
Build 2: Network Graph Intelligence
Build 3: Predictive Signal Detection
Build 4: Cross-Client Pattern Matching
Build 5: Autonomous Research Cycles (no Apify — use gemini-search.sh + grok)
Build 7: Semantic Search (pgvector — already installed)
Build 6 (Voice Cloning): DEFERRED to Q3 2026+

## Stack (no n8n — all OpenClaw crons)
- Runtime: OpenClaw crons (`~/.openclaw/cron/jobs.json`)
- DB: PostgreSQL 18 at `postgresql://superhana@localhost:5432/aloomii`
- psql: `/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql`
- Local model: `ollama/gemma4:31b` at `http://10.211.55.2:11434`
- Scripts: `~/Desktop/aloomii/scripts/`
- Workspace: `~/.openclaw/workspace/`

## Critical Tables (existing — never modify structure)
- `contacts` — UUID PK, has rhs_current/velocity/predicted/decay columns (added 2026-04-03)
- `signals` — UUID PK, main signal store from signal-scout
- `activity_log` — TimescaleDB hypertable, time-series
- `pbn_clip_embeddings` — reference implementation for vector(768) pattern

## New Tables (100x build — own these)
- `signal_patterns` — classified patterns from signals
- `contact_embeddings` — vector(768) per contact
- `contact_connections` — network graph edges
- `signal_baselines` — company monitoring baselines
- `relationship_history` — RHS time-series for velocity calc
- `cross_client_patterns` — monthly aggregation (populate when 3+ clients)

## Protected Crons (NEVER modify without explicit Yohann approval)
- `signal-scout` — the revenue engine
- `senior-pm-daily` — the daily briefing

## Default Model Rules
- Spec/plan/tasks: gemma4:31b (free) or minimax/MiniMax-M2.7-Lightning (strategic)
- Implementation (OpenCode): anthropic/claude-sonnet-4-6
- All new cron runtime: ollama/gemma4:31b (default, $0)
- Exception: web research calls use google/gemini-3-flash

## Cost Cap
- New builds combined: <$5/mo additional
- Apify: DO NOT use — replace with gemini-search.sh and grok-4-2-fast
- No new cloud model dependencies without explicit approval

## Schema Rules
- All migrations are ADDITIVE only (new columns/tables)
- Never DROP or RENAME existing columns
- Every new table has UUID PK with gen_random_uuid()
- Every migration needs a rollback comment
- FK types must match: contacts.id is UUID, signals.id is UUID

## Deployment
- Scripts: `~/Desktop/aloomii/scripts/100x/`
- New crons: add to `~/.openclaw/cron/jobs.json` via `openclaw cron` or direct JSON edit
- Output: Discord #general channel (channel:824304330340827198)
- Each build ships one atomic cron at a time
