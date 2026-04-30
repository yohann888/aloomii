| 2026-03-19 | CONTACTS.yaml Retirement | PostgreSQL is now the sole master record for CRM contacts. YAML is drift-prone and retired as an archive-only backup. |
| 2026-03-19 | Service Expansion | Added OpenClaw / NemoClaw Setup & Configuration to Aloomii's core service offerings. |
| 2026-03-19 | BlockSkunk Pivot | Michael Santore (BlockSkunk) deal closed as referral-commission only; archived from active cash pipeline. |

# Decisions Log
_Load via memory_search. Append only — newest at bottom._

- **Image model override:** Switch from Anthropic Opus to `xai/grok-4-1-fast-reasoning` or Gemini. Anthropic credits exhausted.

## 2026-03-05

**OpenClaw billing flag: manual clear required after Anthropic credit failure**
Rationale: When Anthropic returns a billing error, OpenClaw writes a `disabledUntil` timestamp (5h cooldown) to `~/.openclaw/agents/main/agent/auth-profiles.json`. Gateway restart alone does NOT clear it — the file persists across restarts. Fix: manually zero out `errorCount`, `failureCounts`, `lastFailureAt`, `disabledUntil`, `disabledReason` in the `usageStats.anthropic:default` block, then run `openclaw secrets reload`.

**Anthropic keeps re-flagging despite cleared flag**
Observed: the API is still hard-rejecting with `billing` on every call, re-setting the 5h cooldown each time. Root cause: Anthropic account balance is genuinely depleted. Flag clearing is a band-aid — underlying fix is topping up at console.anthropic.com. OpenAI added as interim fallback.

**OpenAI added as model provider (2026-03-05)**
Rationale: Anthropic credits depleted + Gemini Pro hitting rate limits simultaneously caused full outage. OpenAI GPT-4o added as additional fallback to prevent single-provider dependency. Aliases: `gpt4o` → openai/gpt-4o, `gpt4o-mini` → openai/gpt-4o-mini.

---

## 2026-03-06 (morning session)


**Gemini embedding provider switched from OpenAI → Gemini**
Rationale: OpenAI embeddings quota exhausted (429). Gemini key already in stack, zero extra cost. Set `agents.defaults.memorySearch.provider = "gemini"`, `model = "gemini-embedding-001"` in `~/.openclaw/openclaw.json`. Memory search now online and running on Gemini.

**Gemini model names updated in config/models.json**
Rationale: `gemini-2.5-flash` and `gemini-3-pro-preview` were outdated. `gemini-3-pro-preview` deprecated March 9 (3 days away). Updated `fast` task to `gemini-3-flash-preview`, added `pro` task as `gemini-3.1-pro-preview`.

**Rate limit prevention rules added to HEARTBEAT.md (2026-03-06 9:30AM)**
Rationale: March 5 session burned $118/79M tokens — main session accumulated context all day while testing, hit Gemini's 1M token/min cap. Rules added: (1) heavy tasks → sub-agents always, (2) context reset at 50% not 70%, (3) Gemini Flash for loops >5 calls, (4) billing alerts >$15/day require mandatory investigation. Sub-agents are cost isolation, not just parallelism.

## 2026-03-06

**Lexi brand approved for Marketplace Truth Layer**
Rationale: Needed a name that felt like high-trust institutional standard with Aloomii soul. Four options presented (Veriflow, Lexi, Omniscant, TrueNorth). Yohann chose Lexi for the consumer/Discord layer. Veriflow reserved for the B2B API/exit vehicle. Sub-brands: Lexi Watchtower (discovery), Lexi Lens (Vision auditor), Lexi Alpha (gated signal service).

**ITIL change management rollout approved with mandatory TEST gates**
Rationale: Yohann approved phases 1–4 on condition that each phase is tested before the next begins. 15-minute sign-off gaps enforced between phases. Mandatory Backblaze backup required before CR-001 kicks off. Phases: CR-001 (eBay API) → TEST-01 → CR-002 (Lexi Lens) → TEST-02 → CR-003 (Alpha) → CR-004 (Resale Drafts) → AUDIT.

**Marketplace sniper scan frequency throttled from 15m → 2h**
Rationale: 15-min cadence was hitting $10/day budget cap by 6 AM and flooding Discord with scan summaries. 2h is right cadence for a monitoring tool (not a real-time trading algo). Approved by Yohann.

**Scan architecture: floor validators vs. deal source**
Rationale: Gametime/StubHub/SeatGeek/TCGplayer establish the Market Floor (truth). eBay is the Deal Source (unmanaged marketplace = human errors, typos, off-peak auctions). Core moat: buy where the gap is widest. eBay is where True Alpha exists.

---

## 2026-03-02

**Village strategy: seed with Yohann's network first, then scale to clients**
Rationale: Village API creates isolated user profiles. Yohann's 35K LinkedIn connections live in the web app, not the API. Decision: export LinkedIn connections → push via `POST /v1/user/paths` → API user gains full graph. Then Aloomii clients add their networks = compounding moat. Alternative (use Village web app only) rejected — no automation, no CRM integration.

**Signal Scout dedup: seen-handles.txt instead of loading full signals.md**
Rationale: signals.md was growing every run and loading it was causing timeout (180s limit hit). A flat handle index saves ~13KB per run. Implemented: `pipeline/seen-handles.txt`.

**PBN Clip Coach: build custom Gemini coach, not rely on Blotato Viral Coach**
Rationale: Blotato Viral Coach has no API — UI only. Custom Gemini 2.5 Flash coach with 7-dimension scoring framework gives full control, brand-specific prompt, and compounding pattern feedback. Cost: ~$0.0004/clip.

**Clip Coach optimization: 3 frames @ 480px (not 5 @ 720p)**
Rationale: Frames 1s and 2s are visually redundant with 0s for hook analysis. 480px is sufficient for visual context. Saves ~600 tokens (~39% reduction) with no quality loss (7.1 vs 7.4 score variance = normal LLM variation).

**YouTube API: use PBN Google account, not personal**
Rationale: YouTube Analytics data is tied to the channel owner account. PBN YouTube channel = PBN Google account. Gemini API billing is separate from Google account subscription.

**context/roadmap.md = canonical roadmap (not root ROADMAP.md)**
Rationale: Senior PM reads and writes `context/roadmap.md` daily. Root ROADMAP.md was created as a redundant file — context/roadmap.md is the single source of truth. Synced 2026-03-02.

