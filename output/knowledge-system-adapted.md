# The Aloomii Knowledge System: Adapted from the Second Brain Model

**Original:** "Claude + Obsidian + N8N + Readwise" knowledge management system
**Adapted for:** Aloomii's OpenClaw runtime, PostgreSQL DB, Discord interface, and cron fleet

---

## WHY MOST KNOWLEDGE SYSTEMS FAIL

The promise of a knowledge system is that you will never lose a good signal again. The reality: you set up monitoring, add contacts for two weeks, and then stop checking because nothing useful ever comes back out.

The failure mode is always the same. The system is designed for input. Nobody designs for output.

**Three reasons this happens — all fixable:**

**First: capture friction.** If adding a contact, a signal, or a note takes more than 10 seconds of manual effort, you will stop doing it under cognitive load. Most capture workflows involve copying, pasting, tagging, categorizing — all before you have processed what you just found. By the time the friction is high enough, the habit breaks.

**Second: no connection layer.** Most CRMs are collections of isolated contacts. Each lead lives in its own row. Each signal sits in its own table. There is no mechanism that looks across everything and says: this person you met in March connects directly to this deal you are working on today. Without that layer the CRM is a phone book with no intelligence.

**Third: no reason to return.** If your system does not push insights back to you, you have to remember to pull them. Nobody remembers. The DB becomes something you add to occasionally and query only when you are actively searching for something specific. That is not a thinking partner. That is a filing cabinet.

A knowledge system that never talks back is not a system. It is a very organized way to forget things.

---

## THE ARCHITECTURE: FOUR LAYERS THAT WORK TOGETHER

Every piece of software in this system serves exactly one function. Nothing overlaps. Everything flows in one direction.

**Layer 1: Capture.** Every tool that brings information into the system without manual typing.
- `signal-scout` — Reddit pain/mood extraction, web search, RSS monitoring
- `village-enrich` — CRM contact enrichment, warm path discovery
- `content-engine` — LinkedIn drafts, TikTok scripts, blog posts
- `mood-extractor` — Vibrnt emotional signal extraction from Reddit
- `call-analysis` — Meeting transcription, insight extraction, follow-up generation
- Discord messages — Quick capture, decisions, feedback

Nothing in this layer requires categorizing, tagging, or summarizing. Raw signal in. Nothing else.

**Layer 2: The Pipeline.** OpenClaw cron fleet watches each capture source and routes new content into the PostgreSQL DB. No manual filing. No copy-pasting. A new Reddit pain signal appears and within minutes it is in the `signals` table with ICP matching, severity scoring, and suggested action.

**Layer 3: The Database.** PostgreSQL is the single source of truth. Everything lives here. Tables: `contacts`, `signals`, `activities`, `mood_signals`, `events`, `opportunities`. The DB is the ground truth. Files (MEMORY.md, daily notes) are the narrative layer — they tell the story, but the DB decides what is real.

**Layer 4: Intelligence.** OpenClaw agents (kimi-k2.6:cloud, gemini, deepseek-v4-pro) read the DB, find connections, surface patterns, write the daily brief, answer questions about your pipeline. This is the layer that makes the DB a thinking partner instead of an archive.

---

## STEP ONE: AUTOMATED CAPTURE WITHOUT FRICTION

The capture layer has one job: collect everything without asking anything of you.

**Reddit and web signals:** `signal-scout` runs on cron. Monitors target subreddits, extracts pain points and mood signals, scores them against ICP definitions, writes to DB. You do nothing. No tagging. No manual review before storage. The signal lands in the DB with full context.

**CRM enrichment:** `village-enrich` runs on cron. Takes new contacts, enriches with Village.do data, finds warm introduction paths, updates relationship scores. No manual lookup. No copy-pasting LinkedIn URLs.

**Content creation:** `content-engine` runs on cron. Generates LinkedIn drafts from signals, podcast booking outreach from episode plans, competitor analysis from web search. Drafts land in the DB with status `draft` for human review before publish.

