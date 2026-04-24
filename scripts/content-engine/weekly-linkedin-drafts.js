#!/usr/bin/env node
/**
 * weekly-linkedin-drafts.js
 *
 * Generates 3 LinkedIn draft posts every Monday and pushes to Buffer.
 *
 * Post set:
 *   Post 1 — Yohann Calpu  (founder/GTM angle, Contrarian Teardown or Saveable List)
 *   Post 2 — Jenny Calpu   (creative/AI angle, Curious Creator or Story Arc)
 *   Post 3 — Yohann Calpu  (second post, different template + anecdote)
 *
 * Flow:
 *   1. Load signal scout data (score 4-5, last 5 signals)
 *   2. Pull trending GTM/founder topic via Sonnet 4.6 with web grounding prompt
 *   3. For each of 6 posts: pick author, pick template, pick anecdote, generate with Sonnet 4.6
 *   4. Push all 3 to Buffer as drafts
 *   5. Alert Discord with previews
 *   6. Update rotation state
 *
 * Usage: node scripts/content-engine/weekly-linkedin-drafts.js [--dry-run]
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const { randomUUID } = require('crypto');
const { Client } = require('pg');
const { runHookLoop } = require('./hook-loop');

// ── Config ─────────────────────────────────────────────────────────────────────

const WORKSPACE = path.resolve(__dirname, '../..');
const OPENCLAW_WORKSPACE = path.join(process.env.HOME, '.openclaw/workspace');

const YOHANN_ANECDOTES_FILE  = fs.existsSync(path.join(WORKSPACE, 'content/anecdotes.json')) ? path.join(WORKSPACE, 'content/anecdotes.json') : path.join(OPENCLAW_WORKSPACE, 'content/anecdotes.json');
const JENNY_ANECDOTES_FILE   = fs.existsSync(path.join(WORKSPACE, 'content/jenny-anecdotes.json')) ? path.join(WORKSPACE, 'content/jenny-anecdotes.json') : path.join(OPENCLAW_WORKSPACE, 'content/jenny-anecdotes.json');
const YOHANN_VOICE_FILE      = fs.existsSync(path.join(WORKSPACE, 'config/voice-profiles/yohann-calpu.yaml')) ? path.join(WORKSPACE, 'config/voice-profiles/yohann-calpu.yaml') : path.join(OPENCLAW_WORKSPACE, 'config/voice-profiles/yohann-calpu.yaml');
const JENNY_VOICE_FILE       = fs.existsSync(path.join(WORKSPACE, 'config/voice-profiles/jenny-calpu.yaml')) ? path.join(WORKSPACE, 'config/voice-profiles/jenny-calpu.yaml') : path.join(OPENCLAW_WORKSPACE, 'config/voice-profiles/jenny-calpu.yaml');
const DB_URL                 = 'postgresql://superhana@localhost:5432/aloomii';
const STATE_FILE             = fs.existsSync(path.join(WORKSPACE, 'memory')) ? path.join(WORKSPACE, 'memory/content-engine-state.json') : path.join(OPENCLAW_WORKSPACE, 'memory/content-engine-state.json');
const SIGNALS_FILE           = fs.existsSync(path.join(WORKSPACE, 'pipeline/signals.md')) ? path.join(WORKSPACE, 'pipeline/signals.md') : path.join(OPENCLAW_WORKSPACE, 'pipeline/signals.md');
const LOG_FILE               = fs.existsSync(path.join(WORKSPACE, 'logs')) ? path.join(WORKSPACE, 'logs/weekly-linkedin-drafts.log') : path.join(OPENCLAW_WORKSPACE, 'logs/weekly-linkedin-drafts.log');

const BUFFER_API_KEY         = 'GkB7cingsMpgX-DpfbRwdqAN1Spir8QxeEe7gp_9Jn1';
const BUFFER_ENDPOINT        = 'https://api.buffer.com/graphql';
const YOHANN_LINKEDIN_ID     = '69c5d74baf47dacb695bff50'; // LinkedIn personal — Yohann Calpu
const JENNY_LINKEDIN_ID      = null; // TODO: add Jenny's Buffer LinkedIn channel ID when connected

const DISCORD_CHANNEL_ID     = '824304330340827198';
const DRY_RUN                = process.argv.includes('--dry-run');

// ── Yohann templates ───────────────────────────────────────────────────────────

const YOHANN_TEMPLATES = [
  {
    id: 'contrarian-teardown',
    name: 'Contrarian Teardown',
    instructions: `Write a LinkedIn post using the Contrarian Teardown formula.
Structure:
- Hook (1-2 lines): A statement that sounds wrong but is true. Start with the claim, not the setup.
- Tension (2-3 lines): Why most people get this wrong. Specific, not generic.
- Story bridge (3-5 lines): Connect to the personal anecdote naturally — not forced.
- The lesson (2-3 lines): What you actually learned. Specific.
- Framework (3-5 bullet points starting with →): The actionable system.
- Closing question: One specific open question that invites a real answer.
Length: 200-280 words. No em dashes. No hashtags. No hollow openers.`,
  },
  {
    id: 'saveable-list',
    name: 'Saveable List',
    instructions: `Write a LinkedIn post using the Saveable List formula.
Structure:
- Hook (1-2 lines): Promise a specific useful list. Make it sound worth saving.
- Context (2-3 lines): Why this list matters right now. Connect to the trending topic.
- The list (5-7 items, each 1-2 sentences): Specific, actionable, no filler.
- Story tie-in (2-3 lines): Where this came from — the personal anecdote.
- Closing: "Save this for when you need it." or similar.
Length: 220-300 words. No em dashes. No hashtags.`,
  },
  {
    id: 'founder-confession',
    name: 'Founder Confession',
    instructions: `Write a LinkedIn post using the Founder Confession formula.
Structure:
- Hook (1 line): Admit something counterintuitive or embarrassing. True, specific.
- Setup (2-3 lines): The context — what you believed or did wrong.
- The turn (3-4 lines): What actually happened. Use the personal anecdote here.
- The reframe (2-3 lines): What you'd do differently now. The real lesson.
- Invitation (1-2 lines): Ask readers if they've experienced the same thing.
Length: 180-250 words. No em dashes. No hashtags. Vulnerable, not self-pitying.`,
  },
  {
    id: 'data-story',
    name: 'Data + Story',
    instructions: `Write a LinkedIn post using the Data + Story formula.
Structure:
- Hook (1-2 lines): Start with a specific number or stat that surprises.
- What it means (2-3 lines): What this data actually tells us. Not obvious.
- Story (3-5 lines): The personal anecdote that proves or challenges the data.
- Pattern (2-3 lines): What you see repeatedly that the data confirms.
- Question (1 line): What does this change about how you work?
Length: 200-270 words. No em dashes. No hashtags.`,
  },
];

// ── Jenny templates ────────────────────────────────────────────────────────────

const JENNY_TEMPLATES = [
  {
    id: 'curious-creator',
    name: 'Curious Creator',
    instructions: `Write a LinkedIn post using Jenny Calpu's Curious Creator formula.
Jenny's voice: warm, exploratory, unafraid to show she's still learning. She invites the reader in rather than lecturing. Thinks in images and craft details.
Structure:
- Hook (1-2 lines): A specific observation about something she noticed — in AI, design, production, or creativity. Not a big claim, a real detail.
- Exploration (3-4 lines): What she was doing, what surprised her, what she noticed about the craft. Personal, present-tense.
- The "why it matters" (2-3 lines): Connect to the broader creative/AI moment without over-claiming.
- Honest note (1-2 lines): What she doesn't know yet, or what she's still figuring out.
- Invitation (1-2 lines): A genuine question inviting the reader to share their experience.
Length: 180-240 words. Warm. Parenthetical asides welcome. No corporate language. No hollow openers.`,
  },
  {
    id: 'before-after-craft',
    name: 'Before/After Craft',
    instructions: `Write a LinkedIn post using Jenny Calpu's Before/After Craft formula.
Jenny's voice: specific about visual/audio craft details, honest about what works and what doesn't.
Structure:
- Hook (1-2 lines): The "before" — how content used to be made, or how she used to think about it.
- The shift (2-3 lines): What changed — a tool, a technique, an insight. Specific and concrete.
- The craft detail (3-4 lines): What the actual difference looks/sounds/feels like. Name the specific thing — the sound design element, the AI prompt approach, the editing choice.
- Honest limitation (1-2 lines): What still isn't perfect. She always notes this.
- Question (1 line): "What changed how you approach [X]?"
Length: 180-240 words. Sensory language welcome. No jargon.`,
  },
  {
    id: 'behind-the-work',
    name: 'Behind the Work',
    instructions: `Write a LinkedIn post using Jenny Calpu's Behind the Work formula.
Jenny's voice: invites readers into her actual creative process, not a polished result reel.
Structure:
- Hook: "Here's what actually went into [something specific]." Direct, specific.
- The process (4-5 lines): Step by step, what she actually did. Real tools, real decisions, real trade-offs. Include one thing that didn't work.
- What the goal was (1-2 lines): The emotional or aesthetic aim — not the technical spec.
- The result (1-2 lines): Honest assessment. "It worked. Here's why." or "It was close, but not quite."
- Invitation: Invite people to ask questions or share their approach.
Length: 200-260 words. First-person, process-focused. Parenthetical asides welcome.`,
  },
];

// ── Utilities ──────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function loadJSON(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function loadState() {
  const s = loadJSON(STATE_FILE);
  return s || {
    yohannTemplateIndex: 0,
    jennyTemplateIndex: 0,
    lastRun: null,
    lastYohannAnecdote: null,
    lastJennyAnecdote: null,
    lastYohannBufferIds: [],
    lastJennyBufferId: null,
  };
}

function getGoogleApiKey() {
  const config = loadJSON(path.join(process.env.HOME, '.openclaw/openclaw.json'));
  return config?.models?.providers?.google?.apiKey;
}

async function getBrandProfile(owner, fallbackFile) {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT id, owner, display_name, archetypes, core_position, creation_myth, phraseology, channels, behaviors, maven_blocks, metadata
       FROM brand_profiles WHERE owner = $1 LIMIT 1`,
      [owner]
    );
    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        id: row.id,
        owner: row.owner,
        displayName: row.display_name,
        voiceText: JSON.stringify(row, null, 2)
      };
    }
  } catch (e) {
    log(`[WARN] brand_profiles lookup failed for ${owner}: ${e.message}`);
  } finally {
    try { await client.end(); } catch {}
  }

  return {
    id: null,
    owner,
    displayName: owner,
    voiceText: fs.readFileSync(fallbackFile, 'utf8')
  };
}

async function getRelevantHooks(owner) {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT hook_text, linkedin_opener, topic_tag, pain_type, hook_confidence
       FROM content_hooks
       WHERE (brand_persona = $1 OR brand_persona = 'both' OR brand_persona IS NULL)
       ORDER BY hook_confidence DESC NULLS LAST, created_at DESC
       LIMIT 5`,
      [owner]
    );
    return res.rows;
  } finally {
    try { await client.end(); } catch {}
  }
}

function getAnthropicApiKey() {
  try {
    const profiles = loadJSON(path.join(process.env.HOME, '.openclaw/agents/main/agent/auth-profiles.json'));
    const key = profiles?.profiles?.['anthropic:default']?.key;
    if (key) return key;
  } catch {}
  const config = loadJSON(path.join(process.env.HOME, '.openclaw/openclaw.json'));
  return config?.models?.providers?.anthropic?.apiKey;
}

async function generateWithGemini(prompt, apiKey, maxTokens = 2000) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.8,
    }
  };

  const res = await httpPost(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=' + apiKey,
    { 'Content-Type': 'application/json' },
    body
  );

  const text = res?.candidates?.[0]?.content?.parts
    ?.filter(part => part?.text)
    ?.map(part => part.text)
    ?.join('\n')
    ?.trim();

  if (!text) {
    throw new Error('Gemini returned no content: ' + JSON.stringify(res).slice(0, 300));
  }

  return { model: 'gemini-3.1-pro-preview', text, res };
}

async function generateWithSonnet(prompt, apiKey, maxTokens = 1200) {
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    temperature: 0.8,
    messages: [{ role: 'user', content: prompt }]
  };

  const res = await httpPost(
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body
  );

  const text = (res?.content || [])
    .filter(part => part?.type === 'text' && part?.text)
    .map(part => part.text)
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Sonnet returned no content: ' + JSON.stringify(res).slice(0, 200));
  }

  return { model: 'claude-sonnet-4-6', text, res };
}

function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('No URL provided to httpPost'));
    const u = new URL(url);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ _raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Signal Scout data ──────────────────────────────────────────────────────────

function getRecentSignals(maxSignals = 5) {
  try {
    if (!fs.existsSync(SIGNALS_FILE)) return [];
    const raw = fs.readFileSync(SIGNALS_FILE, 'utf8');
    const blocks = raw.split(/(?=### \[)/);
    const signals = [];
    for (const block of blocks) {
      if (!block.trim()) continue;
      const scoreMatch = block.match(/\*\*Score\*\*:\s*(\d)/);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
      if (score < 4) continue;
      const signalMatch = block.match(/\*\*Signal\*\*:\s*([^\n]+)/);
      const signal = signalMatch ? signalMatch[1].trim() : null;
      if (!signal) continue;
      const dateMatch = block.match(/### \[([^\]]+)\]/);
      signals.push({ date: dateMatch ? dateMatch[1] : 'recent', signal, score });
      if (signals.length >= maxSignals) break;
    }
    return signals;
  } catch (e) {
    log(`Warning: Could not load signals: ${e.message}`);
    return [];
  }
}

// ── Anecdote picker ────────────────────────────────────────────────────────────

function pickAnecdote(anecdotesData, excludeId) {
  if (!anecdotesData?.anecdotes?.length) return null;
  const sorted = [...anecdotesData.anecdotes]
    .filter(a => a.id !== excludeId)
    .sort((a, b) => {
      if (!a.last_used && !b.last_used) return 0;
      if (!a.last_used) return -1;
      if (!b.last_used) return 1;
      return new Date(a.last_used) - new Date(b.last_used);
    });
  return sorted[0] || anecdotesData.anecdotes[0];
}

// ── Trending topic via Sonnet 4.6 ────────────────────────────────────────────

async function getTrendingTopic() {
  const googleApiKey = getGoogleApiKey();
  if (!googleApiKey) throw new Error('Google API key not found');

  log('Pulling trending GTM/founder topic via Gemini 3.1 Pro...');
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const prompt = `Today is ${today}.

Pick ONE specific, current conversation that is resonating right now among founders, startup operators, or GTM leaders.

I want something timely and concrete, not generic startup advice.
Examples of acceptable outputs:
- Founders replacing SDR headcount with AI and debating whether quality survives
- Pipeline staying flat even when traffic rises
- Why AI tooling volume is going up while trust in outbound is going down

Give me exactly this structure:
1. Topic: one sentence
2. Why now: 2-3 sentences
3. Contrarian angle: 1-2 sentences
4. Creative angle: 1-2 sentences for Jenny's lens

Be specific. No hashtags. No fluff.`;

  const { model, text } = await generateWithGemini(prompt, googleApiKey, 1000);
  log(`Trending topic retrieved via ${model}.`);
  return text.trim();
}

// ── Post generator via Sonnet 4.6 ─────────────────────────────────────────────

async function generatePost({ author, voiceProfileText, anecdote, trendingTopic, template, signals, hooks = [] }) {
  log(`Generating ${author.name} post: ${template.name}`);

  const googleApiKey = getGoogleApiKey();
  if (!googleApiKey) throw new Error('Google API key not found');

  const signalContext = signals?.length
    ? `\nREAL FOUNDER PAIN SIGNALS (from Signal Scout — what founders are saying RIGHT NOW):\n` +
      signals.map((s, i) => `${i + 1}. [Score ${s.score}/5] "${s.signal}" (${s.date})`).join('\n') +
      `\n\nUse these as evidence the topic is live. Do NOT name specific Reddit users — paraphrase the pattern.`
    : '';

  const anecdoteSection = anecdote
    ? `PERSONAL ANECDOTE TO WEAVE IN:
Title: ${anecdote.title}
Story: ${anecdote.story}
Best angles: ${anecdote.hook_angles?.join(' | ') || 'n/a'}`
    : `PERSONAL ANECDOTE: Use a general Aloomii story — named after two cats (Aloo and Mittens), AI fleet of 15 agents, built by operators for operators.`;

  const prompt = `SYSTEM Directives: LinkedIn High-Signal Operator Persona

Role: You are a veteran operator and business strategist writing for an audience of your peers. You prioritize "distribution-first" thinking and deep, practical insights. Your tone is sharp, contrarian but grounded, and intensely practical. You do not write for engagement bait; you write to establish undeniable authority.

Negative Constraints (Strictly Forbidden):
- Do not use typical LinkedIn hooks: "I am thrilled to announce," "I never thought I'd say this, but...", "Here's the truth about..."
- Do not use emoji spam (keep it to a maximum of 1 or 2, or none at all).
- Do not end the post with an engagement-bait question like "What are your thoughts?" or "Do you agree?"
- Avoid the typical "broetry" formatting of single-sentence paragraphs for 20 lines straight. Group thoughts logically.
- Ban the words: "Delve," "crucial," "unlock," "synergy," "navigating," "realm," "supercharge."
- Never use em dashes (—). Use periods, commas, or colons instead.

Stylistic Execution:
- The Hook: Start with a counter-intuitive statement, a hard truth, or a specific, vivid observation about the market.
- The Meat: Back up the hook immediately with concrete mechanics. Use sharp contrasts (e.g., "Amateurs do X. Professionals do Y.") to illustrate the point.
- The Sign-off: End abruptly and confidently. State your final thesis and walk away. Leave the reader thinking, rather than begging them to comment.

You are writing a LinkedIn post for ${author.name}, ${author.role} of Aloomii.

VOICE PROFILE:
${voiceProfileText}

TODAY'S TRENDING TOPIC:
${trendingTopic}
${signalContext}
${anecdoteSection}

RELEVANT HOOKS FROM DB:
${hooks.map((h, i) => `${i + 1}. ${h.hook_text} | LinkedIn opener: ${h.linkedin_opener || 'n/a'} | Topic: ${h.topic_tag || 'n/a'} | Pain: ${h.pain_type || 'n/a'} | Confidence: ${h.hook_confidence || 'n/a'}`).join('\n')}

TEMPLATE FORMULA — ${template.name}:
${template.instructions}

TASK:
Write a LinkedIn post for ${author.name} that connects today's trending topic to the personal anecdote using the ${template.name} formula.
Write in ${author.name}'s authentic voice as described in the voice profile above, while STRICTLY following the SYSTEM Directives.
The trend should feel timely. The anecdote should feel earned, not forced.
Output ONLY the post text. No title, no labels, no markdown. Just the post.`;

  const { model, text } = await generateWithGemini(prompt, googleApiKey, 2000);
  log(`Post generated for ${author.name} (${model}).`);
  return text.trim();
}

// ── Buffer push ────────────────────────────────────────────────────────────────

async function pushToBuffer(postText, channelId, label) {
  if (!channelId) {
    log(`[SKIP] No Buffer channel ID for ${label} — post not pushed`);
    return null;
  }
  log(`Pushing ${label} post to Buffer...`);

  const mutation = `mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id status } }
      ... on InvalidInputError { message }
      ... on UnexpectedError { message }
      ... on UnauthorizedError { message }
      ... on LimitReachedError { message }
    }
  }`;

  const res = await httpPost(
    BUFFER_ENDPOINT,
    { Authorization: `Bearer ${BUFFER_API_KEY}` },
    {
      query: mutation,
      variables: {
        input: {
          channelId,
          text: postText,
          schedulingType: 'notification',
          mode: 'addToQueue',
        },
      },
    }
  );

  const result = res?.data?.createPost;
  const post = result?.post;
  if (post) {
    log(`Buffer draft created: id=${post.id} status=${post.status}`);
    return post.id;
  }
  const errMsg = result?.message || JSON.stringify(res).slice(0, 200);
  throw new Error(`Buffer push failed for ${label}: ${errMsg}`);
}

// ── Discord alert ──────────────────────────────────────────────────────────────

async function alertDiscord(results, dryRun) {
  if (dryRun) { log('[DRY RUN] Skipping Discord alert'); return; }

  const lines = results.map((r, i) =>
    `**Post ${i + 1} — ${r.author}** (${r.template})\n${r.text.slice(0, 200)}...\n${r.bufferId ? `Buffer draft: ${r.bufferId}` : '⚠️ No Buffer channel configured'}`
  ).join('\n\n---\n\n');

  const msg = `📝 **Weekly LinkedIn drafts ready** (${new Date().toLocaleDateString()})\n\n${lines}\n\nReview + schedule at buffer.com → Drafts`;
  log(`DISCORD_ALERT: ${msg.slice(0, 200)}...`);

  const alertPath = path.join(WORKSPACE, 'logs/pending-discord-alerts.jsonl');
  fs.appendFileSync(alertPath, JSON.stringify({ ts: new Date().toISOString(), channel: DISCORD_CHANNEL_ID, message: msg }) + '\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  log(`=== weekly-linkedin-drafts START${DRY_RUN ? ' [DRY RUN]' : ''} ===`);

  const state = loadState();

  // Load anecdotes
  const yohannAnecdotes = loadJSON(YOHANN_ANECDOTES_FILE);
  const jennyAnecdotes  = loadJSON(JENNY_ANECDOTES_FILE);

  // Load voice profiles from DB first, YAML as fallback
  const yohannProfile = await getBrandProfile('yohann', YOHANN_VOICE_FILE);
  const jennyProfile  = await getBrandProfile('jenny', JENNY_VOICE_FILE);
  const yohannHooks = await getRelevantHooks('yohann');
  const jennyHooks = await getRelevantHooks('jenny');

  // Load signals
  const signals = getRecentSignals(5);
  log(`Signal Scout context: ${signals.length} score-4+ signals loaded`);

  // Get trending topic (shared across all 3 posts)
  const trendingTopic = await getTrendingTopic();

  // Pick 3 templates each, all different
  const yT1 = YOHANN_TEMPLATES[ state.yohannTemplateIndex      % YOHANN_TEMPLATES.length];
  const yT2 = YOHANN_TEMPLATES[(state.yohannTemplateIndex + 1) % YOHANN_TEMPLATES.length];
  const yT3 = YOHANN_TEMPLATES[(state.yohannTemplateIndex + 2) % YOHANN_TEMPLATES.length];
  const jT1 = JENNY_TEMPLATES[ state.jennyTemplateIndex        % JENNY_TEMPLATES.length];
  const jT2 = JENNY_TEMPLATES[(state.jennyTemplateIndex  + 1)  % JENNY_TEMPLATES.length];
  const jT3 = JENNY_TEMPLATES[(state.jennyTemplateIndex  + 2)  % JENNY_TEMPLATES.length];

  // Pick anecdotes (all different)
  const yA1 = pickAnecdote(yohannAnecdotes, null);
  const yA2 = pickAnecdote(yohannAnecdotes, yA1?.id);
  const yA3 = pickAnecdote(yohannAnecdotes, yA2?.id);
  const jA1 = jennyAnecdotes ? pickAnecdote(jennyAnecdotes, null)        : null;
  const jA2 = jennyAnecdotes ? pickAnecdote(jennyAnecdotes, jA1?.id)     : null;
  const jA3 = jennyAnecdotes ? pickAnecdote(jennyAnecdotes, jA2?.id)     : null;

  log(`Yohann Post 1: ${yT1.name} | anecdote: ${yA1?.id}`);
  log(`Yohann Post 2: ${yT2.name} | anecdote: ${yA2?.id}`);
  log(`Yohann Post 3: ${yT3.name} | anecdote: ${yA3?.id}`);
  log(`Jenny Post 1:  ${jT1.name} | anecdote: ${jA1?.id || 'brand story'}`);
  log(`Jenny Post 2:  ${jT2.name} | anecdote: ${jA2?.id || 'brand story'}`);
  log(`Jenny Post 3:  ${jT3.name} | anecdote: ${jA3?.id || 'brand story'}`);

  // Generate all 6 posts
  let yPost1 = await generatePost({ author: { name: 'Yohann Calpu', role: 'Co-Founder' }, voiceProfileText: yohannProfile.voiceText, anecdote: yA1, trendingTopic, template: yT1, signals, hooks: yohannHooks });
  let yPost2 = await generatePost({ author: { name: 'Yohann Calpu', role: 'Co-Founder' }, voiceProfileText: yohannProfile.voiceText, anecdote: yA2, trendingTopic, template: yT2, signals, hooks: yohannHooks });
  let yPost3 = await generatePost({ author: { name: 'Yohann Calpu', role: 'Co-Founder' }, voiceProfileText: yohannProfile.voiceText, anecdote: yA3, trendingTopic, template: yT3, signals, hooks: yohannHooks });
  let jPost1 = await generatePost({ author: { name: 'Jenny Calpu',  role: 'Co-Founder + Creative Director' }, voiceProfileText: jennyProfile.voiceText, anecdote: jA1, trendingTopic, template: jT1, signals, hooks: jennyHooks });
  let jPost2 = await generatePost({ author: { name: 'Jenny Calpu',  role: 'Co-Founder + Creative Director' }, voiceProfileText: jennyProfile.voiceText, anecdote: jA2, trendingTopic, template: jT2, signals, hooks: jennyHooks });
  let jPost3 = await generatePost({ author: { name: 'Jenny Calpu',  role: 'Co-Founder + Creative Director' }, voiceProfileText: jennyProfile.voiceText, anecdote: jA3, trendingTopic, template: jT3, signals, hooks: jennyHooks });

  if (DRY_RUN) {
    const posts = [
      ['YOHANN', yT1.name, yPost1], ['YOHANN', yT2.name, yPost2], ['YOHANN', yT3.name, yPost3],
      ['JENNY',  jT1.name, jPost1], ['JENNY',  jT2.name, jPost2], ['JENNY',  jT3.name, jPost3],
    ];
    posts.forEach(([author, template, text], i) => {
      console.log('\n' + '═'.repeat(60));
      console.log(`POST ${i + 1} — ${author} (${template})`);
      console.log('─'.repeat(60));
      console.log(text);
    });
    console.log('═'.repeat(60) + '\n');
    log('[DRY RUN] Skipping Buffer push and state update.');
    return;
  }

  // === NEWSLETTER CTA ===
  // Append "The Last 20%" newsletter CTA to every LinkedIn draft
  const NEWSLETTER_CTA = '\n\n---\n\n\u2709\ufe0f Want the last 20% that makes the difference? Subscribe to The Last 20%:\nhttps://www.linkedin.com/newsletters/the-last-20-7445126674708451328';
  
  yPost1 += NEWSLETTER_CTA;
  yPost2 += NEWSLETTER_CTA;
  yPost3 += NEWSLETTER_CTA;
  jPost1 += NEWSLETTER_CTA;
  jPost2 += NEWSLETTER_CTA;
  jPost3 += NEWSLETTER_CTA;

  // DO NOT push to Buffer here — drafts go to Command Center for review first.
  // Buffer push happens on approval via POST /api/command/content/:id/approve
  log('[INFO] Skipping Buffer push — drafts saved to Command Center for review/approval');

  const results = [
    { author: 'Yohann Calpu', template: yT1.name, text: yPost1, bufferId: null },
    { author: 'Yohann Calpu', template: yT2.name, text: yPost2, bufferId: null },
    { author: 'Yohann Calpu', template: yT3.name, text: yPost3, bufferId: null },
    { author: 'Jenny Calpu',  template: jT1.name, text: jPost1, bufferId: null },
    { author: 'Jenny Calpu',  template: jT2.name, text: jPost2, bufferId: null },
    { author: 'Jenny Calpu',  template: jT3.name, text: jPost3, bufferId: null },
  ];

  for (const r of results) {
    try {
      const hookRun = await runHookLoop({
        business: 'Aloomii runs GTM for founders',
        icp: r.author.includes('Jenny') ? 'creative operators and founders using AI in content' : 'B2B founders and GTM operators',
        topic: r.template,
        funnelStage: 'top',
        platform: 'linkedin'
      });
      r.hookRun = hookRun;
      const recommendedHook = hookRun?.recommended?.hook_text;
      if (recommendedHook) {
        r.text = `${recommendedHook}\n\n${r.text}`;
      }
    } catch (e) {
      log(`[HOOK_LAB] failed for ${r.author} / ${r.template}: ${e.message}`);
    }
  }

  await alertDiscord(results, DRY_RUN);

  // Write drafts and Hook Lab candidates to Command Center DB
  try {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    for (const r of results) {
      const adapter = r.author.includes('Jenny') ? 'jenny' : 'yohann';
      const brandProfileId = adapter === 'jenny' ? jennyProfile.id : yohannProfile.id;
      const postRes = await client.query(
        `INSERT INTO content_posts (platform, post_type, topic, content_text, draft_text, adapter, brand_profile_id, status, published_at)
         VALUES ('linkedin', 'draft', $1, $2, $2, $3, $4, 'draft', NULL)
         RETURNING id`,
        [r.template || 'LinkedIn Post', r.text, adapter, brandProfileId]
      );
      const postId = postRes.rows[0]?.id;

      if (postId && r.hookRun?.candidates?.length) {
        const sessionId = randomUUID();
        await client.query(
          `INSERT INTO attention_line_sessions (id, post_id, platform, asset_type, status, metadata)
           VALUES ($1, $2, 'linkedin', 'hook', 'complete', $3::jsonb)`,
          [sessionId, postId, JSON.stringify({ topic: r.template, author: r.author })]
        );

        let selectedHookId = null;
        for (const candidate of r.hookRun.candidates) {
          const hookRes = await client.query(
            `INSERT INTO content_hooks (
              post_id, platform, asset_type, loop_session_id, loop_role,
              judge_score, judge_rationale, is_selected, brand_persona, topic_tag, hook_text, hook_confidence, metadata
            ) VALUES (
              $1, 'linkedin', 'hook', $2, $3,
              $4, $5, $6, $7, $8, $9, $10, $11::jsonb
            ) RETURNING id`,
            [
              postId,
              sessionId,
              candidate.type,
              candidate.score_total || null,
              candidate.metadata?.judge_reasoning || null,
              !!candidate.recommended,
              adapter,
              r.template,
              candidate.hook_text,
              candidate.score_total || null,
              JSON.stringify({ ...(candidate.metadata || {}), generation_run_id: r.hookRun.runId })
            ]
          );
          const hookId = hookRes.rows[0]?.id;
          if (candidate.recommended && hookId) selectedHookId = hookId;
        }

        if (selectedHookId) {
          await client.query(
            `UPDATE content_posts SET selected_hook_id = $2 WHERE id = $1`,
            [postId, selectedHookId]
          );
          await client.query(
            `UPDATE attention_line_sessions SET winner_hook_id = $2 WHERE id = $1`,
            [sessionId, selectedHookId]
          );
        }
      }
    }
    await client.end();
    log('[DB] LinkedIn drafts and Hook Lab candidates written to Command Center');
  } catch (e) {
    log(`[DB] Draft/Hook Lab write failed (non-fatal): ${e.message}`);
  }

  // Update state
  const today = new Date().toISOString().slice(0, 10);
  state.yohannTemplateIndex = (state.yohannTemplateIndex + 3) % YOHANN_TEMPLATES.length;
  state.jennyTemplateIndex  = (state.jennyTemplateIndex  + 3) % JENNY_TEMPLATES.length;
  state.lastRun = today;
  state.lastYohannAnecdote = yA3?.id;
  state.lastJennyAnecdote  = jA3?.id;
  state.lastYohannBufferIds = [];
  state.lastJennyBufferIds  = [];
  saveJSON(STATE_FILE, state);

  // Mark anecdotes as used
  const today2 = today;
  if (yohannAnecdotes) {
    [yA1, yA2, yA3].forEach(a => {
      if (!a) return;
      const idx = yohannAnecdotes.anecdotes.findIndex(x => x.id === a.id);
      if (idx !== -1) yohannAnecdotes.anecdotes[idx].last_used = today2;
    });
    yohannAnecdotes.meta.last_updated = today2;
    saveJSON(YOHANN_ANECDOTES_FILE, yohannAnecdotes);
  }
  if (jennyAnecdotes) {
    [jA1, jA2, jA3].forEach(a => {
      if (!a) return;
      const idx = jennyAnecdotes.anecdotes.findIndex(x => x.id === a.id);
      if (idx !== -1) jennyAnecdotes.anecdotes[idx].last_used = today2;
    });
    jennyAnecdotes.meta.last_updated = today2;
    saveJSON(JENNY_ANECDOTES_FILE, jennyAnecdotes);
  }

  log(`=== weekly-linkedin-drafts COMPLETE — 6 posts generated (3 Yohann, 3 Jenny) ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