**gemini-2.0-flash is deprecated — use gemini-2.5-flash**
Rationale: API returned 404 "no longer available to new users." All scripts updated to gemini-2.5-flash.

**Data Flywheel schema: separate client_pilots from accounts table (2026-03-03)**
Rationale: `accounts` = prospect companies. `client_pilots` = Aloomii's paying clients. Mixing them would corrupt CRM data (prospects vs customers). Separate table with `icp_json`, `signal_config_json`, `compliance_flags` gives clean per-client agent configuration.

**prospect_signals as hypertable, not regular table (2026-03-03)**
Rationale: Signal volume scales with client count (50/day × N clients). TimescaleDB gives automatic partitioning, compression, and continuous aggregates for free. Trade-off: composite PK required (id, captured_at), no global unique constraints, FKs from other tables must be logical (unenforced). Acceptable — dedup handled at app layer via signal_hash index.

**reply_intent as training label, not just logging (2026-03-03)**
Rationale: Every reply classification (interested/booked/not_now/objection) is a labeled data point for template ranking. After ~200 labels per vertical, can rank templates by conversion rate. This is the moat — no competitor has this dataset because it requires both the execution system AND closed-loop outcome capture.

**Pricing: hold at $3,500 founding partner rate, plan raise to $5-8K post-pilot (2026-03-03)**
Rationale: GTM Engineer comparison ($180-250K/yr hire) validates higher pricing. Founding partner rate is a deliberate loss-leader to get first 3 logos + outcome data. Once call analysis pipeline is live and 30 days of client data exists, pricing conversation changes. $5-8K/mo is defensible with full capability demo.

**Sales call analysis: local Whisper only, no cloud audio (2026-03-03)**
Rationale: PIPEDA compliance for insurance/financial clients requires data residency in Canada. Cloud transcription (AWS Transcribe, Deepgram) would transfer client call audio outside client environment. Local Whisper (medium model, Mac Mini) handles ~30-min call in ~2-3 min. Acceptable latency for non-real-time use case.

**CIX Summit: skip (2026-03-03)**
Rationale: Rejected for comp ticket. Not worth paying given Marcus Brotman (Thu 12PM) + Metal onboarding (Thu 2PM) are higher-leverage this week. CIX is March 25 — sufficient notice to reconsider if landscape changes.

**Village API: parked until Abdallah call (2026-03-03 evening)**
Rationale: Partner API and personal Village account are architecturally separate. No way to bridge via API alone. Yohann has direct line to Abdallah Absi (co-founder). Fastest fix = 1 conversation. Until then, Yohann uses Village UI directly (already works — 2,634 contacts, 36K 2nd degree). Cron enrichment via API disabled de-facto until resolved.

**pbn-clip-watcher timeout: 600→1800s (2026-03-03)**
Rationale: Original 600s was too tight for clip ingestion days. First run timed out ingesting Jim Rogers video. All 20 PBN clips now in DB; future no-new-clips runs exit in <10s. 1800s gives 3 clips @ 5min/clip headroom.

**reconnection-engine: draft-only, never send (2026-03-03)**
Rationale: Agent was over-executing — reading SOP's "deliver to Discord" and also trying to send to the contact via message tools. Reconnection messages must go through Yohann before sending. Prompt now explicitly bans message tool use. Human sends, not the agent.

**db-health signal regex: use date pattern not bracket pattern (2026-03-04)**
Rationale: Signal Scout format changed from `### [YYYY-MM-DD HH:MM]` to `### YYYY-MM-DD HH:MM —` at some point. The old bracketed regex silently returned 0 for 4 consecutive nights without anyone catching it. Fixed. Lesson: any cron that writes structured markdown headers must keep the db-health regex in sync.

**trend-scout: 2x/day --brand all at 8 AM + 10 PM ET (2026-03-04)**
Rationale: Doubles fresh signal coverage across morning and late-night X conversation cycles. Cost ~$1.40/week extra — negligible. Switched to --brand all (not aloomii-only) to keep Vibrnt trend awareness alive even with content engine paused — Vibrnt reboot could come anytime.

**client_pilots roster: 9 founding partners confirmed (2026-03-04)**
Rationale: Replaced 3 placeholder rows with real client names. Crypto-heavy roster (BiS, BlockSkunk, Sats Terminal, Arch Network, Stacks) signals ICP shift toward crypto/Web3 founders alongside original insurance + SaaS targets. `vertical` constraint expanded to support crypto subtypes. Mastercard + Visa status unconfirmed — flagged to Yohann. Launch.co added 2026-03-04 (Marcus Brotman connection — meeting Mar 5).

**client_pilots pilot_status: added 'target' tier (2026-03-04)**
Rationale: Most of the 10-client roster are targets, not confirmed deals. Mixing active and aspirational in the same status pollutes the flywheel health view. `target` = in ICP, not yet warm. `active` = warm relationship exists. Mastercard + Visa = enterprise targets, no contact yet. Launch.co = target until Marcus Brotman meeting converts.

**pilot-intel-sweep: append-only, weekly, GLM Flash (2026-03-04)**
Rationale: Company intelligence on pilot targets needs to accumulate over time without overwriting manually-added context. Append-only with dated sections gives a full history of how each company's story evolves — valuable for eventual outreach framing. GLM Flash keeps cost ~$0.04-0.08/week for 10 companies × 3 searches. Mondays 6 AM fires before contact-news-alert (Mon 7 AM) so both run sequentially without collision.

**Arch Network = hottest pilot target as of 2026-03-04**
Rationale: Public pain signals perfectly match Aloomii's value prop — they're explicitly seeking "strategic growth, positioning, storytelling, full-stack GTM execution" and building a dedicated go-to-market agency for their ecosystem. This is not an inferred fit; they are describing the problem Aloomii solves. Prioritize outreach.

**Westland Insurance: Tim Mackie is the real buyer (2026-03-04)**
Rationale: Vincent Pronesti is an Account Executive. Tim Mackie is EVP Distribution — owns national sales, retail ops, sales, and marketing for Westland. Any Aloomii deal needs Tim's awareness. Ask Vincent to make the introduction.

