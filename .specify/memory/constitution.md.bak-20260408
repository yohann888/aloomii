# Aloomii — Project Constitution

_The governing document for all AI-assisted development on this codebase. Every agent, every session, every feature spec must respect these rules. They exist because violations have caused real production incidents._

---

## 1. Project Identity

**Aloomii** is a B2B founder GTM service. The codebase powers:

1. **aloomii.com** — Public marketing site + blog (Cloudflare Pages, static HTML + Astro blog)
2. **Aloomii OS Dashboard** — Live AI agent fleet metrics + sales page (`aloomii-os.html`)
3. **Backend scripts + cron fleet** — Node.js agents in `~/.openclaw/workspace/scripts/`
4. **PostgreSQL CRM** — Master data store at `postgresql://superhana@localhost:5432/aloomii`
5. **Signal API** — Express server on port 3001
6. **Client Dashboard API** — Express server on port 3100

**Stack:** Node.js v25, PostgreSQL 18 (TimescaleDB 2.25.1, pgvector 0.8.1), Cloudflare Pages, GitHub Actions, Astro (blog), plain HTML/CSS/JS (frontend), zsh (macOS arm64).

---

## 2. Immutable Deployment Rules

### ⚠️ NEVER run `wrangler pages deploy` directly

This is a hard rule. Running wrangler directly overwrites the live site with only local files — **this destroyed 13 blog articles on 2026-03-17**.

**The only correct deploy path:**
```bash
git add -A && git commit -m "message" && git push origin main
```
GitHub Actions handles the rest. Changes are live in ~60 seconds.

### ⚠️ NEVER commit em dashes (—) to blog or client-facing content

Em dashes read as AI slop. Use periods, commas, colons, or hyphens instead. A pre-commit hook enforces this at `~/Desktop/aloomii/.git/hooks/pre-commit`.

### Before any deploy: verify the blog folder
```bash
ls ~/Desktop/aloomii/blog/
```
Confirm blog articles exist before pushing. A deploy without the blog folder empties the blog.

---

## 3. Database Rules

**PostgreSQL is the Single Source of Truth.** If any file contradicts the DB, the DB wins.

- **Connection:** `postgresql://superhana@localhost:5432/aloomii`
- **psql path:** `/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql`
- **Never use `psql <` for custom format dumps.** Use `pg_restore --disable-triggers --no-privileges --no-owner` for `.dump` files.
- **Hypertable caution:** `activity_log` and `prospect_signals` are TimescaleDB hypertables. Schema changes require special handling — standard `ALTER TABLE` workflows may fail.
- **Migrations are numbered:** `infra/db/migrations/001_*.sql` … `007_*.sql`. Always create a new numbered migration — never alter existing ones.
- **pgvector:** embeddings are 768-dim (Google embedding-001). HNSW index: m=16, ef=64, `vector_ip_ops`. Always validate `vector_dims(embedding) = 768` before inserting.

### Key Tables
| Table | Purpose |
|---|---|
| `contacts` | Master contact CRM |
| `accounts` | Company records |
| `opportunities` | Deal pipeline |
| `activity_log` | TimescaleDB hypertable — event log |
| `client_pilots` | Active client roster (SSoT) |
| `entities` | Intent graph nodes |
| `signals` | Buying signal records |
| `entity_signals` | M2M junction |

---

## 4. Code Style & Architecture

### General
- **Language:** JavaScript (Node.js v25) for all scripts. Python only for `infra/` migration utilities.
- **Modules:** CommonJS (`require`) by default. ESM (`.mjs`) only when explicitly needed (e.g., `enrich.mjs`).
- **Error handling:** Every script that touches the DB or an external API must have a `try/catch` with a meaningful error log and a non-zero exit code on failure.
- **No global state in cron scripts.** Each run is stateless; state lives in the DB.

### Naming Conventions
- Scripts: `kebab-case.js`
- DB tables: `snake_case`
- Environment variables: `UPPER_SNAKE_CASE`
- Functions: `camelCase`

### Forbidden Patterns
- `rm -rf` on any directory without explicit human approval
- Hardcoded API keys in source files — use `.env` (never committed)
- `console.log` with PII (names, emails, phone numbers) in production scripts
- Direct `wrangler pages deploy` (see Section 2)
- `web_search` tool — not configured. Use `bash scripts/gemini-search.sh "query"` instead.

---

## 5. Content & Brand Rules

### Forbidden words/phrases (never use in any output)
- Em dashes (—)
- "leverage", "synergy", "disrupt", "game-changer", "revolutionize", "cutting-edge", "unlock", "seamlessly", "dive into", "in today's landscape", "Let's discuss!"
- "B2B" in web copy or blog content — use "founders", "operators", or specific industry names

### Required in blog/marketing content
- Short sentences. Founder voice. If a paragraph can be a sentence, make it a sentence.
- Specific numbers, specific stories, specific results.
- Tooltips on ~50% of acronym first mentions (GTM, ICP, MRR, SDR, PBN). Not 100% (condescending), not 0% (assumes too much).
- Format: `<span class="tip" data-tip="Full definition">ACRONYM</span>`

### Brand anchor: naming origin
"Aloomii is named after our two cats — Aloo and Mittens. The company is slightly more productive than they are." Use in every About section and podcast intro.

