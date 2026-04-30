# MEMORY.md - Long-Term Memory

_Last updated: 2026-04-17 | Max: 250 lines. After every write: check `wc -l`. If >220 → move sections out. Overflow → memory/ subdomain files._

---

## ⚠️ Warm Path / Contact Research Rules (enforced — not suggestions)
- **Never assert geography, relationship, or connection without a verified source.** Check CRM, MEMORY.md, or run a search first.
- **Speculative warm paths must be flagged as "worth verifying" — never stated as facts.**
- **Basis for every warm path suggestion must be explicit:** mutual industry, confirmed event overlap, LinkedIn mutual, or direct CRM note. Not inference.
- **Incident 2026-03-26:** Hallucinated Randy Wasinger as "BC-based" to manufacture a warm path to Jim Pattison Group. Randy is Kansas City-based. CryptoSlam is a US company. No BC connection. Root cause: motivated reasoning under pressure to produce results.

## ⚠️ Content Style Rules (enforced — not suggestions)
- **No em dashes (—) in any blog or client-facing content.** Ever. They read as AI slop.
- Use periods, commas, colons, or hyphens instead.
- Short sentences. Founder voice. Not copywriter voice.
- **No "B2B" in web copy or content.** Drop it entirely. Replaced with: "founders", "operators", "companies where the founder is the brand".
- **Tooltips on ~50% of acronym mentions.** First mention or most visible placement gets the tooltip. Format: `<span class="tip" data-tip="Full definition here">ACRONYM</span>`
- Pre-commit hook blocks commits with em dashes: `~/Desktop/aloomii/.git/hooks/pre-commit`
- Auto-strip available: `bash ~/Desktop/aloomii/scripts/strip-em-dashes.sh`
- Rule enforced in `scripts/aci/profiles/1.json` → `style_rules` + `forbidden_punctuation`

## ⚠️ Write Protocol
**Every fact, decision, preference = written immediately. No mental notes.**
- Tech stack, paths, configs → `memory/tech-stack.md`
- Decisions with rationale → `memory/decisions-log.md`
- Cron fleet status → `memory/cron-fleet.md`
- Identity/review ops → `memory/identity-ops.md`
- This file = index + people + business facts only

---

## People

- **Yohann + Jenny** — Co-founders. Hamilton, Ontario (EST). Yohann on Discord (@yohann888, ID: 377635645243523072). Jenny on WhatsApp/Discord.
- **Preferences:** Direct, slight humor. Markdown + tables. No permission needed for internal work. Always ask before external comms.
- **Yohann interests:** Kids, family, Aloomii, Magic: The Gathering, AI agents
- **Reddit:** Weak-Conflict-1017

---

## Businesses

### Aloomii
- **Name origin:** Named after the two cats — Aloo and Mittens. Disarming, human, memorable.
- **What:** AI Sales Intelligence System — replaces SDR, upgrades AE
- **Pricing:** DWY $2,000–3,500/mo + 5–10% performance layer
- **ICP:** Founders $0–5M ARR, no dedicated sales team, relationship-intensive (insurance brokerages, financial advisors, professional services).
- **Website:** aloomii.com (Cloudflare Pages, auto-deployed via GitHub Actions)
- **Deploy:** `git add -A && git commit -m "msg" && git push origin main` ← ONLY correct method
- **⚠️ NEVER run `wrangler pages deploy` directly** — overwrites live site with local files (Incident 2026-03-17: 13 blog articles wiped).
- **Repo:** https://github.com/yohann888/aloomii | Local: `~/Desktop/aloomii`
- **Equity held:** 3% of CryptoSlam
- **Fleet:** 15 agents running 24/7 on self-hosted infra
- **Stage:** Pre-seed. Raising now.
_Intro scripts: `memory/brand-scripts.md`_