**XFounders as pilot client (2026-03-04)**
Rationale: Web3/AI accelerator with portfolio companies that all need GTM + lead gen. Aloomii pitch fits their pain verbatim. XFounders already partners with Mastercard = warm intro path. Nelson Lopez (CEO) is accessible via Twitter (@lcce01). High-leverage pilot: closing XFounders = access to entire portfolio as downstream clients.

**pilot-intel-sweep vertical expansion: added 'accelerator' (2026-03-04)**
Rationale: Client roster expanded beyond original insurance/crypto/trades taxonomy. Accelerators are a distinct category with different buying motion (sell to accelerator → access to portfolio companies). Vertical CHECK constraint expanded accordingly.

**ClawGuard killed permanently (2026-03-04)**
Rationale: Product was in limbo for 4+ weeks with no progress on the blocking Discord delivery issue. Aloomii absorbed all strategic focus. Warming pipeline contacts reassigned to Aloomii Sales Intelligence. No crons, no active code, no SOP to clean up. Note: was previously "killed" on 2026-02-27 per memory but roadmap/standup were never updated — this time fully purged from all active ops files.

**Content draft backlog killed (2026-03-04)**
Rationale: 16 drafts rotting since Feb 14 with zero publishes. Carrying dead drafts creates false backlog weight and decision fatigue. Trashed, not archived further. Clean slate — next content piece starts from scratch with a publish-or-kill-in-7-days rule.

- **2026-03-04 — Signal Scout URL validation bug:** Signal Scout cron hallucinated a Reddit post ID (`1rk6k8h` — r/startups "Hiring our first SDR") that doesn't exist. URL constructed from signal title rather than scraped from actual post. **Fix needed:** Add URL verification step before publishing signals — fetch the URL and confirm 200 + actual post content exists. If URL fails, either (a) drop the signal or (b) post without the link and flag as "source unverified." Assign to Senior Coder cron next cycle.

## 2026-03-05

**watch-metrics.js: PostgreSQL LISTEN/NOTIFY is the right long-term fix**
Rationale: Contacts migrated to PostgreSQL → `contacts.yaml` never changes → file watcher never fires `export-metrics.js` → `public_metrics.json` goes stale. Interim fix: 15-min periodic refresh added. Proper fix: DB trigger fires `pg_notify('metrics_changed')` → watch-metrics.js `LISTEN`s via persistent pg client → runs export-metrics.js on notification. Sub-second latency, zero polling overhead, zero cost. Not implemented yet — 15-min timer is acceptable until next coder cycle.

**Physical Mailer Pipeline: address never persists in Aloomii systems**
Rationale: PIPEDA compliance + client liability protection. For Relationship Rescue: address lives in client's own Google Sheet (encrypted), n8n pulls at send time, passes directly to Thanks.io. Only `order_id` + `contact_id` + `qr_unique_id` logged in Aloomii. Becomes a selling point: "we never see your clients' data."

**Physical Mailer QR scan dedup: first scan only triggers full sequence**
Rationale: Thanks.io fires webhook per scan (not per unique scan). Subsequent scans increment count but don't re-trigger RHS update or Discord alert. Prevents inflated engagement scores and alert spam.

**Physical mailer message cap: 300-400 characters**
Rationale: Thanks.io notecards have limited physical space. Long messages look cramped. AI-drafted messages must be constrained at prompt level.

**Investor deck closing slide: "The system found this meeting" — REMOVED (2026-03-05)**
Rationale: Leo drafted this slide as a powerful proof-of-product moment. Yohann correctly removed it — Marcus was found manually, not by Signal Scout. False precision kills credibility with investors. Lesson: only use self-referential product proof if it is literally and verifiably true. PBN growth rate used as closing slide instead.

**Don't anchor price before value for enterprise/conference sponsor prospects (2026-03-05)**
Rationale: BitGo outreach — Yohann correctly removed $3,500/mo from the DM. Conference sponsors have real budget ($500K+ event spend). Leading with price before value is confirmed = objection before interest. Sell the meeting first, price discussion on call. Standard DWY price ($3,500/mo) is a floor, not a ceiling, for enterprise targets.

**Switch main session model to Gemini 3.1 Pro (2026-03-05)**
Rationale: Outperforms Sonnet 4.6 on agentic benchmarks (Toolathlon/BrowseComp) while being cost-competitive. Already using Gemini Flash for crons; consolidating stack.

**crm-enrich.js: auto-research + relation-finder on every new contact (2026-03-05)**
Rationale: Leo was only using info from Yohann's screenshot — missing background, recent activity, related contacts already in DB. Gemini Flash research (~$0.003) + DB tag/location query added at INSERT time fills the gap automatically. Jesse Rodgers smoke test surfaced TribeHR co-founder history + EigenSpace CEO role + 8 related contacts. Leo runs `node scripts/crm-enrich.js --handle @handle` after every INSERT going forward.

**PostgreSQL LISTEN/NOTIFY for real-time metrics (2026-03-05)**
Rationale: watch-metrics.js was file-watch only; contacts migrated to PG meant contacts.yaml never changed → public_metrics went stale. LISTEN/NOTIFY is the correct solution: zero polling, sub-second latency, $0 cost. DB trigger on contacts table fires pg_notify → persistent pg.Client in watch-metrics catches it → export-metrics.js runs → KV pushed. 15-min periodic timer kept as silent fallback. `pg` npm package was already available in workspace.

## 2026-03-06 (afternoon — Phase 2 close-out)

**Reddit signals: no entity-linking, vertical intel only**
Rationale: Reddit usernames are anonymous. ~5% of posts mention a company explicitly. Cost of attempting entity-link across all Reddit signals far exceeds value. Decision: Reddit signals link to pre-seeded vertical entities (insurance-brokerage, financial-advisory, etc.) for category-level intent scoring only. No individual account scoring from Reddit.

**Entity-linking waterfall: cost-optimized priority order**
Rationale: Signal sources have wildly different API costs and entity match rates. Run cheapest-first, escalate only on failure, stop at confidence > 0.80.
Order: (1) CRM pg_trgm fuzzy match $0 ~40% → (2) X bio parse via Grok ~$0.001 ~55% → (3) Gemini web search ~$0.001 ~60% → (4) Job board extraction ~$0.001 ~75% → (5) Crunchbase via Gemini ~$0.002 ~80%.
Cost controls: max 10 Gemini + 5 Grok calls/run; skip Crunchbase if daily_spend > $5.
Spec: `context/follow-up-j01-spec.md`