### Product naming (enforced 2026-03-24)
- The flagship offer is **"The Table by Aloomii"** everywhere consumer-facing.
- Internal config key `sprint:` in `signal-scout-icps.yaml` stays as-is (internal only).
- Never use "The Sprint" in client comms, website copy, or social content.

---

## 6. Frontend Rules (aloomii.com)

### Site structure
- **Root:** `~/Desktop/aloomii/` — this is the ONLY deployment source
- **Blog:** `blog-astro/` (Astro project) → builds to `~/Desktop/aloomii/blog/`
- **Dashboard:** `aloomii-os.html` — password-gated, dark theme
- **Blog deploy:** `scripts/deploy-blog.sh` (builds Astro → copies → git push)

### Design system
- **Homepage font:** Inter (Google Fonts)
- **Dashboard font:** Space Grotesk + Space Mono
- **Primary teal:** `#009e96`
- **Background (dark sections):** `#0a0a0a`
- **Body text:** `#444444` (light), `#f0f0f0` (dark)

### Dashboard data paths
- `./data/metrics.json` — agent fleet metrics (internal)
- `/public_metrics.json` — pipeline + economics (public-facing)
- NEVER expose PII in either file. Aggregate metrics only. Zero team size disclosure.

### Nav changes: update ALL pages
When adding a nav link, update: `index.html`, `aloomii-os.html`, `blog/index.html` (both desktop `nav-links` and mobile `mobile-menu` on every page).

### Unicorn Studio hero
- Project ID: `ZU1wuWl1J4Sp9Tl2q1mr`
- Only works over HTTP/HTTPS (not `file://`)
- Switches desktop (1440x900) ↔ mobile (390x844) at 768px

---

## 7. Agent & Cron Fleet

All cron scripts run under OpenClaw's cron system. Located in `~/.openclaw/workspace/scripts/`.

### Active crons (reference only — see `memory/cron-fleet.md` for full detail)
`signal-scout`, `village-enrich`, `senior-pm-daily`, `senior-pm-weekly`, `reconnection-engine`, `nightly-audit`, `relationship-monitor`, `senior-coder-weekly`, `spend-alert`, `metrics-sync`, `junior-coder`, `documentation-agent`, `event-scanner`

### Rate limit protection rules (enforced after $118/day Gemini incident)
1. **Heavy tasks go to sub-agents** — never run rapid sequential API calls in the main session
2. **Gemini Flash for loops** — any loop calling Gemini > 5 times must use `gemini-3-flash-preview`, not Pro
3. **Sub-agent model default:** `opencode/minimax-m2.5-free` (zero cost for implementation loops)
4. **Sonnet for extraction** — call analysis, nuanced judgment tasks only

### Model selection guide
| Task | Model |
|---|---|
| Single high-value research | `gemini-3-pro` |
| Web research loops | `gemini-3-flash` via `scripts/gemini-search.sh` |
| Implementation loops | `minimax-m2.5-free` (MiniMax) |
| Extraction, nuanced judgment | `claude-sonnet-4-6` |
| DB/JSON operations | `zai-flash` |

---

## 8. Security Rules

- **No PII in logs.** Strip names and emails from any `console.log` in production.
- **Signal API auth:** `X-API-Key` header → `api_keys` table. LRU cache (max 500, 5min TTL for valid, 60s for invalid).
- **Rate limiter key:** `req.ip` (not API key header). Trust proxy enabled: `app.set('trust proxy', 1)`.
- **File path sanitization:** Use `path.basename()` + `/[^a-zA-Z0-9_-]/g` before constructing any file path from user input.
- **Dashboard password gate:** sessionStorage-based (`alos_auth`). Never remove.
- **`.env` is never committed.** API keys live in `.env` only.
- **Sensitive creds in 1Password** (Backblaze crypt password, etc.).

---

## 9. API Integrations (quick reference)

| Service | Auth | Notes |
|---|---|---|
| Village.do | `VILLAGE_API_KEY` env, `VILLAGE_USER_TOKEN` for user-scoped | Regenerate token annually |
| Blotato | `blotato-api-key` header | Base URL: `https://backend.blotato.com/v2` |
| Gamma | `X-API-KEY` header | 48 credits/deck generation |
| Buffer | Bearer token | Verify channel IDs via `GET /profiles.json` first |
| ConvertKit (Kit) | `X-Kit-Api-Key` header | Base URL: `https://api.kit.com/v4` |
| Cloudflare KV | Auth key `aloomii_metrics_1221` | Namespace: `ALOOMII_METRICS` |
| YouTube | OAuth (not yet run) | `scripts/youtube-auth.py` for one-time setup |

---

## 10. Warm Path & Contact Research Rules

Enforced after a hallucinated warm path incident (2026-03-26):

- **Never assert geography, relationship, or connection without a verified source.** Check CRM, MEMORY.md, or run a search first.
- **Speculative warm paths must be flagged as "worth verifying" — never stated as facts.**
- **Basis for every warm path suggestion must be explicit:** mutual industry, confirmed event overlap, LinkedIn mutual, or direct CRM note. Not inference.

---

## 11. The Prime Directive

> Every time a lesson is learned — a deploy breaks, an API fails, a pattern causes a bug — it gets written down immediately. Not in a mental note. In a file.

**Route:** tech facts → `memory/tech-stack.md` | decisions → `memory/decisions-log.md` | business facts → `MEMORY.md`

**Document or it didn't happen.**