**Emotional signals:** `mood-extractor` runs on cron. Reads Reddit posts, extracts emotional patterns, maps to Vibrnt shirt designs, writes to `mood_signals` table. No manual reading of subreddits.

**Call intelligence:** `call-analysis` runs after every recorded meeting. Whisper transcribes. Sonnet extracts insights, action items, follow-up emails. Everything lands in the DB linked to the contact.

**Quick capture from Discord:** Tag `@aloomiibot` with a decision, a contact update, or a task. The agent writes it to the correct memory file and updates the DB. Takes 5 seconds. No context switching.

---

## STEP TWO: THE DATABASE STRUCTURE THAT SCALES

The DB schema determines how well the intelligence layer can navigate it. Five tables. That is the core structure.

| Table | Purpose |
|---|---|
| `contacts` | People. The center of everything. Linked to signals, activities, opportunities. |
| `signals` | Pain points, buying signals, warm paths. Scored by severity and ICP fit. |
| `activities` | Touchpoints — calls, emails, meetings, LinkedIn interactions. Linked to contacts. |
| `mood_signals` | Emotional patterns for Vibrnt. Extracted from Reddit. Linked to shirt designs. |
| `events` | Conferences, meetups, webinars. Linked to contacts who are attending or speaking. |

**One rule:** When in doubt, write to `signals`. The signal scout cron will classify it later.

The simplicity is intentional. Every complex schema eventually collapses under its own weight because you stop knowing which table something belongs in and the capture friction rises until the system breaks. Five tables. One rule.

---

## STEP THREE: THE AGENTS.md FILE THAT MAKES EVERYTHING WORK

This is the most important file in the entire system. Without it, every session starts cold — no context about who Aloomii is, what the pipeline looks like, or what you want from the agent.

`AGENTS.md` is the instruction layer. OpenClaw loads it into context on every session. It tells the agent:

```markdown
# AGENTS.md - Your Workspace

## Identity
You are Leo, Chief of Staff for Aloomii. Direct. Warm but not soft.

## Memory Routing
- Tech stack, paths, configs → `memory/tech-stack.md`
- Decisions with rationale → `memory/decisions-log.md`
- Cron fleet status → `memory/cron-fleet.md`
- Daily logs → `memory/YYYY-MM-DD.md`

## Single Source of Truth
PostgreSQL DB is master record as of 2026-03-01. Files are narrative. DB decides what is real.

## Safety
- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- `trash` > `rm`
- When in doubt, ask.

## External vs Internal
Do freely: Read files, explore, search the web, work within workspace.
Ask first: Sending emails, public posts, anything that leaves the machine.
```

**Update the operational sections every Monday morning.** Five minutes. This single habit is what keeps the agent's context accurate as the business evolves. A stale `AGENTS.md` produces stale answers.

---

## STEP FOUR: THE DAILY BRIEF THAT RUNS AUTOMATICALLY

Every morning before you open a single app, the system briefs you. New signals found overnight. Patterns across this week's captures. The one contact worth reaching out to today.

You do not request this brief. It runs automatically through the `nightly-audit` cron. By the time you sit down to work it is already in `memory/YYYY-MM-DD.md` and posted to Discord if there are hot signals.

**The nightly-audit cron prompt:**

```
You are the Chief of Staff for Aloomii. Read the last 24 hours of signals from the DB.

Then do three things:

CONNECTIONS — Find the 3 most interesting connections between recent signals and older contacts or deals. Be specific. Quote the relevant passages from the DB.

PATTERN — Identify one pattern across everything the scouts found this week. What is the market clearly working on even if we have not said it explicitly?

ACTION — Give me one contact worth reaching out to today based on the pattern. Not a task list. One person. One reason. One suggested message.

Write this as a clean markdown file. Save to memory/YYYY-MM-DD.md.
```

Set this to run every weekday at 6 AM. Read it before you open anything else.

---

## STEP FIVE: THE WEEKLY SYNTHESIS

Once a week, run a deeper synthesis. Fifteen minutes. Sit with the agent and talk about what the system has been building toward.

**The weekly synthesis prompt:**