**Multi-model ITIL review pattern established (jenny100x)**
Pattern: Build with Sonnet → Validate with Gemini Pro → Implement conditions with Gemini Pro → Certify with Sonnet.
Rationale: 4-eye principle caught real issues in Phase 1 (IVFFlat→HNSW, missing FK index, CHECK constraints missing). This pattern is now standard for all DB migrations going forward.

**Manual B2 backup required after major migrations**
Rationale: Automated backup runs at 3:30 AM ET. All Phase 2 migrations ran ~11 AM. 8 hours of unprotected schema changes. Decision: always trigger `bash scripts/backup.sh` immediately after any migration that creates tables, views, or indexes — don't wait for overnight cron.

## 2026-03-06 (afternoon session)

**CR-J09 Event-to-Mailer — Parked**
Decision: Park until after first Signal Feed client closes (CR-J08).
Rationale: Requires mailer fulfillment partner + address sourcing = operational complexity before revenue proven. Use as roadmap teaser in J08 pitch. Natural upsell for Phase 3.

**Applied Systems / Cytora — Positioning pivot**
Decision: Retire generic "AI for insurance" positioning. Adopt "AI Workforce for client relationships in insurance."
Rationale: Applied Systems acquired Cytora, claiming "insurance AI" + back-office territory. Our moat = front-office relationship layer (churn detection, proactive outreach, voice touch points) — explicitly NOT on Applied's roadmap.
Tagline: "Applied Epic runs your brokerage. Aloomii runs your relationships."
Investment narrative: Applied/Cytora = market validation. They solved back-office. We own front-office.

## 2026-03-06 (afternoon)

**Mac Mini hardware model: client-owned (confirmed)**
Decision: Client purchases and permanently owns the Mac Mini (~$900 CAD). Aloomii configures it and provides software + agents.
Rationale: Zero Aloomii liability on hardware. Maximum trust signal ("you own the box"). Switching cost advantage — churning means re-deploying a new vendor's stack on hardware they already bought. Pitch simplification: "Buy a Mac Mini, we configure it, your AI workforce runs on it 24/7."
Pricing: ~$900 CAD hardware (client) + $500–$1,000 setup (Aloomii) + $2,000–$3,500/mo SaaS.

**Privacy pitch corrected: "your Mac Mini" not "inside your M365 tenant"**
Decision: All privacy messaging now anchors to client-owned Mac Mini hardware, not M365 tenant framing.
Rationale: "Runs inside your M365 tenant" implies cloud/SaaS and raises IT procurement questions. "Runs on your Mac Mini in your office" is tangible, trusted, and ends the data privacy conversation.
Files updated: `docs/privacy-manifesto.md`, `pipeline/westland-cr-j08-brief.md`

**Metal / Adeel Akhter removed from client roster**
Decision: Metal is not a client. Mar 5 onboarding call was a prospect meeting, not a close.
Rationale: Yohann corrected 2026-03-06. Senior PM SOP updated to explicitly flag this; `client_pilots` DB had no Metal entry (confirmed). Paying clients = 0 as of this date.

**Outlook Graph API build: hold until Azure AD app registration**
Decision: Build `scripts/retention/email-sync.js` against Yohann's M365 Family account first, then use for Vincent demo.
Rationale: Test against real inbox before showing Vincent. Proves the demo works before the sales call.
Blocker: Yohann to register Azure AD app at portal.azure.com. M365 Family = "Personal Microsoft accounts only". Scopes: Mail.ReadBasic + Calendars.Read + User.Read.

**Applied Epic integration elevated to P0**
Decision: Build read-only MVP now (Policy API → renewal dates → Aloomii RHS). Write-back (activity notes → Epic) after design partner closes.
Rationale: Read-only lets us say "integrated with Applied Epic" in every pitch. Write-back is the moat that makes us irreplaceable — but overbuild risk is real pre-revenue. Scope discipline required.

**3-model review pipeline adopted for P0 infrastructure**
Pattern: Build (Sonnet) → Review (Gemini Pro) → Strategy (Opus) → Implement fixes (Sonnet) → Update spec (Gemini Pro).
Rationale: Caught shell injection vulnerability, OOM risk, and unenforced spend limits in entity-linker.js. 5-agent pipeline produced production-quality output. Worth the overhead for any P0 infra going forward.

---

## 2026-03-06 (Evening)

**Guildwood Pool Architecture Approved**
Decision: Purchased Revli data stored in isolated `guildwood_pool` table, never in core CRM. General Counsel APPROVED WITH CONDITIONS: trigger-based outreach only, opt-out suppression mandatory, 180-day GDPR purge.

**Lexi B2B fully hardened**
9 P1 + 3 P2 fixes. Critical bug fixed: WORKSPACE path was 4 levels up instead of 3 → gemini-search.sh never found → 0 signals per run. Validated by GPT-5.4 + Gemini Pro.

**ICP scoring model live**
+3 SDR hiring, +2 10-50 employees, +2 outbound intent, +2 recent funding, +1 founder. 4,481/5,882 startups at `monitoring`. 10 perfect-score companies.

**Lexi × Guildwood wired**
Every signal cross-referenced against guildwood_pool. Hits boost icp_score and auto-promote to CRM.

**GDPR purge cron live**
180-day retention. ID: gdpr-purge-guildwood-001. 2AM daily.

**Investor pipeline**
1,806 investors scored. Top-20 in pipeline/investor-pipeline-2026-03-06.md. Warm: Brotman, Draper, Economakis. Cold priority: Salesforce Ventures (Zak Kokosa).

**Billing flag SOP**
Gateway restart does NOT clear disabledUntil. Must manually zero errorCount, failureCounts, disabledUntil, disabledReason in auth-profiles.json → usageStats.anthropic:default.

## 2026-03-07 — Blog Content Decisions

**Signal Intelligence pillar: STEALTH**
- Not a public content pillar. Removed from blog spec and category filters.
- Rationale: competitive moat, not ready for public positioning.

**No double dashes (—) in any Aloomii content**
- Hard rule. Looks like AI slop. Use periods or rewrite the sentence.

