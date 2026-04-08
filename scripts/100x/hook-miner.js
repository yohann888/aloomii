#!/usr/bin/env node
/**
 * Hook Miner — extracts the 5 strongest hooks from signal-scout's Reddit data
 * Runs daily at 7:15 AM ET — after signal-scout (6am+), before trend-scout (7am)
 * Model: ollama/gemma4:31b (local), $0
 *
 * What it does:
 * 1. Pulls last 24h of signals (titles + body text from Reddit posts)
 * 2. Extracts verbatim phrases ICP prospects use to describe their pain
 * 3. Formats each as 4 ready-to-use assets:
 *    - LinkedIn hook (opening line)
 *    - Cold outreach opener
 *    - Ad headline
 *    - Video concept (hook + angle)
 * 4. Posts top 5 hooks to Discord
 * 5. Saves to output/hooks/YYYY-MM-DD.md for content engine
 */

'use strict';

const { execSync } = require('child_process');
const { writeFileSync, unlinkSync, mkdirSync } = require('fs');
const { homedir } = require('os');
const http = require('http');
const path = require('path');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';
const OLLAMA_HOST = '10.211.55.2';
const today = new Date().toISOString().split('T')[0];

function sqlFile(sql) {
  const tmp = `/tmp/hm_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, sql);
  try { return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 }).trim(); }
  finally { unlinkSync(tmp); }
}

function sqlJSON(sql) {
  const tmp = `/tmp/hm_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const out = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
    return out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

async function callGemma(prompt) {
  return new Promise(resolve => {
    const body = JSON.stringify({
      model: 'gemma4:31b',
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 1500 }
    });
    const req = http.request({
      hostname: OLLAMA_HOST, port: 11434, path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).response); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(body); req.end();
  });
}

async function main() {
  console.log(`[hook-miner] Mining hooks from signals — ${today}`);

  // Pull last 24h signals with body text
  const signals = sqlJSON(`
    SELECT title, body, signal_type, score
    FROM signals
    WHERE created_at > NOW() - INTERVAL '14 days'
      AND body IS NOT NULL AND body != ''
      AND score >= 3
    ORDER BY score DESC
    LIMIT 20
  `);

  console.log(`[hook-miner] Found ${signals.length} signals to mine`);

  if (signals.length === 0) {
    console.log('[hook-miner] No signals today. Exiting.');
    return;
  }

  // Build the raw signal corpus
  const corpus = signals.map((s, i) =>
    `SIGNAL ${i + 1} [${s.signal_type}, score ${s.score}]:\nTitle: ${s.title}\n${s.body ? s.body.slice(0, 400) : ''}`
  ).join('\n\n---\n\n');

  const prompt = `You are a world-class copywriter analyzing real B2B founder pain from Reddit and online forums.

Here are today's raw signals — actual words from founders describing their problems:

${corpus}

Your job: extract the 5 STRONGEST hooks buried in this data.

A strong hook is:
- A verbatim phrase or close paraphrase from the source (not your words — THEIR words)
- Specific and emotional, not generic
- Something that makes a founder stop scrolling because it describes their exact situation

For each of the 5 hooks, output exactly this format:

HOOK [N]: "[verbatim or near-verbatim phrase from the data]"
Source signal: [signal type and score]

LINKEDIN OPENER:
[1-2 sentence post opening using this hook. No em dashes. Short sentences. Founder voice.]

OUTREACH OPENER:
[1 sentence cold DM/email opener that references this pain without pitching. Feels human.]

AD HEADLINE:
[Under 10 words. Direct. Could run as a LinkedIn or Facebook ad.]

VIDEO ANGLE:
[Hook: what you say in first 3 seconds. Angle: the specific story or proof point to tell.]

---

Focus on pain around: GTM struggle, word-of-mouth ceiling, outreach that doesn't work, needing pipeline, hiring failures, doing marketing themselves.
Ignore signals about crypto, NFTs, or anything not B2B founder GTM.`;

  console.log('[hook-miner] Running Gemma 4 synthesis...');
  const output = await callGemma(prompt);

  // Fallback: rule-based extraction if Gemma unreachable
  const fallbackHooks = signals.slice(0, 5).map((s, i) => {
    const title = s.title.replace(/^\[reddit\]\s*/i, '').replace(/^[\w-]+:\s*/, '');
    return `HOOK ${i+1}: "${title}"\nSignal type: ${s.signal_type} (score ${s.score})`;
  }).join('\n\n');

  const finalOutput = output || `[Gemma synthesis offline — raw hooks below]\n\n${fallbackHooks}`;

  // Save to file
  const outputDir = path.join(homedir(), 'Desktop/aloomii/output/hooks');
  mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${today}.md`);
  writeFileSync(filePath, `# Hook Mining Report — ${today}\n\n_Source: ${signals.length} signals | Model: gemma4:31b_\n\n${finalOutput}`);
  console.log(`[hook-miner] Saved to ${filePath}`);

  // Store top hooks in cross_client_patterns for reuse
  // Use dollar quoting to safely handle single/double quotes and special chars in hook text
  const safeInsight = finalOutput.slice(0, 2000).replace(/\$\$/g, '\$');
  sqlFile(`
    INSERT INTO cross_client_patterns (pattern_key, category, insight, data_points, confidence, generated_at)
    VALUES (
      'hooks_${today.replace(/-/g, '_')}',
      'hook_mining',
      $$${safeInsight}$$,
      ${signals.length},
      0.8,
      NOW()
    )
    ON CONFLICT (pattern_key) DO UPDATE SET
      insight = EXCLUDED.insight,
      data_points = EXCLUDED.data_points,
      generated_at = NOW()
  `);

  // Discord output — top 3 hooks only to keep it scannable
  const lines = finalOutput.split('\n');
  const hookLines = [];
  let count = 0;
  for (const line of lines) {
    if (line.startsWith('HOOK') && count < 3) {
      hookLines.push(line);
      count++;
    } else if (line.startsWith('LINKEDIN OPENER:') && count <= 3) {
      const next = lines[lines.indexOf(line) + 1];
      if (next) hookLines.push(`> ${next.trim()}`);
    } else if (line.startsWith('AD HEADLINE:') && count <= 3) {
      const next = lines[lines.indexOf(line) + 1];
      if (next) hookLines.push(`**Ad:** ${next.trim()}\n`);
    }
  }

  const summary = [
    `**🎣 Hook Miner — ${today}**`,
    `_${signals.length} signals processed | Top 5 hooks extracted_`,
    '',
    hookLines.join('\n') || finalOutput.slice(0, 600),
    '',
    `Full report: \`output/hooks/${today}.md\``,
    `_gemma4:31b local | $0_`
  ].join('\n');

  console.log(summary);
}

main().catch(e => {
  console.error('[hook-miner] Fatal:', e.message);
  process.exit(1);
});