```
Read the entire week's activity from the DB. Focus on signals, contacts touched, and opportunities moved.

I want four things:

EMERGING THESIS — What opportunity is forming in our pipeline without having been stated explicitly? What position is the market taking?

CONTRADICTIONS — What have we learned recently that contradicts something we believed before? Show both sides from our own data.

KNOWLEDGE GAPS — Based on what the scouts are finding, what are we clearly not monitoring that we should be? What ICP or channel is missing?

ONE ACTION — Given everything in the DB, what is the single highest-leverage outreach or content piece we could execute this week?

Be direct. Challenge assumptions. Do not summarize what we already know.
```

The synthesis session is where the real compounding happens. The daily brief surfaces connections. The weekly synthesis builds a thesis. Over six months of weekly sessions you will have a record of how your pipeline evolved — every assumption you held and changed, every signal that started small and grew into a deal.

---

## THE COMPOUND EFFECT NOBODY TALKS ABOUT

At one month the system feels like a useful tool. You are capturing more signals, losing fewer leads, and the daily brief occasionally surfaces something interesting.

At three months it starts feeling different. The agent begins connecting things from month one to things from month three. You ask a question about a current prospect and it finds the relevant signal from eight weeks ago that you had completely forgotten. The system knows things about your pipeline that you do not consciously remember.

At six months it is something else entirely. You have a record of every belief you held and changed. Every signal you were tracking and the deal that eventually emerged. Every pattern that showed up in the market before you consciously recognized it as an opportunity.

The agent you have after six months is not the same one you started with. It has been reading your pipeline while you were busy living your life.

This is the compound interest of your own business intelligence. Most data never compounds because it sits in isolation. This system makes those connections automatically. Every signal you capture joins a growing network of intelligence that the agent can navigate on your behalf.

Your competitor who starts this system six months after you is not just behind on the setup. They are behind on six months of connections, patterns, and synthesis that make the system genuinely intelligent about your specific market. That gap does not close by working harder. It only closes by starting earlier.

---

## THE FULL SETUP SEQUENCE

**01 — Confirm the five-table schema in PostgreSQL**
`contacts`, `signals`, `activities`, `mood_signals`, `events`. Add columns as needed but do not add tables until the existing ones are at capacity. Start simple and let the schema evolve from actual usage.

**02 — Wire capture agents to the DB**
`signal-scout`, `village-enrich`, `content-engine`, `mood-extractor`, `call-analysis`. Each writes to the correct table. No agent writes to files directly except for logs.

**03 — Build the Discord quick capture habit**
Tag `@aloomiibot` with decisions, contact updates, and tasks. The agent routes to the correct memory file and updates the DB. Takes 5 seconds per capture. No context switching.

**04 — Write your AGENTS.md file**
Use the template above. Be specific and honest. The quality of the agent's output is directly proportional to the quality of the context you give it in this file.

**05 — Set up the nightly-audit cron**
Schedule the brief prompt to run every weekday at 6 AM. Output goes to `memory/YYYY-MM-DD.md`. Hot signals (severity 4+) get posted to Discord automatically.

**06 — Block 15 minutes every Monday for the weekly synthesis**
Put it in your calendar now. This is the session where compounding actually happens. Do not skip it in week two because the pipeline feels too empty. The pipeline is never too empty to find something worth acting on.

---

## START WITH FIVE SIGNALS

The most common reason people never build this system is that it feels like too much to set up at once.

Start smaller. Today, put five signals in the DB. Anything — five Reddit posts worth tracking, five contacts you have been meaning to reach out to, five competitors you should be monitoring. Ask the agent to find connections across those five signals.

It will find something you missed. It always does. That moment — when the agent surfaces a connection between two things you thought were completely unrelated — is the moment the system stops being a concept and starts being something you want to feed every day.

Start with five signals tonight. The system does the rest.

---

## SPECIFIC RECOMMENDATIONS FOR ALOOMII

### 1. Improve the Current Memory System

**Current state:** MEMORY.md + daily notes in `memory/`. Good narrative layer. Bad at being queryable.