**Do NOT mention OpenClaw in blog or marketing**
- ICP (insurance brokers, financial advisors) doesn't know OpenClaw. Tech-savvy readers might DIY → undercuts $4,500/mo.
- Aloomii's value = configuration + SOPs + 15 domain-specific agents + Yohann/Jenny operating it. Not the platform.
- Positioning: "proprietary AI infrastructure" or "15 AI agents running 24/7" — never "powered by OpenClaw."

**Pricing in blog/content: $4,500/month**
- Updated from $3,500/month in article on 2026-03-07
- Mention one-time setup costs (e.g. Mac mini hardware) without being specific about amount
- Rationale: positions Aloomii higher, covers infrastructure overhead

**Demo links → /#contact**
- No standalone /demo page. All CTAs point to `https://aloomii.com/#contact`

**Author credentials (canonical)**
- "Co-founder, Aloomii. 8 years Ontario Government. Former JP Morgan Chase, IBM."
- (Note: Jenny is ex-JP Morgan — confirm whose credentials go where for multi-author posts)

**Blog content pillars (public)**
1. AI Sales System
2. Industry Playbooks
3. Comparisons

## 2026-03-07

**Secret Management Infrastructure — BACKLOGGED**
Status: Backlog (Phase 3 security hardening — future sprint)
Rationale: Current state has API keys (Gamma, Blotato, XAI, Discord) stored in .env files and TOOLS.md plain text. Rotation requires manual edits across multiple files. Risk is acceptable short-term (local machine, no public exposure) but must be addressed before first enterprise client onboards.
Proposed stack: 1Password CLI (`op`) — already available via skill. Secrets injected at runtime via `op run -- node script.js`. Zero secrets in .env or workspace files.
Scope when ready:
  - Rotate all exposed keys (Gamma, Blotato, KV auth)
  - Remove secrets from TOOLS.md and MEMORY.md
  - Wrap all cron scripts with `op run --`
  - Add pre-commit hook to scan for leaked secrets
  - Trigger: before first enterprise pilot goes live (Westland Insurance or BlockSkunk)

## 2026-03-07 Evening

**Legal pages marked noindex**
Rationale: Privacy/Terms pages should not compete with commercial pages for crawl budget or ranking. `noindex` is standard practice. AI crawlers that matter (Perplexity, GPT) respect `llms.txt` not robots, so noindex doesn't affect GEO.

**Blog GEO strategy — framework agreed, not yet activated**
Pending: (1) llms.txt update with published URLs, (2) weekly `content-engine-blog` draft cron approval
Framework: answer-first structure + FAQ JSON-LD + llms.txt + internal linking per article + 90-day topic cluster cadence
Target queries: "SDR replacement cost", "AI sales system for insurance brokers", "B2B buying signals 2026"

**Security audit model: dual-model review**
Decision: All security audits use both Sonnet (main session) + Gemini Pro (subagent code read) independently, then merge. Prevents single-model blind spots. Applied successfully 2026-03-07 — Gemini found rate limiter DoS vector Sonnet flagged differently.

## 2026-03-08

**Aloomii Advertising (Intent Network) Launched**
Rationale: Selling traditional "B2B leads" triggers data broker regulations and PIPEDA profiling violations. By pivoting to an **Intent Network**, we sell anonymized, account-level "Firmographic Signals" (e.g. "Westland Insurance is evaluating CRMs"). Advertisers pay a premium (/mo feed, /mo routed) because we provide the *Warm Intro Route* using the Village.do graph, bypassing cold outreach liability in Ontario and Florida entirely.

**Village.do White-labeling Enforcement**
Rationale: To maintain the proprietary nature of our routing moat and avoid early exposure of our tech stack to prospects, all public-facing ToS, APIs, and architectural docs must refer to "Aloomii Proprietary Relationship Graph" or "Aloomii Proprietary Warm Routing" until an official partnership is announced.

**Heavy Crons Migrated to Gemini Flash**
Rationale: `senior-pm-daily` and `nightly-audit` spinning up full Sonnet 4.6 sessions daily was burning through Anthropic credits. Moved to `gemini-3-flash` to stop the bleed.

## 2026-03-09
**C&C Dashboard Full Redesign**
Rationale: Centralizing all operational awareness. C&C now hosts 8 primary modules: Events coming up, Reconnect With (T1/T2 > 14 days), Talk To Now (hot leads), Vibrnt Trends, Aloomii Trends, Ticket Watch (BTS pairs + MTG), and PBN Clips. 
Ticket watch cache was implemented to refresh only 3 times a day (every 8 hours) to prevent excessive marketplace pings.
Blog Drafts card added to track active markdown drafts and backlog status.

**VIBRNT AI Trend Constraints (2026-03-09)**
Rationale: Prior trend scraping was pulling general "fashion industry/streetwear" news. VIBRNT is explicitly a women's print-on-demand graphic tee brand. The trend scout now strictly pulls 10 visual motifs, text energies, subculture aesthetics, and color palettes that map to the 12 brand moods. Goal is direct injection into the design pipeline, not industry news reading.

### 2026-03-09
- **Strict URL Rule for Web Signals:** Enforced a STRICT URL RULE in `sops/signal-scout.md` for web search signals (must use article URL or drop signal). 
  - *Rationale:* `signal-scout` (using Gemini Flash) was hallucinating company domains (e.g., `sphinx.com`) when it found real news but lacked the exact source link, leading to phantom sources in Discord alerts.
- **Cron Fleet Standard (Cost Protection):** All new crons must default to `google/gemini-3-flash` or `zai/glm-4.7-flash` unless they explicitly require Sonnet/Opus reasoning. Routine tasks (running scripts, formatting JSON) compound fast when paired with a growing CRM database.
- **Agentic Search Boundary:** Any SOP that commands an agent to search and report findings MUST explicitly instruct the agent to drop/ignore the finding if a verifiable, direct URL is unavailable, to prevent hallucinated fallback domains.

### 2026-03-10
- **Aloomii.com Source of Truth:** The master repository for aloomii.com is located at `~/Desktop/aloomii`, NOT `~/.openclaw/workspace/output`. Deploying from the workspace output directory caused missing image assets (404s).
- **Cloudflare KV Binding Verification:** Before deploying Cloudflare Pages, always verify `wrangler.toml` for placeholder values. The `ALOOMII_METRICS` KV namespace had a "REPLACE_WITH_KV_NAMESPACE_ID" placeholder, causing silent 405 API failures on the metrics push. The system must retain environment infrastructure IDs (KV Namespace: `b520c1d361e84120b8f511fa942efb81`) in its tech-stack memory to prevent configuration drift.