### Aloomii Portal (app.aloomii.com)
- **What:** Gated web portal for the Aloomii Playbook ($99 digital product). Three editions: Founder / Solo / Operator.
- **Stack:** Next.js (App Router) + Neon Postgres (separate DB) + Clerk auth + Gumroad + Cloudflare Pages
- **Deploy:** `npm run build && npx wrangler deploy` from `~/Desktop/aloomii-portal/`
- **⚠️ CRITICAL FIX (2026-04-27):** Never set `NEXT_PUBLIC_CLERK_PROXY_URL=https://aloomii.com/__clerk`. There is no Clerk proxy worker on aloomii.com (it's the marketing site on CF Pages). Setting this makes Clerk JS fail with CORS errors and `failed_to_load_clerk_js`. Fix: remove the env var from `.env.local`, GitHub Actions workflow, AND `wrangler secret delete NEXT_PUBLIC_CLERK_PROXY_URL`. Use Clerk's hosted CDN directly. Commit: `56d2958`.
- **⚠️ CRITICAL FIX (2026-04-20):** `ClerkProvider` crashes on CF Workers edge runtime with `TypeError: Cannot read properties of null (reading 'useContext')`. Root cause: ClerkProvider is SSR'd on the server where useContext is null. Fix: wrap in a `'use client'` component using `dynamic(() => import('@/components/Providers'), { ssr: false })` — see `components/ClientProviders.tsx`. Never import Providers directly in layout.tsx. Commit: `b0a7a71`.
- **Spec:** `docs/portal-deploy-v1.md` + `vibrntvault/Portal/portal-deploy-v1.md`
- **North star:** Weekly active buyers / total buyers at day 30. Target 40-50%.
- **Why Neon:** Cloudflare Pages runs on V8 Isolates (no raw TCP). Neon speaks WebSocket. Aloomii CRM stays on self-hosted Postgres 18.
- **Neon DB:** `aloomii_portal` on Neon. Connection: pooler endpoint, SSL required.
- **Migration:** `infra/db/migrations/026_portal_schema.sql`
- **DB objects:** 9 tables, 2 views, seed data (topic 'ai' + 3 products)
- **Spec:** `docs/portal-deploy-v1.md`, `AloomiiVault/Operations/Portal/`
- **Clerk App ID:** `app_3CUmc71wNNCPk8g2e31ZIqxhRFw`
- **Pending from Yohann:** Gumroad product IDs (3x editions), Clerk secret key
- **Pending build:** Next.js app, Clerk webhooks, Gumroad webhooks, content sync script, claim UI

### Lexi (Consumer Intelligence Platform)
- Targets: World Cup 2026 tickets, BTS Toronto, MTG Alpha PSA 10. Active. Full detail: `memory/tech-stack.md`

### Events Database
- PostgreSQL `events` table. Agents: event-scanner. Full detail: `memory/tech-stack.md`

### Pale Blue Nexus (PBN)
- **What:** World-class podcast (live 2026-03-01)
- **Links:** https://palebluenexus.com | YouTube: @palebluenexus
- **Jim Rogers episode:** https://youtu.be/t3dDHRRZyHk

### Vibrnt
- **What:** Mood-based apparel brand. Uses AI to extract mood signals from Reddit to drive shirt designs.
- **Brand Intelligence:** Dominant high-potential signals: `done_with_nonsense`, `tired_and_unhinged`, `low_key_witchy`, `lost_my_no`, `feral_joy`, `proud_of_small_wins`, `cosmic_nonchalance`, `midlife_existential_dread`, `adulting_dread`, `solitary_ascension`, `discomfort_with_peace`, `life_lag_anxiety`.
- **Yield:** ~60-80% hit rate for high-potential signals per batch (last run 2026-04-29 16:55).
- **Trends (2026-04-29):** High-punch signals (8+) continue for `done_with_nonsense` (15+ instances today, Punch: 7-9), `adulting_dread` (9), `tired_and_unhinged` (8+), and `quietly_triumphant` (9). **09:55 AM run:** added `reboot_jitters` (9) and 3x `done_with_nonsense` / `tired_and_unhinged` (7-9). **08:36 AM run:** added `fuck_this_week` (8), `nostalgic_and_soft` (8), `tired_and_unhinged` (8, 9), and `done_with_nonsense` (7). **08:10 AM run:** added `tired_and_unhinged` (8), `done_with_nonsense` (7-9), `nostalgic_and_soft` (7), and `cosmic_nonchalance` (7). **06:20 AM run:** added `low_key_witchy` (8) and 2x `done_with_nonsense` (8, 9). Focus remains on performative productivity exhaustion and motherhood liberation. **11:05 AM run:** added `quietly_triumphant` (8), `done_with_nonsense` (8), and `the_fringe_friend` (8) — social exclusion and expertise validation are rising themes. Total signals today: 180+. **12:30 PM run:** Added `cosmic_nonchalance` (10/10 - "entire personality"), `overwhelming_love` (9), `tired_and_unhinged` (9), `done_with_nonsense` (9), and `feral_mom` (9). **12:55 PM run:** Added `solitary_ascension` (9), `discomfort_with_peace` (9), `life_lag_anxiety` (9), and `done_with_nonsense` (9). **04:50 PM run (Batch 18):** Added `feral_joy` (8), `parental_anxiety` (9), and more `done_with_nonsense` / `tired_and_unhinged` (8). **04:55 PM run (Batch 19):** Added `done_with_nonsense` (high) and `tired_and_unhinged` (high). **05:30 PM run (Batch 24):** Added `nostalgic_and_soft` (high), `achieved_and_adrift` (high), and more `tired_and_unhinged` (high). Total batch yield: 4/5 items. `done_with_nonsense` and `tired_and_unhinged` continue to dominate rising moods (85x+ daily rate). **08:34 PM run (Batch 25):** Added `quietly_triumphant` (high), `done_with_nonsense` (high), and `tired_and_unhinged` (high). Yield: 4/5 items.
- **Trends (2026-04-28):** Extreme dominance of `tired_and_unhinged`, `low_key_witchy`, and `feral_mom` (30+ high-punch signals today). New/Rising: `midlife_existential_dread` (9), `petty_victory` (9), `moral_unease` (9), `regretful_realization` (7), `quietly_triumphant` (1), and `done_with_nonsense` (1).

---

## Operational Observations (2026-04-29)
- **Reddit Signal Backlog:** 8,680 unprocessed `mood` items (Vibrnt) and 3,702 unprocessed `pain` items (Aloomii/Sprint).
- **Vibrnt Mood Flow:** Extremely high density of `done_with_nonsense` and `tired_and_unhinged` (80+ signals today). Validates current shirt strategy.

---

## Key Contacts (CRM Highlights)

- **Randy Wasinger** — Tier 1. CryptoSlam Co-CEO. Warm: worked 4 yrs. Status: 2026-03-24 proposed commission deal, TBD. **Call, never email**.
- **Austin Armstrong** — Tier 1. Syllaby CEO. PBN guest confirmed. 4M+ followers.
- **Boxmining (Michael Gu)** — Tier 1. Crypto podcaster. PBN guest + prospect.
- **Kimia Hamidi** — Tier 1. NationGraph Co-founder. PBN guest + prospect.
- **Jack Couch** — Tier 1. Sophtron prospect. Warm via Jay Rosenzweig.
- **Vincent Pronesti** — Tier 1. Westland Insurance. Warm: friend. Status: Hot buying signal, waiting on task list.
- **Marcus Brotman** — Tier 1. Launch.co angel. Seed target.
- **Nectarios Economakis** — Tier 1. Amiral Ventures.
- **Steph Nass** — Tier 2. OpenVC. PBN guest/co-marketing.
- **Robleh Jama** — Tier 1. Boom Video.
- **David Bailey** — Tier 1. Bitcoin Magazine Chairman. Elite PBN guest.
- **Tyler Evans** — Tier 2. Nakamoto. Warm path to David Bailey.
- **Mark Jeffrey** — Tier 2. Bittensor Fund. PBN guest.
- **Adam Draper** — Tier 1. Boost VC. PBN + seed target. Warm path via Marcus Brotman.
- **James Camp** — Tier 2. apfx.ai. PBN guest + referral.
- **Josh** — Tier 1. HOT prospect. Intro via Absi.
- **Matt Luongo** — Tier 1. Thesis/Mezo. PBN guest candidate.
- **Jeet Raut** — Tier 2. PiSquared.
- **Abdallah Absi** — Tier 1. Village.do co-founder. Coupon GVN300OFF.
- **Jim Rogers** — Tier 1. PBN guest (done).
- **Krishiv Thakuria** — Tier 2. MIT. PBN guest candidate.
- **Jake Brukhman** — Tier 1. CoinFund. Investor/PBN prospect.
- **Daniel Foch** — Tier 1. Habistat. RE influencer/OpenClaw user. Referral/PBN target.
- **Isabel Foxen Duke** — DO NOT approach until after Dubai/HK trip.
- **Colin Gardiner** — Tier 1. Wannabe Angels podcast swap.

---

## Founding Partner Pilot Roster (updated 2026-04-06 — DB is SSoT)
**Active (7):** Westland Insurance · BiS · SpiceNet · Sats Terminal · Arch Network · Stacks · XFounders
**Target (3):** Launch.co · Mastercard · Visa

## Village.do Partnership
- **Structure:** 15% rev share + free API data. Aloomii onboards clients, Village white-labeled. Gamma deck: https://gamma.app/docs/j9ezwdhsbwui5rq

## Active Pipeline
- **Spicenet** (Matthew McConnell) — warm via Alex Radu. core@spicenet.io
- **Danial Hasan** — warm prospect. danial@remedys.ai
- **Afore x Gamma fund** — afore.vc/gamma.

---

## Pending / Blocked
- [ ] **SEMrush ranking** — Audit needed.
- [ ] **Exploding Topics** — For Aloomii positioning only.
- [ ] Village.do LinkedIn export — Part 2 pending.
- [ ] Azure AD (CR-J12) — BACKLOGGED.
- [x] DB migration (export-metrics.js → DB) + signal idempotency fix. Done 2026-04-25. See `infra/db/migrations/035_signal_idempotency_metrics_native.sql`.
- [ ] Kit newsletter Form ID.

---

## Call Analysis Pipeline
- Scripts: `scripts/call-analysis/` — transcribe (Whisper local) → extract (Sonnet 4.6) → DB → outputs
- Google Meet integration: run `gog auth manage`
- Extraction model: Sonnet 4.6 — $0.009/call

## Signal Scout ICP Config
- **Config file:** `config/signal-scout-icps.yaml`
- **Current state (2026-03-31):** Sprint ON, AI Workforce OFF, Deal Flow OFF.
- Switch by asking Leo ("turn on AI Workforce").

## ICP (Deal Flow Intelligence)
- Config key: `deal_flow` | Status: Offer built. No client yet.
- **Who:** Seed/Series A VCs ($20M-$500M AUM). Pain: Associates spend 40+ hrs manual sourcing.
- **Offer:** Deep Researcher dossier on top 5 deals/week. Price: $8K-$15K/mo.
- Client config: `config/deal-flow-thesis.yaml`

## Key Infrastructure (quick ref)
_Full detail: `memory/tech-stack.md`_
- **DB:** `postgresql://superhana@localhost:5432/aloomii` | psql: `/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql`
- **Discord:** channel `824304330340827198` (#general)
- **Cloudflare KV:** config moved to `TOOLS.md`
- **GitHub:** `github.com/yohann888/aloomii.git`
- **Web search:** always `bash scripts/gemini-search.sh "query"`

---

## Cron Fleet (quick ref)
_Full detail: `memory/cron-fleet.md`_
Active: signal-scout, village-enrich (M2.5-Lightning), senior-pm-daily/weekly (gemini-3.1-pro), reconnection-engine (gemini-3-flash), nightly-audit (gemini-3-flash), senior-coder-weekly (gpt-5.4), spend-alert (zai-flash), metrics-sync (zai-flash), junior-coder (zai), documentation-agent (zai), event-scanner (gemini-flash)
Re-enabled: content-engine (2026-04-29 — daily LinkedIn drafts cron added)
Disabled: vibrnt-daily, vibrnt-daily-evening, relationship-monitor (2026-04-21)

## Backlog — GTM Growth Execution
- [ ] **Phase 2 — X Launch** — Hooks + threads ready in `sops/growth/x-viral-launch-v2.md`.
- [ ] **Phase 3 — Influencer + UGC** — SOPs: `sops/growth/influencer-playbook-v2.md`, `ugc-farm-v2.md`.

## Backlog — 5-Layer Moat Build Queue
- [ ] **L3 — Outcome logging** DB table + CLI script.
- [ ] **L1+L4 — Signal → Touchpoint automation**
- [ ] **L2 — Client voice profiles**
- [ ] **L4 — Relationship health scores**
- [ ] **L5 — Ops runbooks**

## The Table (formerly The Sprint) — Positioning Update (2026-03-24)
**⚠️ It is "The Table" everywhere. The config key `sprint:` in signal-scout-icps.yaml is internal-only.**
- **Brand pivot:** The Sprint → The Table by Aloomii. URL: /table
- **Offer:** $3,000/mo, 90-day, 3 seats.
- **Positioning:** AI runs your GTM. Judgment decides where it points.

## Command Center (added 2026-04-06)
- **Local:** `cd ~/Desktop/aloomii && node command/serve-local.js` → localhost:3200
- **Production deploy:** BACKLOGGED. Cloudflare tunnel + Access to `command.aloomii.com`. Do NOT deploy until local iteration is complete. Steps in `command/specs/command-center-v2-upgrades.md` (Phase C).
- **Built:** 7 phases + 2 bridge waves + v2 upgrades (signals intelligence, learn loop, draft templates, one-click outreach). All live on local.
- **Known issue:** CRM contacts may not render on first load in Safari — re-renders on section switch.