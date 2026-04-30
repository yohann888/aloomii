# Signal Scout — The SDR Replacement
> Read _shared/CONVENTIONS.md before executing.

## What This Is
Signal Scout is the core of Aloomii's Sales Intelligence System — it IS the SDR replacement. It runs every 4 hours, monitoring Reddit, X, and online communities for buying signals from B2B founders who need sales help but can't afford a full-time SDR. It scores signals, logs them to `pipeline/signals.md`, and announces hot leads (score 4-5) in Discord. This agent alone does what a $145K/yr SDR does: finds people who are ready to buy.

## How It Works

### 3-Layer Pipeline Architecture

```
Layer 1 — Scrapling (stealth fetch)
    scripts/scrapling-fetch.py <url>
    → Returns raw HTML/text bypassing bot detection
         ↓
Layer 2 — MiniMax M2.5 Lightning (bulk parse)
    scripts/signal-parse.py --url <url>
    → Extracts structured signal JSON from raw content (cheap, 200k context)
         ↓
Layer 3 — Gemini Flash (strategic score)
    This session (model=flash)
    → Receives clean JSON only, applies ICP judgment, scores 1-5
```

**Why this matters:**
- Scrapling fetches pages that block Googlebot
- MiniMax digests large HTML dumps cheaply (200k context, $0.015/1k tokens in)
- Gemini Flash never touches raw HTML — only clean signal JSON — keeping cost and latency low
- Gemini Flash's job is judgment, not extraction