### 2026-03-10
- **Auto-Deploy Cloudflare from Metrics Watcher:** Modified `watch-metrics.js` to run `wrangler pages deploy` automatically. *Rationale:* The Aloomii OS dashboard is statically hosted on Cloudflare Pages; updating the local JSON wasn't reflecting on the live site without a push. This automates the pipeline from DB trigger -> JSON export -> Live site.
- **Demo Page UX/Privacy Standardization:** Enforced a strict no-PII rule on `aloomii.com/demo/` (institution names only for contacts), balanced data density to 5 items per card, and aligned the visual design with `aloomii-os`. *Rationale:* Provide a safe, consistent, and visually balanced live-fleet demo for public/sales use without leaking real CRM contact names. Recorded these rules in `tech-stack.md`.

## 2026-03-11 — n8n Workflow Architecture Decisions

**Flatten payload in Calculate Tier Code node**
- Rationale: n8n Postgres v1 node fails to resolve nested `$json.body.x` paths. Flattening to top-level in Code node makes all downstream nodes (Postgres, HTTP, etc.) simple and reliable.
- Fields added to Code node output: `name`, `email`, `handle`, `source`, `metadata` (pre-built JSON object)

**Use `$('Omnichannel Webhook').item.json.body` to recover original payload**
- Rationale: OpenAI LLM node replaces `items[0].json` with its own response, destroying the original webhook data. Referencing by node name is the only reliable way to recover it downstream.

**`parseInt($json.tier, 10)` in Postgres tier mapping**
- Rationale: n8n passes numeric values as strings in expressions; Postgres `contacts_tier_check` constraint rejects anything that isn't an exact integer 1, 2, or 3.

## 2026-03-12

**Signal Scout URL Hallucination Fix (Data Starvation vs Prompting)**
Rationale: Signal Scout was hallucinating LinkedIn and Indeed URLs despite strict "DO NOT HALLUCINATE" prompt instructions. Investigation showed the LLM was starved of the actual URLs: `gemini-search.sh` was stripping Google grounding citations, and `scrapling-fetch.py` was truncating HTML at 2000 chars and ignoring `href` attributes.
Decision: Fix the tools, not the prompt. `gemini-search.sh` now resolves and appends exact source URLs. `scrapling-fetch.py` now uses BeautifulSoup to extract clean text and explicitly appends a list of all `<a href>` links found on the page so the LLM has the real URLs in context.

- **[2026-03-12] Blog Baseline Math Update:** Shifted the SDR comparison baseline from an inflated $145k/yr (2024 metric) down to $120k/yr. The new narrative frames the 2026 SDR as a 'Prompt Operator' reliant on a $25k/yr brittle AI 'Franken-stack' (Claude for Work, Perplexity Pro, Clay, Sales Nav). This positions Aloomii ($54k/yr) against the subscription fatigue and integration rot of piecemeal AI, rather than just headcount savings.
- **[2026-03-12] Blog Deployment Automation:** Created `scripts/deploy-blog.sh` to explicitly enforce the Astro build-to-output pipeline. Replaces manual folder copying to prevent deploying the raw Astro `dist` output directly into the main Cloudflare marketing site.

---

## 2026-03-17 — Incident: 13 Blog Articles Wiped (and recovered)

### What Happened
Yohann asked Leo to publish a new blog article (Apollo.io vs. Aloomii). Leo built the HTML, dropped it in `~/Desktop/aloomii/blog/`, and deployed via `wrangler pages deploy` from Yohann's machine. This wiped all 13 existing articles from the live site.

### Root Cause
The aloomii.com site had **two separate deployment sources** pointing at the same Cloudflare Pages project:
1. `~/Desktop/aloomii/` — main site (index, aloomii-os, etc.), deployed from Yohann's machine via wrangler
2. `~/.openclaw/workspace/output/` — full site including Astro-built blog, deployed via `scripts/deploy-blog.sh`

Cloudflare Pages replaces the entire deployment on every push. Whichever source deployed last would silently delete everything the other had added. This was a ticking clock from day one.

Leo deployed from source #1 without knowing source #2 had the blog. No error, no warning — just silent overwrite.

### Why Leo Didn't Catch It
- The `~/Desktop/aloomii/` git repo had no blog folder and no commit history from Jenny's machine
- The `content/blog/backlog.md` marked articles as "Published" but that was aspirational — they were never in the local repo
- Leo had no pre-deploy checklist to diff local files against live site

### Recovery
1. Found all 13 Markdown source files in `blog-astro/src/content/blog/` (workspace — never lost)
2. Rebuilt via `npm run build` in blog-astro
3. Copied `dist/blog/` into `~/Desktop/aloomii/blog/`
4. Committed everything to git and pushed → GitHub Actions deployed

### Permanent Fixes Applied
1. **Single source of truth:** `~/Desktop/aloomii/` is now the only deployment source. Blog Astro builds copy into it before every deploy.
2. **Git-only deploys:** `CLAUDE.md` and `INSTRUCTIONS.md` updated with hard ⚠️ rule — `git push` only, never `wrangler pages deploy` directly.
3. **MEMORY.md updated:** Deploy command corrected, wrangler ban documented.
4. **Scripts/deploy-blog.sh** should be updated to output to `~/Desktop/aloomii/blog/` and then `git push`, not `wrangler deploy`.

### Rules Going Forward
- **Before any site deploy:** `ls ~/Desktop/aloomii/blog/` — confirm blog folder exists and has articles
- **After any new blog article:** Run `cd blog-astro && npm run build && cp -r dist/blog ~/Desktop/aloomii/blog` before pushing
- **Never run `wrangler pages deploy` directly** — not Leo, not Jenny, not Yohann
- **Both machines must clone from `github.com/yohann888/aloomii`** — no standalone deployments

---

## 2026-03-17: Village.do Contact Verification Protocol
**Decision:** Never trust Village.do contact names as ground truth. Scores (warmth) are reliable; individual names may be stale or fabricated.
**Rule:** Always verify contact names against firm's public team page before requesting intro. Ask connector "who do you know there?" — let them name the contact.
**Script fix:** Added `contacts_verified: false` + `contacts_note` to all `village-cix-query.js` output.

