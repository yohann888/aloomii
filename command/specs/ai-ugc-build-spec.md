# AI UGC Script Generator — Build Spec

## Overview
Add an "AI UGC" tab to the Content section of the Aloomii Command Center. This feature generates short-form UGC video scripts based on Aloomii's pain point research (from `reddit_pain` DB table) using the attached screenwriter prompt. The user fills in missing variables via a form, the job is queued to an opus subagent, and the result displays as a copyable script.

## User Flow
1. User navigates to Content → AI UGC tab
2. Sees a form with:
   - **Pain Point selector** — dropdown populated from top `reddit_pain` signals (severity 4+, last 7 days, grouped by ICP)
   - **Character variables** — name, age, occupation, life stage, location
   - **Script length** — 30s / 45s / 60s radio buttons
   - **POV lens** — dropdown (confession, rant, friend tip-off, reluctant convert, etc.)
   - **Brand/Product** — text field (defaults to "Aloomii")
   - **CTA destination** — text field (URL or handle)
3. Clicks "Generate Script"
4. Job queued to opus subagent with filled prompt
5. Returns: full script + 3 alternate hooks + 2 alternate CTAs + subtext line
6. One-click copy button for the script

## UI Placement
- **Location:** Content section, new tab after "All Content"
- **Tab label:** "AI UGC"
- **Tab order:** LinkedIn Drafts | Snipes | PBN Briefs | All Content | **AI UGC**

## Technical Architecture

### 1. Frontend Changes (`command/app.js`)
Add `renderAiUgc()` function:
- Render form with pain point dropdown (populated from `/api/pain-signals`)
- Render generation button
- Render result panel (hidden until job completes)
- One-click copy functionality

### 2. Frontend Changes (`command/index.html`)
Add new tab button and content panel in the Content section:
```html
<button class="tab-btn" onclick="switchContentTab(4)">AI UGC</button>
```
Add `<div id="ai-ugc-panel" class="content-panel">` with form structure.

### 3. Backend Changes (`command-api.js`)
Add new API endpoints:
- `GET /api/pain-signals` — fetch top pain signals from `reddit_pain` table (severity 4+, last 7 days, grouped by ICP)
- `POST /api/ugc/generate` — accept form data, spawn opus subagent with constructed prompt
- `GET /api/ugc/status/:jobId` — poll for job completion

### 4. Subagent Integration
- Use `sessions_spawn` with `model: anthropic/claude-opus-4-7` (opus)
- Construct prompt by filling template variables from form data + pain point research
- Timeout: 120 seconds
- Delivery: Return script text to parent session

### 5. Database
No schema changes needed. Reads from existing `reddit_pain` table.

## Prompt Construction
The opus subagent receives the full screenwriter prompt (saved in Obsidian) with variables filled in:

```
# ROLE
[screenwriter prompt from Obsidian]

# CHARACTER
- Identity: {{name}}, {{age}}, {{occupation}}, {{life_stage}}, {{location}}
- Personality: {{personality_traits}}
- Speech DNA: {{vocabulary_level}}, {{verbal_tics}}, {{cadence}}
- Emotional state: {{emotional_state}}

# THE PAIN (from DB research)
- Surface pain: {{pain_surface}}
- Deeper pain: {{pain_deep}}
- Duration: {{pain_duration}}
- Failed attempts: {{pain_attempts}}
- Concrete cost: {{pain_cost}}
- Hidden shame: {{pain_shame}}

# THE STORY ANGLE
- POV lens: {{pov_lens}}
- Inciting moment: {{inciting_moment}}
- The turn: {{the_turn}}
- The payoff: {{payoff}}
- The topic: {{topic}}

# THE CALL TO ACTION
- Destination: {{cta_destination}}
- Tone: {{cta_tone}}

# OUTPUT SPEC
Write a {{script_length}}-second monologue (~{{word_count}} words).
```

## Files to Modify
1. `command/index.html` — Add AI UGC tab button and panel
2. `command/app.js` — Add `renderAiUgc()`, `generateUgcScript()`, copy functionality
3. `scripts/dashboard/command-api.js` — Add pain signal endpoint and UGC generation endpoint
4. New: `scripts/ugc/ugc-prompt-builder.js` — Helper to construct prompts from DB data

## Acceptance Criteria
- [ ] AI UGC tab visible in Content section
- [ ] Pain point dropdown populates from real `reddit_pain` data
- [ ] Form validates all required fields before submission
- [ ] Opus subagent receives correctly formatted prompt
- [ ] Result displays within 60 seconds of submission
- [ ] One-click copy button works for the main script
- [ ] Alternate hooks and CTAs displayed in collapsible sections
- [ ] Error handling for subagent timeout or failure

## Dependencies
- Opus subagent access (`anthropic/claude-opus-4-7`)
- Existing `reddit_pain` table with signals
- Obsidian vault access (prompt already saved)
- Command Center auth (existing)