**Problems:**
- MEMORY.md is capped at 250 lines. Overflow goes to subdomain files that are not auto-loaded.
- Daily notes are chronological, not relational. Finding "what did we decide about X?" requires grep.
- No automated cross-referencing between daily notes and DB state.

**Recommendations:**
- Add a `decisions` table to PostgreSQL. Every decision gets a row: `decision_id`, `date`, `context`, `rationale`, `reversibility`, `owner`. Link to `memory/decisions-log.md` for narrative.
- Build a `memory_search` agent that queries both DB and markdown files. When you ask "what did we decide about wrangler?" it checks the decisions table first, then falls back to grep on memory files.
- Auto-tag daily notes with DB entities. When a daily note mentions a contact name that exists in the `contacts` table, link it automatically.

### 2. Add a "Daily Brief" Cron

**Current state:** `nightly-audit` runs but focuses on metrics and spend. Not on pipeline intelligence.

**What to add:**
- New cron: `daily-brief` (6 AM, weekdays)
- Reads: last 24h signals, last 7 days activities, contacts with no touch in 14 days
- Outputs: `memory/daily-brief/YYYY-MM-DD.md` + Discord post if hot signals exist
- Prompt: "Find 3 connections between recent signals and older contacts. Identify 1 pattern. Suggest 1 outreach action."

**Implementation:**
```sql
-- Query for the brief
SELECT s.*, c.name, c.company, c.tier 
FROM signals s 
JOIN contacts c ON s.contact_id = c.id 
WHERE s.created_at > NOW() - INTERVAL '24 hours'
ORDER BY s.severity DESC 
LIMIT 10;
```

### 3. Add a "Weekly Synthesis" Cron

**Current state:** No automated weekly review. Synthesis happens ad-hoc when you ask.

**What to add:**
- New cron: `weekly-synthesis` (Monday 7 AM)
- Reads: last 7 days of everything — signals, activities, mood signals, content drafts
- Outputs: `memory/weekly-synthesis/YYYY-WXX.md`
- Prompt: "Emerging thesis, contradictions, knowledge gaps, one action."

**Key difference from daily brief:** The weekly synthesis looks for *formation* — what is the pipeline building toward? The daily brief looks for *execution* — what do I do today?

### 4. Reduce Capture Friction

**Current friction points:**
- Adding a contact requires: Village lookup → manual DB insert → memory file update. 3 steps.
- Saving a signal requires: Reddit read → manual scoring → DB insert. 2 steps.
- Decision logging requires: Discord message → agent parses → memory file. 1 step but inconsistent.

**Reduction strategies:**
- **Contact capture:** Build a `!contact` Discord command. Paste a LinkedIn URL. Agent does Village lookup, DB insert, memory update. One step.
- **Signal capture:** Signal-scout already auto-captures from Reddit. Extend to auto-capture from Discord mentions. If you paste a Reddit URL in Discord, the agent extracts and scores it automatically.
- **Decision capture:** Every Discord thread where you say "decided" or "let's go with" gets auto-logged to the decisions table. No command needed.

### 5. Make the DB the Center (Files as Narrative)

**Current state:** Files are primary (AGENTS.md, MEMORY.md, daily notes). DB is secondary (queried when needed).

**Target state:** DB is primary. Files are the narrative layer — they tell the story, but the DB decides what is real.

**Migration path:**
- Phase 1 (now): Every agent that writes to a file also writes to the DB. Duplicate for 30 days.
- Phase 2 (week 2): Agents read from DB first, fall back to files. Daily brief pulls from DB.
- Phase 3 (month 1): Files become read-only narrative. All operational state lives in DB. Files are for humans, not agents.

**One exception:** `AGENTS.md` stays as a file. It is the instruction layer, not operational data. It needs to be human-editable and version-controlled.

**Verification:** At month 1, you should be able to answer any operational question from the DB alone. "How many tier 1 contacts have we not touched in 30 days?" → SQL query. Not grep on memory files.

---

*Adapted from the "Claude + Obsidian" second brain model by [source author] for Aloomii's OpenClaw runtime.*