## 2026-03-17: CIX Intel Flow (corrected)
**Decision:** Run Village AFTER scraping confirmed attendee list — not against a hypothetical list.
**Correct flow:** cixsummit.com/whos-attending/ → extract VC domains → run village-cix-confirmed.js → cross-reference with CRM contacts.

## 2026-03-17: Ollama Web Search Plugin — Deferred
**Decision:** Keep Gemini (`scripts/gemini-search.sh`) as default web search. Ollama plugin fails in sandbox (host-only limitation).
**Revisit:** When Aloomii fleet moves to dedicated server with Ollama co-located. Privacy pitch = "agents search web, your data never touches Google."

## 2026-03-18: Messaging Pivot — Retire "Replace Your SDR"
**Decision:** Primary messaging shifts from "replaces the SDR" to relationship-retention framing.
**Rationale:** ICP (insurance, financial advisors) responds to "clients stop leaving / relationships maintained" — not tech replacement language. SDR comparison articles (SEO) stay unchanged.
**New CTAs:** "Every relationship maintained. None forgotten." / "Run your brokerage like a 40-person firm. With your team of 12."

## 2026-03-20

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-20 | No OpenClaw branding in ACI client-facing copy | Opus analysis: names the recipe → pricing destruction. Invites DIY. Competitive exposure. Client (insurance/financial) doesn't know OpenClaw — it adds nothing. ACI is proprietary brand. |
| 2026-03-20 | Publisher abstraction layer for ACI | Blotato is adapter #1 but not the only option. Choppity API pending, other services likely. Generic publisher.js interface = swap adapters without touching content engine. |
| 2026-03-20 | Pipeline attribution in DB from day 1 | The data moat — content_posts → content_engagements → content_attributions. Query: which topics generate closed deals. No competitor has this for professional services verticals. |
| 2026-03-20 | ACI in stealth mode | Product not ready for public launch. Nav link removed, section hidden. Page live at /content-intelligence.html for manual sharing only. |
| 2026-03-20 | Podcast Infrastructure as standalone add-on, not ACI tier | Podcast ops is a distinct buying decision. Don't force bundle. $5K launch + $3K/mo standalone, or $4,500/mo with ACI Engine. |
| 2026-03-20 | GEO (Generative Engine Optimization) as owned category | Aloomii is first-mover on GEO for professional services B2B. Content strategy targets AI engine citations, not just Google ranks. Blog posts structured as canonical answers. |

**Blog CTAs → Calendly (2026-03-20)**
Rationale: mailto:hello@aloomii.com requires user to open email client — high friction, low conversion. Calendly direct booking is the standard. URL: https://calendly.com/yohann8/15min. Applied to all 10 blog posts + podcast-infrastructure.html. Never hardcode mailto as a CTA again.

**Inline style overrides for static blog posts (2026-03-20)**
Rationale: CSS variable changes on shared stylesheets fight Cloudflare CDN cache (same filename = stale cache possible). Injecting `<style>` block directly into HTML file guarantees the rule loads with the page, bypasses CDN cache on the CSS asset entirely. Use this pattern for any layout fix on the static aloomii blog.

**BlockSkunk — killed (2026-03-20)**
Rationale: Deal closed as commission-only, no retainer. No cash, no recurring revenue. Commission-only deals without retainer are not worth carrying in active pipeline. Archived.

**Backblaze B2 — no deal (2026-03-20)**
Rationale: Sales call/contact came to nothing. No partnership, no startup credits secured. Archived.

**Blog nav link removed from homepage (2026-03-20)**
Rationale: GEO is content/schema-driven not nav-driven. AI engines crawl via sitemap + direct URLs. Removing nav link declutters homepage without affecting SEO or GEO. Blog remains accessible at /blog/.

**Podcast invite as primary cold outreach hook for Guildwood Pool (2026-03-21)**
Rationale: Recently funded founders ($5M+) are in PR mode. A podcast guest invite bypasses vendor-pitch filters entirely and positions Yohann as peer/platform host, not vendor. Expected response rate 10-20% vs 2-3% for cold pitch. Jim Rogers episode is the credibility anchor.

**Village VC Bridge Strategy over direct startup lookup (2026-03-21)**
Rationale: Village graph covers only ~10% of niche early-stage startups. VC firm domains hit at 60%+. Strategy: map paths to VC firm → request portfolio intro. Now the standard for all Guildwood Pool outreach.

**No automated email from @aloomii.com for cold outreach (2026-03-21)**
Rationale: Primary business domain spam risk. Manual sends capped at 5-8/day from Gmail. If volume scales, wire a burner domain (aloomii.net) through Instantly/Lemlist instead.

**PBN blog to be built as separate Cloudflare Pages project (2026-03-21)**
Rationale: palebluenexus.com has no GitHub repo. Build fresh at ~/Desktop/palebluenexus/ with GitHub Actions + Cloudflare Pages, matching aloomii deployment pattern. Blocked until Yohann confirms PBN site source.

---

## 2026-03-21 — PBN Hosting Architecture Final State

**Decision:** `palebluenexus.com` (root domain) added as second custom domain to `palebluenexus` Cloudflare Pages project. Both root and `blog.palebluenexus.com` now served by Pages. Porkbun Pixie hosting is fully bypassed.

**Rationale:** After nameservers moved to Cloudflare, restoring the old Porkbun CNAME would require ongoing maintenance of two hosting providers. Consolidating both domains under Pages is simpler, more reliable, and free.

**Impact:** Any future changes to `palebluenexus.com` homepage must go through `git push origin main` in `~/Desktop/palebluenexus/` — NOT uploaded to Porkbun file manager.

---

## 2026-03-21 (Afternoon) — Two-ICP Architecture

**Decision:** Aloomii operates two distinct ICPs in parallel, confidential from competitors.
- ICP 1: THE SPRINT — B2B SaaS/dev tools founders, $10K-$100K MRR, $3K/mo
- ICP 2: AI WORKFORCE — Insurance/financial advisory/wealth management, $1M-$10M ARR, $2,500-5K/mo
**Rationale:** Sprint generates fast revenue, case studies, and referrals into AI Workforce. AI Workforce generates recurring revenue and proprietary data flywheel. Same infrastructure serves both. Sprint clients naturally know AI Workforce buyers (their clients/investors are insurance brokers, advisors).
**Confidentiality rule:** ICPs and offer language never in public content. Decks are hand-shared only.