### Schedule
- Runs at: 6:00 AM, 10:00 AM, 2:00 PM, 6:00 PM, 10:00 PM EST
- Runtime: ~3-5 minutes per scan
- Session: Isolated (doesn't clutter main chat), model: **flash**
- Delivery: Announces to Discord only for score 4+ signals

### Available Tools
- **Sovereign Search** (`scripts/sovereign-search.js`) — Vendor-agnostic search router.
  Usage: `node scripts/sovereign-search.js "query" --type [web|x]`
  - Use `--type x` for Twitter/X signals (routes to Grok).
  - Use `--type web` for general web signals (routes to Gemini/Google).
- **Scrapling** (`scripts/scrapling-fetch.py`) — stealth fetcher for anti-bot sites.
  Usage: `scripts/.venv/bin/python scripts/scrapling-fetch.py <url>`
- **MiniMax signal parser** (`scripts/signal-parse.py`) — bulk HTML → structured signal JSON.
  Usage: `python3 scripts/signal-parse.py --url <url>` or `--file <path>`
  Requires: `MINIMAX_API_KEY` env var or `openclaw config set models.providers.minimax.apiKey <key>`
  Output: `{ "signals": [...], "total_found": N }` — pass this directly to your scoring step
- **Village enrichment** (`skills/village/enrich.mjs`) — warm intro path finder. Run immediately on score 4+ signals.
- **contacts.yaml** — always cross-reference before scoring any signal

### Using the 3-Layer Pipeline (preferred for URL-based signals)

Instead of reading raw HTML yourself, do this:
```
1. Run: python3 scripts/signal-parse.py --url <url>
2. Receive structured JSON with extracted signals
3. Apply your ICP scoring (1-5) to each signal in the JSON
4. Skip low-quality signals (urgency=low, no ICP keywords) without re-reading the page
```

For search results (Reddit, Grok, Gemini) where you already have the text snippet: score directly without calling signal-parse. Use signal-parse only for full page fetches.

### Step 0: Fleet Directives
Read `daily/fleet-directives.md` at the start of every run. Apply any directives targeting `[signal-scout]` or `[ALL]` before executing searches. If a directive changes scoring rules or search terms, apply it for this run only (do not edit this SOP).

### Step 0.1 — Load ICP Config
Read `config/signal-scout-icps.yaml`. Determine which ICPs are active for this run.

- If `sprint.enabled: true` → **Sprint ICP is ACTIVE** for this run
- If `ai_workforce.enabled: true` → **AI Workforce ICP is ACTIVE** for this run
- If the file is missing → treat both as ACTIVE
- If both are `false` → run core/generic phases only (Phases 3, 5, 6); skip all ICP-specific keyword blocks and subreddits

Hold the active ICP set in memory for the rest of this run. All subsequent phases refer to "Sprint ACTIVE" and "AI Workforce ACTIVE" based on what you loaded here.

### Search Strategy

**Phase 0 — Reddit Scrapling (run THIS FIRST — highest signal density)**
_(Previously labeled Phase 1.5 — moved here because Reddit JSON feeds are the richest, fastest signal source and should be processed before any search queries.)_

Use `scripts/.venv/bin/python scripts/scrapling-fetch.py <url>` to fetch each subreddit's JSON feed directly. Parse the posts for ICP matches before running broader searches.

**Core subreddits (always fetch — both ICPs or neither):**
```
https://www.reddit.com/r/startups/new.json?limit=25
https://www.reddit.com/r/sales/new.json?limit=25
https://www.reddit.com/r/marketing/new.json?limit=25
https://www.reddit.com/r/smallbusiness/new.json?limit=25
```

**Sprint-only subreddits (fetch ONLY if Sprint ICP is ACTIVE):**
```
https://www.reddit.com/r/SaaS/new.json?limit=25
https://www.reddit.com/r/Entrepreneur/new.json?limit=25
https://www.reddit.com/r/b2bmarketing/new.json?limit=25
https://www.reddit.com/r/indiehackers/new.json?limit=25
https://www.reddit.com/r/GrowthHacking/new.json?limit=25
https://www.reddit.com/r/founderreads/new.json?limit=25
https://www.reddit.com/r/devops/new.json?limit=25
```

**AI Workforce-only subreddits (fetch ONLY if AI Workforce ICP is ACTIVE):**
```
https://www.reddit.com/r/fintech/new.json?limit=25
https://www.reddit.com/r/insurance/new.json?limit=25
https://www.reddit.com/r/financialplanning/new.json?limit=25
https://www.reddit.com/r/wealthmanagement/new.json?limit=25
```

For each post, extract: title, selftext, author, url.

⚠️ **STRICT URL RULE:** The `url` field in each Reddit JSON post contains the direct post permalink (e.g. `https://www.reddit.com/r/startups/comments/abc123/post_title/`). This is what you MUST use as `source_url` in the DB insert and `📍 Source:` in Discord. NEVER use the feed URL (`/new.json?...`) as the source. If you can't extract a valid post permalink, skip that post entirely.

**Deduplication Check (run before scoring any URL):**
1. Read `pipeline/seen-urls.json` (if file is empty or missing, treat as `[]` — do not error)
2. If the post URL already exists in the array AND was seen within the last 48 hours → skip entirely (do not score, do not log)
3. If NOT in the cache → proceed to score, then append to seen-urls.json: `{"url": "...", "seen_at": "ISO8601 timestamp", "score": N}`
4. Junior Coder prunes entries older than 7 days on its daily sweep

**Scrapling failure fallback:** If `scrapling-fetch.py` returns an error or empty body for any URL, fall back to `web_fetch` for that URL. Note the failure in standup.md under "Scrapling failures: N".

Score directly against ICP keywords — no need for signal-parse.py on JSON responses.

---

**Phase 1 — Direct Intent Searches (highest priority)**
Search these queries on the web. Look for posts from the last 24 hours.

Use **Grok 4.2** if available (`xai-grok-search` skill), otherwise use standard web search.

**Time-Window Intent Clustering — run EACH query at 3 time windows for freshness scoring:**
- Window A: past 1 hour (weight: 3x — treat as score +1 boost)
- Window B: past 24 hours (weight: 1x — normal scoring)
- Window C: past 7 days (weight: 0.5x — only log if score 4+)

If Grok supports time filtering, pass the window. Otherwise append `"today"` or `"this week"` to the query string.

**Deduplication Check (run before logging any Phase 1 signal):**
1. Read `pipeline/seen-urls.json` (if file is empty or missing, treat as `[]` — do not error)
2. If the result URL already exists in the array AND was seen within the last 48 hours → skip entirely (do not score, do not log)
3. If NOT in the cache → proceed to score, then append to seen-urls.json: `{"url": "...", "seen_at": "ISO8601 timestamp", "score": N}`
4. Junior Coder prunes entries older than 7 days on its daily sweep

**Signal Search — SDR Replacement & Sales Pain:**
```
"need an SDR" OR "hiring SDR" OR "can't afford SDR" OR "SDR is too expensive"
"doing my own sales" OR "founder-led sales" OR "hate cold outreach" OR "cold email is dead"
"need help with outbound" OR "outbound isn't working" OR "pipeline is dry"
"looking for" ("sales help" OR "lead gen" OR "prospecting tool" OR "AI sales")
"anyone know a good" ("sales agency" OR "lead gen" OR "outbound tool")
"just raised" AND ("hiring sales" OR "building pipeline" OR "first sales hire")
"no dedicated sales team" OR "solopreneur sales" OR "doing everything myself"
"AI SDR" OR "automated prospecting" OR "sales intelligence"
"how do I get my first 10 customers" OR "struggling to get customers" B2B
"just launched" AND ("no signups" OR "no traction" OR "crickets") B2B
```

**Signal Search — Sprint ICP (run ONLY if Sprint ICP is ACTIVE):**
```
"need more leads" OR "no marketing system" OR "growing only on referrals" founder
"how do I get my first 100 customers" OR "struggling with outbound" B2B
"hired a marketer and it didn't work" OR "content isn't converting" startup
"can't get podcast appearances" OR "no time for LinkedIn" founder B2B
"word of mouth is slowing down" OR "referrals dried up" SaaS
"marketing isn't working" OR "content not converting" B2B founder
```

**Signal Search — AI Workforce ICP (run ONLY if AI Workforce ICP is ACTIVE):**
```
"renewal tracking" OR "client follow-up automation" insurance OR financial
"insurance broker software" OR "financial advisor CRM"
"losing clients to follow-up gaps" OR "relationship management" financial services
"account manager quit" OR "onboarding new advisors" brokerage
"cross-sell" "book of business" OR "client retention automation" wealth
site:linkedin.com/jobs ("SDR" OR "account executive") ("insurance" OR "financial advisor" OR "wealth management")
```

**Signal Search — Legacy (still relevant):**
```
"need help with OpenClaw" OR "OpenClaw setup help" OR "setting up OpenClaw"
"need help" "AI agent" OR "local AI agent" setup
"looking for" ("AI consultant" OR "brand strategist")
"need a technical cofounder" OR "looking for CTO"
```

**Accelerator Search (NEW):**
```
"accelerator deadline" OR "apply now" cohort funding
"Y Combinator" deadline OR "YC" application
"Techstars" deadline OR "apply to cohort"
"funding cohort" applications open OR "batch" deadline
"startup accelerator" apply now OR "deadline" this week
```

_(Reddit scrapling moved to Phase 0 — see above.)_

**Phase 1.6 — Hacker News (Ask HN — high ICP density)**
Fetch new HN stories and filter for founder sales/growth pain. These "Ask HN" posts are goldmines — founders publicly admitting they need help.
**Scrapling failure fallback:** If scrapling errors or returns empty, fall back to `web_fetch` for that URL. Note failure in standup.md.

```bash
# Fetch latest 200 story IDs
scripts/.venv/bin/python scripts/scrapling-fetch.py https://hacker-news.firebaseio.com/v0/newstories.json

# For each ID in the first 50, fetch the item
https://hacker-news.firebaseio.com/v0/item/<ID>.json
```

Filter for posts where `type=story` and title contains any of:
`"ask hn"`, `"first customer"`, `"no sales"`, `"getting traction"`, `"outbound"`, `"pipeline"`, `"SDR"`, `"cold email"`, `"founder-led sales"`, `"B2B"`, `"lead gen"`, `"getting users"`

Fetch the top 3 matching items in full and score against ICP. Skip items older than 48 hours.

**Phase 1.7 — Product Hunt Launches (funding-adjacent signal)**
Founders launching on PH are actively looking for users and often have budget. B2B SaaS launches = strong ICP match.
**Scrapling failure fallback:** If scrapling errors or returns empty, fall back to `web_fetch` for that URL. Note failure in standup.md.

```bash
scripts/.venv/bin/python scripts/scrapling-fetch.py https://www.producthunt.com/feed
```

Parse the RSS feed. For each launch, extract: product name, tagline, maker handle, URL.
Score if tagline includes: `"B2B"`, `"sales"`, `"CRM"`, `"outbound"`, `"AI"`, `"SaaS"`, `"startup"`, `"founders"`, `"pipeline"`, `"leads"`.
A B2B SaaS launch on PH = score 3 baseline (founder with product, likely needs pipeline).

**Phase 1.8 — IndieHackers (underrated goldmine)**
Founders who post on IH are builders actively looking for growth — high ICP density, low noise.
**Scrapling failure fallback:** If scrapling errors, fall back to `web_fetch`. Note failure in standup.md.

```bash
# Recent posts feed
scripts/.venv/bin/python scripts/scrapling-fetch.py https://www.indiehackers.com/posts?sort=latest

# Also fetch the "Ask IH" section
scripts/.venv/bin/python scripts/scrapling-fetch.py https://www.indiehackers.com/posts?sort=latest&type=question
```

Parse posts. Score if title/body includes: `"sales"`, `"outbound"`, `"customers"`, `"pipeline"`, `"cold email"`, `"SDR"`, `"traction"`, `"B2B"`, `"first customers"`, `"struggling to sell"`, `"revenue"`.
IH founders are typically 1-person or small teams — perfect Aloomii ICP.

**Phase 1.9 — Job Board Signals (highest-intent leads)**
A founder posting for an SDR is the single best signal — they feel the pain, have budget intent, and are 2-4 weeks from realizing they can't afford a $60K hire. That's the Aloomii pitch window.

```bash
# Indeed — SDR postings at early-stage companies
scripts/.venv/bin/python scripts/scrapling-fetch.py "https://www.indeed.com/jobs?q=sales+development+representative+startup&sort=date&fromage=3"

# LinkedIn Jobs public search
scripts/.venv/bin/python scripts/scrapling-fetch.py "https://www.linkedin.com/jobs/search/?keywords=sales+development+representative&f_TPR=r259200&f_E=1,2"

# Wellfound (AngelList) — startup-specific SDR jobs
scripts/.venv/bin/python scripts/scrapling-fetch.py "https://wellfound.com/jobs?q=sales+development&j=full-time&l=&sort=posted"
```

For each job posting, extract: company name, role title, posting date, company size, location.
Score 4 if: startup/early-stage + posting SDR/AE/Sales role + company ≤50 employees.
Score 5 if: also has recent funding signal or founder is posting directly.
**Key insight:** The company domain from the job posting = Village enrichment target. Run `node skills/village/enrich.mjs --domain [company-domain]` immediately on score 4+ job signals.

**Phase 2 — Pain Signal Searches (B2B founder sales pain)**
```
"launched but no traction" OR "no one is buying" founder
"can't close deals" OR "pipeline is empty" OR "leads going cold"
"wasting time on cold outreach" OR "outbound takes forever"
"need warm intros" OR "cold email response rate" terrible
"first sales hire" OR "should I hire an SDR" OR "fractional sales"
"B2B sales" AND ("struggling" OR "help" OR "advice" OR "solopreneur")
site:reddit.com/r/sales OR site:reddit.com/r/startups OR site:reddit.com/r/SaaS OR site:reddit.com/r/Entrepreneur OR site:reddit.com/r/b2bmarketing OR site:reddit.com/r/indiehackers OR site:reddit.com/r/fintech OR site:reddit.com/r/devops "SDR" OR "outbound" OR "pipeline" OR "sales help" OR "lead gen"
```

**Phase 3 — Funding & Hiring Signals (HIGH PRIORITY)**

⚠️ **STRICT URL RULE (Web Search Signals):** When a signal comes from a web search result (TechCrunch, Crunchbase, news article, etc.), the `source_url` MUST be the **actual article/post URL returned by the search** (e.g. `https://techcrunch.com/2026/03/09/sphinx-raises-7m-seed/`). NEVER fabricate or guess a company's homepage (e.g. `sphinx.com`) as the source. If you do not have the actual article URL, use the search result snippet URL. If no verifiable URL is available, skip the signal entirely rather than hallucinate one.
⚠️ **STRICT DATE RULE:** If a URL contains a year/month (e.g. /2024/04/03/), YOU MUST REJECT IT if it is not from the current year (2026). Do not output old signals.


These are budget signals. Someone raising or hiring for sales = has money and needs pipeline NOW.

```
site:techcrunch.com "raises" OR "funding" "seed" OR "series A" OR "series B" after:2026-03-01
site:crunchbase.com/organization new funding announced this week
"just raised" OR "announced funding" OR "closed round" "B2B" OR "SaaS" OR "startup"
"hiring" ("SDR" OR "sales development rep" OR "VP Sales" OR "head of sales") "seed" OR "series A"
site:linkedin.com/jobs "SDR" OR "sales development" posted this week startup
site:indeed.com "sales development representative" "startup" OR "early stage" posted this week
"first sales hire" OR "looking for our first SDR" OR "scaling our sales team"
```

**Phase 4 — LinkedIn Signals (via Scrapling)**
If Scrapling is available (`scripts/scrapling-fetch.py`), use it to fetch LinkedIn search results.
Otherwise fall back to web_fetch or skip.

```
site:linkedin.com/posts "looking for sales help" OR "need outbound" founder
site:linkedin.com/posts "just promoted" OR "joined as CEO" OR "expanding to US" B2B
site:linkedin.com/posts "pipeline" OR "lead generation" "struggling" OR "help" founder
site:linkedin.com "no sales team" OR "founder-led sales" OR "doing my own outreach"
```

**Phase 5 — Ecosystem Monitoring**
```
site:producthunt.com AI agent OR automation launched today
site:twitter.com "OpenClaw" -from:openclaw -from:peter_steinberger
"Mac Mini" AI setup OR "local LLM" setup help
"MCP server" integration OR "MCP tools" building
```

**Phase 6 — VC Activity Monitor (NEW — added 2026-03-05)**
VCs announcing active deployment = warm intro channel + intel on what's getting funded.
Use **Grok** for X/Twitter signals first (real-time); fallback to Gemini search.

```
# VCs actively writing checks
"writing checks" OR "actively deploying" OR "open to deals" VC OR "venture capital" this week
"DMs open" OR "pitch me" VC OR investor OR "angel investor" 2026
"looking at deals" OR "deal flow" OR "taking meetings" investor pre-seed OR seed
"just closed fund" OR "fund II" OR "new fund" VC announcement 2026
site:x.com "writing checks" VC OR investor OR fund

# Companies announcing seed funding (buying signal — they now have budget)
"just raised" OR "we raised" OR "announced" "$" million seed OR "pre-seed" 2026
"closed our seed" OR "seed round" OR "raised seed funding" B2B OR SaaS
site:techcrunch.com "seed" OR "pre-seed" raised after:2026-03-01
site:venturebeat.com "seed funding" announced today OR this week
"excited to announce" funding OR "thrilled to share" raise startup

# Accelerator cohorts + deadlines (founders who get in = budget + growth mode = ICP)
"applications open" accelerator OR cohort 2026
"apply now" OR "deadline" YC OR Techstars OR "500 Startups" OR "Entrepreneur First" cohort
"we got into" YC OR Techstars OR accelerator (indicates just funded + scaling)
"just got accepted" OR "excited to join" accelerator cohort
"accelerator" demo day OR "batch" announcing companies 2026
```

**Scoring for Phase 6 signals:**
| Signal | Score |
|---|---|
| VC explicitly writing checks + DMs open | 4 (warm intro opportunity) |
| Company just announced seed raise, B2B, ≤50 employees | 4 (has budget NOW) |
| Company just raised seed + hiring sales | 5 |
| Accelerator accepting applications | 2 (monitor) |
| Founder just got into accelerator | 3 (will have budget soon) |
| Founder just graduated demo day + B2B | 4 |

**For VC signals specifically:** Don't log to `pipeline/signals.md` as a lead — log to `pipeline/investor-signals.md` instead. Tag with `type: vc-writing-checks` and notify Discord with 💰 emoji.

### Step 0.5 — Cross-Reference Against Known Contacts (run BEFORE scoring)

Before scoring any signal, check if the person is already in `contacts.yaml`:

```
1. Read /Users/superhana/.openclaw/workspace/contacts.yaml
2. Search for the person's name, handle, email, or company
3. If FOUND → mark signal as "⚡ KNOWN CONTACT" and boost score by +2
   - Add note: "Already in CRM — warm path exists. Do NOT treat as cold lead."
   - Check their notes for last contact date and relationship context
   - Flag immediately in Discord even if score would otherwise be 3 or below
4. If NOT FOUND → proceed to normal scoring below
```

This prevents re-approaching known contacts as strangers and surfaces warm opportunities that would otherwise be missed.

### Scoring Each Signal

Read `sops/signal-detection.md` and `pipeline/scoring.md` for the full framework. Quick reference:

| Score | Signal Type | Example |
|-------|------------|---------|
| **5** | Explicit ask + budget signal | "Just raised $2M, need to hire our first SDR" or "Looking for AI sales tool, budget $2-3K/mo" |
| **4** | Explicit ask, no budget signal | "Anyone know a good outbound tool?" or "How do you do founder-led sales without burning out?" |
| **3** | Pain signal, indirect | "My pipeline is dry" or "Doing my own prospecting and it's killing me" |
| **2** | Ecosystem signal, unclear intent | "Just installed OpenClaw, pretty cool" |
| **1** | Tangentially related | Retweet of AI news article |

**Budget boosters (+1 to score):**
- Recent funding announcement mentioned
- Job postings visible
- Premium tool usage (Claude Max, paid APIs)
- Conference speaker
- Enterprise client mentions

**ICP Classification (apply to EVERY signal before writing to DB):**
After scoring, assign one of:
- `icp: "Both"` — matches Sprint AND AI Workforce keywords/context
- `icp: "Sprint"` — matches Sprint keywords OR came from a Sprint-only subreddit
- `icp: "AI Workforce"` — matches AI Workforce keywords OR came from an AI Workforce source
- `icp: null` — generic ecosystem/funding signal that matches neither ICP

Note: ICP classification still applies to signals from Phases 3, 5, 6 (funding/VC/ecosystem). A seed-funded insurtech company gets tagged `"AI Workforce"` even if the signal came from Phase 3.

**Sprint score boosters (+1, apply only if Sprint ICP is ACTIVE):**
- Solo founder or team of 2 or fewer
- Mentions MRR in the $10K-$100K range
- Product is live with paying customers
- Expressed urgency specifically about marketing (not just sales/pipeline)

**AI Workforce score boosters (+1, apply only if AI Workforce ICP is ACTIVE):**
- Regulated industry: insurance, financial services, wealth management
- Relationship-driven business model (book of business, renewals mentioned)
- Currently hiring SDR or AE in financial/insurance vertical
- Company size 10-100 employees in professional services

### Output Format

**For each signal found, write to `pipeline/signals.md`:**

```markdown
### [YYYY-MM-DD HH:MM] — [Name] (@handle)
- **Signal**: [Exact quote or description of what they said/did]
- **Source**: [URL to the post/page]
- **Score**: [1-5] [+1 budget boost if applicable]
- **Service fit**: [Sales Intelligence DWY / SDR Replacement / Pipeline Health / Warm Intros / Reconnection / Setup-as-a-Service / Consulting]
- **Context**: [Company, role, follower count, what they're building]
- **Action**: [Log only / Monitor / Begin engagement / Flag for Jenny / Draft DM]
```

**🗄️ Phase 2 Shadow Write (MANDATORY — run after EVERY signal logged to signals.md):**
```bash
node /Users/superhana/.openclaw/workspace/scripts/db-upsert.js signal '{
  "time": "YYYY-MM-DDTHH:MM:00Z",
  "score": N,
  "subreddit": "subreddit_name",
  "icp": "Sprint",
  "source": "signal-scout",
  "payload": {
    "handle": "@handle",
    "signal_text": "quote",
    "source_url": "https://www.reddit.com/r/[subreddit]/comments/[post_id]/[slug]/",  // MUST be the individual post permalink, never the feed URL
    "service_fit": "Sprint",
    "icp": "Sprint"
  }
}'
```
Set `icp` to `"Sprint"`, `"AI Workforce"`, `"Both"`, or `null` based on ICP classification above. Set `service_fit` to match: `"Sprint"` or `"AI Workforce"` for ICP signals; keep legacy values (`"SDR Replacement"`, `"Pipeline Health"`, etc.) for generic signals. `icp` must appear at both the top level and inside `payload`.
This writes to the TimescaleDB `activity_log` hypertable. YAML + DB must stay in sync. Do not skip.

**🔗 Phase 2.5 CRM Match (MANDATORY — run immediately after Phase 2, for every signal):**
```bash
node /Users/superhana/.openclaw/workspace/scripts/crm-signal-match.js \
  --handle "@handle" \
  --signal "Exact signal text or description" \
  --source "reddit|x|hacker-news|linkedin|producthunt|indiehackers" \
  --url "https://source-url" \
  --score N
```

This checks if the poster already exists in `contacts.yaml` + Postgres `contacts` table using fuzzy handle matching (strips `@`, `u/`, `r/` prefixes before comparing). If a match is found:
- `contacts.yaml`: `last_signal` (ISO date) and `signal_count` (incremented)
- Postgres `contacts`: `last_signal = NOW()`, `signal_count++`
- Postgres `activity_log`: inserts row with `event_type = 'signal_match'`

Output will be JSON — if `matched: true`, prepend **⚡ KNOWN CONTACT** to the signal log entry and boost score by +2 (as per Step 0.5). This replaces the manual YAML cross-reference in Step 0.5 — the script handles it automatically.

**For score 4-5 signals, also:**
1. Create `pipeline/warming/[handle].md` using the template from `sops/signal-detection.md`
2. **Immediately run Village enrichment** to find warm intro paths:
   ```
   node skills/village/enrich.mjs --domain [company-domain] 2>/dev/null
   ```
   If enrichment returns intro paths, add them to the warming file under `## Warm Intro Paths`.
   If Village fails or returns nothing, note "No Village data — manual intro research needed."
   Do NOT block the rest of the flow if Village is slow or errors.
3. Create `relationships/[handle].md` as a relationship stub (handoff to Relationship Monitor). Use this template:
   ```
   # [Name] — Relationship Stub
   source: signal-scout
   score: [score]
   warming_file: pipeline/warming/[handle].md
   status: warming
   created: [date]
   next_action: relationship-monitor
   ```
   **This stub is the handoff to Relationship Monitor. Without it, Monitor never sees the lead.** If `relationships/[handle].md` already exists, update the `score` and `warming_file` fields instead.
4. Announce in Discord channel `824304330340827198` (#general) using the message tool with `channel=discord` and `target=channel:824304330340827198`. Use this format:

```
🚨 Signal Scout — Hot Lead Detected

**[Name]** (@handle) — Score: [X]/5
💬 "[Exact signal quote]"
🏢 [Company/what they're building]
🎯 Service fit: [which service]
📍 Source: [direct post permalink — e.g. https://reddit.com/r/startups/comments/abc123/title — NEVER the feed URL]

Suggested action: [engagement recommendation]
```

**CRITICAL: You MUST include an interactive button on this Discord message for the "Crawl & Draft" workflow.**
When calling the `message` tool, include a `components` block:
```json
"components": {
  "reusable": true,
  "blocks": [
    {
      "type": "actions",
      "buttons": [
        {
          "label": "Crawl & Draft",
          "style": "primary",
          "emoji": { "name": "🕷️" }
        }
      ]
    }
  ]
}
```
*(When Yohann clicks this button, the main OpenClaw agent will wake up, read the lead details from your message, and POST them to the n8n Omnichannel Webhook to auto-draft the outreach.)*

### What NOT to Do
- Don't engage directly with anyone. Signal Scout only detects and reports.
- Don't DM anyone. That's Jenny's job or a separate outreach workflow.
- Don't create signals for obvious spam, bot accounts, or joke posts.
- Don't re-log signals already in `pipeline/seen-handles.txt` (check this lean index — do NOT load full signals.md for dedup).
- Don't log signals older than 48 hours — freshness matters.

### After Each Scan
1. Write a brief scan summary to `daily/standup.md`:
   ```
   ## Signal Scout — [Date] [Time]
   - Queries run: [X] across 5 phases
   - Signals found: [X] total
   - Score 4-5 (hot): [X] — [brief description]
   - Score 3 (monitoring): [X]
   - Score 1-2 (logged): [X]
   - ⚡ Known contacts detected: [X] — [names]
   - 💰 Funding/hiring signals: [X]
   - 🔗 Village enrichment run: [X] (Y returned intro paths)
   - 💰 Seed funding announcements: [X] — [company names if score 4+]
   - 🏦 VC writing-checks signals: [X] — [names, logged to investor-signals.md]
   - 🚀 Accelerator signals: [X] (deadlines/acceptances/demo days)
   - New warming files created: [X]
   - 🎯 Sprint signals: [X] (score 4+: [X])
   - 🤖 AI Workforce signals: [X] (score 4+: [X])
   ```
2. If no signals found, still log: "Signal Scout ran at [time]. No new signals detected."
3. **Append a `## Lessons` section to standup.md if anything noteworthy happened this run:**
   ```
   ## Lessons — Signal Scout [Date] [Time]
   - [YYYY-MM-DD] [signal-scout] [low/med/high] — [what happened / what was learned] — promote to: [SOP / MEMORY / both / log-only]
   ```
   Examples of what to log: tool failures and how you recovered, new signal patterns emerging, scoring edge cases, ICP shifts observed. If nothing noteworthy, omit this section entirely (don't write "no lessons" — just skip it).
   **Urgent lessons (severity: high)** must also be appended to the `## 🚨 Promotion Queue` in `context/lessons-learned.md` — don't wait for the Friday sweep.
3. **Run the Auto-Deck refresh** (bi-weekly per brand, throttled internally):
   ```
   node /Users/superhana/.openclaw/workspace/scripts/deck-refresh.js
   ```
   - Script checks each brand's last deck date against a 14-day gate
   - Generates new Gamma deck if due; skips if not
   - Updates `output/deck-registry.json` with new URLs and credit count
   - On first run after a new brand is added: generates immediately regardless of date

### Weekly Rollup (Sundays at 9 AM)
A separate weekly cron job summarizes the week:
- Total signals detected
- Signals by score tier
- Signals by service fit
- Top 3 hottest leads of the week
- Warming pipeline status (how many in each stage)
- Update the Weekly Signal Summary section of `pipeline/signals.md`

## Troubleshooting

**No results from searches:**
Try broader queries. Remove quotes around multi-word phrases. Search for just the pain keyword without site restrictions.

**Too many low-quality results:**
Tighten the time range to "past 24 hours" explicitly. Add "founder" or "startup" or "building" to filter out casual mentions.

**Duplicate signals:**
Check `pipeline/seen-handles.txt` — one handle per line. If the handle is already listed, skip. Do NOT read `pipeline/signals.md` for duplicate checks (too large, causes timeouts). After logging a new signal, append the handle to `pipeline/seen-handles.txt`.

**Scan takes too long:**
Skip Phase 3 (ecosystem) if Phase 1 and 2 already produced 5+ actionable signals. Quality over completeness.