**Decision:** Jim Rogers article rewritten on PBN blog + cross-posted to Aloomii blog + Chinese translation added.
**Rationale:** Original article was AI-hallucinated (no transcript). Rewrite uses real session transcript. Cross-post to Aloomii extends reach. Chinese translation targets Jim Rogers' Asia/Singapore audience — strong Chinese-language search intent.
**Rule:** All future PBN episode recap posts must be built from real transcripts. No fabricated quotes.

**Decision:** Simplified Chinese (Mandarin) is now a standard translation target for PBN podcast content featuring Asia-relevant guests.
**Rationale:** Jim Rogers' core thesis (Asia is the future, Singapore base) maps directly to Chinese-language audiences. `hreflang` + FAQPage JSON-LD in Mandarin = full SEO signal stack for Baidu + Google CN.

**Decision:** Offer + Deck Factory SOP is the single process for all offer and deck generation going forward.
**Rationale:** Eliminates ad-hoc offer construction. Every offer is scored before sending (CVS + AHS + red flags). Composable modules allow quick signal-specific customization without starting from scratch. Yohann's active time per offer: under 25 minutes.
**File:** `sops/offer-deck-factory.md` (936 lines, 21 modules, 2 ICP templates, 2 deck blueprints)


## 2026-03-21 (Evening)

**Decision:** `/sprint` page is stealth — discoverable via direct URL and blog CTAs only, never in homepage or main public nav.
**Rationale:** Sprint ICP is confidential; homepage is public-facing. Blog readers are already Sprint ICP (they clicked in). No need to advertise on the front door.
**Rule:** If The Sprint is ever added to a new page's nav, check whether that page is public-entry-point (homepage, aloomii-os.html etc.) — if yes, remove it.

**Decision:** Calendly inline embed (not a contact form) is the Sprint page CTA.
**Rationale:** Sprint buyers decide in one meeting. Forms add friction before they've seen value. Calendly embed means zero navigation away from the page — book while conviction is hot.

**Decision:** `auto-deck.js` ICP routing via `context.icp` in signal JSON (not just CLI flag).
**Rationale:** The signal JSON is the source of truth for all prospect context. ICP should be set at signal creation time so no CLI flag is needed for routine factory runs. CLI `--icp` flag is the override for edge cases.


## 2026-03-22 (Morning)

**Decision:** Sprint page hero updated to "12 qualified conversations in 90 days: partnership intros, podcast bookings, and warm prospect meetings combined."
**Rationale:** Breaking down the 12 conversations by type removes the vagueness. A founder reading that knows exactly what kind of pipeline they're buying. The specificity IS the credibility signal.

**Decision:** Human review is the primary differentiator, not a footnote.
**Rationale:** Opus audit finding confirmed this. The 80% problem (AI gets you most of the way, last 20% is tone/timing/nuance) is exactly why AI tools get abandoned at 60 days. Positioning human review as the answer to that abandonment problem makes it a feature, not a caveat.
**Implementation:** Dedicated "Why This Isn't Another AI Tool" section added to sprint.html. Anti-positioning ("What We Don't Do") section added below it.

**Decision:** Jim Rogers story is the lead credibility section on the Sprint page and the first LinkedIn post to publish.
**Rationale:** Story is verifiable, specific, 17 years long, and carries the exact lesson Aloomii sells (relationships maintained over time convert). Do not editorialize. Let it land.

**Decision:** SOUL.md is the canonical brand document.
**Rationale:** Before this session, SOUL.md only contained Leo's operating identity. Aloomii's brand positioning, ICPs, voice rules, proof points, and origin story lived nowhere central. SOUL.md is now the source-of-truth brand document loaded every session.
**Content:** positioning statement, the promise, voice rules (never/always), cat origin story, Jim Rogers proof point, Sprint ICP, AI Workforce ICP, founder bios.

**Decision:** Cat origin story (Aloo + Mittens) is a brand asset to use in every first impression context.
**Rationale:** Disarming, human, memorable. The contrast (AI Workforce company named after cats, deployed for insurance brokerages) is what sticks. Every guard comes down. They tell other people. Embedded into both founder LinkedIn About sections.
**Line (canonical):** "Aloomii is named after our two cats. The company is slightly more productive than they are."

**Decision:** LinkedIn posts drafted by Aloomii are for Yohann to post himself — not published by Aloomii.
**Rationale:** Posts are in Yohann's first-person founder voice. They carry his credibility. Aloomii drafts, founder publishes.
**Rule:** Always label LinkedIn post deliverables as "DRAFT — for Yohann to post."


## 2026-03-23

**Decision:** Sprint ICP revenue floor raised from $10K-$100K MRR to $50K-$100K MRR.
**Rationale:** Below $50K MRR founders lack budget conviction at $3K/mo. Tighter ICP = higher close rate. The $2M raise trigger added as a qualifier for well-funded pre-revenue founders.
**Rule:** Recently funded >$2M founders qualify even if MRR is below floor — $3K is noise for them.
**Files updated:** `config/signal-scout-icps.yaml`, `SOUL.md`, `memory/icps.md`
**Commit:** `95a0b73`

**Decision:** jenny100x March 2026 — three sequential priorities established.
**Rationale:** All 3 models (Gemini Pro, Opus, GPT-5) independently landed on the same top finding: no paying clients = all other infrastructure is theoretical. Consensus this strong is actionable.
**Priority sequence:** (1) Proof Machine — get 1-3 paid design partners with case study rights; (2) Signal-to-Close Loop — wire Signal Scout → Village.do → Gamma → human review → send; (3) PBN as Sprint Funnel — podcast invites to Sprint ICP founders, editorial only, 30%+ close rate.
**Key rule from GPT-5:** These are sequential, not parallel. Proof first.
**Report:** `memory/jenny100x-2026-03.md`

**Decision:** migrate-signals-to-pg.py regex fixed — Python migration now canonical for activity_log only.
**Rationale:** Script had been silently failing (0 inserts) since signals.md header format changed. JS migration is canonical for the `signals` table. Python migration writes to `activity_log` hypertable. Both valid, different purposes.
**Lesson:** Always test migration scripts against current file format after any format change.
