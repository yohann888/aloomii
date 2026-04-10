#!/usr/bin/env node
/**
 * Hook Miner — extracts the 5 strongest hooks from signal-scout's Reddit data
 * Runs daily at 7:15 AM ET — after signal-scout (6am+), before trend-scout (7am)
 * Model: ollama/qwen3.5:397b (local), $0
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
const https = require('https');
const path = require('path');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';
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

function getGoogleApiKey() {
  const conf = JSON.parse(require('fs').readFileSync(process.env.HOME + '/.openclaw/openclaw.json', 'utf8'));
  return conf?.models?.providers?.google?.apiKey;
}

const OLLAMA_URL = 'http://127.0.0.1:11434';

function extractFirstJSONObject(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

async function callQwen(prompt) {
  return new Promise(resolve => {
    const body = JSON.stringify({
      model: 'qwen3.5:397b-cloud',
      prompt: `${prompt}\n\nYou are a data extraction API. Return ONLY valid JSON. No markdown. No code fences. No prose.`,
      stream: false,
      options: { temperature: 0.1, num_predict: 6000 }
    });
    const req = require('http').request({
      hostname: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          const raw = parsed.response || '';
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const json = extractFirstJSONObject(cleaned);
          resolve(json || cleaned);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body); req.end();
  });
}

async function callGemini(prompt, retry = false) {
  return new Promise(resolve => {
    const apiKey = getGoogleApiKey();
    if (!apiKey) return resolve(null);
    const strictPrompt = `${prompt}\n\nYou are a data extraction API. Return ONLY valid JSON. No markdown. No bullets. No prose. No code fences. If you cannot comply, return {\"hooks\":[]}.`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: strictPrompt }] }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 1500,
        responseMimeType: 'application/json'
      }
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', async () => {
        try {
          const parsed = JSON.parse(d);
          const parts = parsed?.candidates?.[0]?.content?.parts || [];
          const text = parts.find(p => p.text)?.text || null;
          const jsonOnly = extractFirstJSONObject(text);
          if (jsonOnly) return resolve(jsonOnly);
          if (!retry) return resolve(await callGemini(prompt + '\nReturn JSON only.', true));
          resolve(null);
        } catch {
          if (!retry) return resolve(callGemini(prompt + '\nReturn JSON only.', true));
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body); req.end();
  });
}

function cleanValue(v) {
  return String(v || '')
    .replace(/^\*+\s*/, '')
    .replace(/\*+$/,'')
    .replace(/^"|"$/g, '')
    .replace(/^[-•]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHooks(text) {
  try {
    const parsed = JSON.parse(String(text || '').trim());
    return Array.isArray(parsed.hooks) ? parsed.hooks.map(h => ({
      hook_text: cleanValue(h.hook_text),
      source_signal: cleanValue(h.source_signal),
      brand_persona: cleanValue(h.brand_persona),
      topic_tag: cleanValue(h.topic_tag),
      pain_type: cleanValue(h.pain_type),
      linkedin_opener: cleanValue(h.linkedin_opener),
      outreach_opener: cleanValue(h.outreach_opener),
      ad_headline: cleanValue(h.ad_headline),
      video_angle: cleanValue(h.video_angle),
      hook_confidence: Number(h.hook_confidence) || null,
      reuse_score: Number(h.reuse_score) || null,
      brand_fit_score: Number(h.brand_fit_score) || null,
    })).filter(h => h.hook_text && h.hook_text.length > 5) : [];
  } catch {
    return [];
  }
}

function insertHook(hook, signal, index) {
  const esc = (v) => String(v || '').replace(/'/g, "''");
  sqlFile(`
    INSERT INTO content_hooks (
      source_date, source_signal_type, source_signal_score, source_title, source_body,
      brand_persona, topic_tag, pain_type, hook_text, linkedin_opener, outreach_opener,
      ad_headline, video_angle, hook_confidence, reuse_score, brand_fit_score, metadata
    ) VALUES (
      '${today}',
      '${esc(signal.signal_type)}',
      ${Number(signal.score || 0)},
      '${esc(signal.title)}',
      '${esc((signal.body || '').slice(0, 2000))}',
      ${hook.brand_persona ? `'${esc(hook.brand_persona)}'` : 'NULL'},
      ${hook.topic_tag ? `'${esc(hook.topic_tag)}'` : 'NULL'},
      ${hook.pain_type ? `'${esc(hook.pain_type)}'` : 'NULL'},
      '${esc(hook.hook_text)}',
      ${hook.linkedin_opener ? `'${esc(hook.linkedin_opener)}'` : 'NULL'},
      ${hook.outreach_opener ? `'${esc(hook.outreach_opener)}'` : 'NULL'},
      ${hook.ad_headline ? `'${esc(hook.ad_headline)}'` : 'NULL'},
      ${hook.video_angle ? `'${esc(hook.video_angle)}'` : 'NULL'},
      ${hook.hook_confidence ?? 'NULL'},
      ${hook.reuse_score ?? 'NULL'},
      ${hook.brand_fit_score ?? 'NULL'},
      '{"source_index": ${index + 1}}'::jsonb
    );
  `);
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

Return ONLY valid JSON. No markdown. No prose. No code fences.
Use this exact shape:
{
  "hooks": [
    {
      "hook_text": "string",
      "source_signal": "string",
      "brand_persona": "yohann|jenny|both",
      "topic_tag": "string",
      "pain_type": "string",
      "hook_confidence": 0,
      "reuse_score": 0,
      "brand_fit_score": 0,
      "linkedin_opener": "string",
      "outreach_opener": "string",
      "ad_headline": "string",
      "video_angle": "string"
    }
  ]
}

Focus on pain around: GTM struggle, word-of-mouth ceiling, outreach that doesn't work, needing pipeline, hiring failures, doing marketing themselves.
Ignore signals about crypto, NFTs, or anything not B2B founder GTM.`;

  console.log('[hook-miner] Running Qwen 3.5 synthesis...');
  const output = await callQwen(prompt);

  // Fallback: rule-based extraction if Gemma unreachable
  const fallbackHooks = signals.slice(0, 5).map((s, i) => {
    const title = s.title.replace(/^\[reddit\]\s*/i, '').replace(/^[\w-]+:\s*/, '');
    return `HOOK ${i+1}: "${title}"\nSignal type: ${s.signal_type} (score ${s.score})`;
  }).join('\n\n');

  const finalOutput = output || `[Qwen synthesis offline — raw hooks below]\n\n${fallbackHooks}`;

  // Save to file
  const outputDir = path.join(homedir(), 'Desktop/aloomii/output/hooks');
  mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${today}.md`);
  writeFileSync(filePath, `# Hook Mining Report — ${today}\n\n_Source: ${signals.length} signals | Model: qwen3.5:397b_\n\n${finalOutput}`);
  console.log(`[hook-miner] Saved to ${filePath}`);

  sqlFile(`DELETE FROM content_hooks WHERE source_date = '${today}'`);

  // Parse hooks: extract outer wrapper first, then safely get hooks array
  let structuredHooks = [];
  if (output) {
    try {
      const outerStart = output.indexOf('{');
      const outerEnd = output.lastIndexOf('}');
      if (outerStart !== -1 && outerEnd !== -1 && outerEnd > outerStart) {
        const outerStr = output.slice(outerStart, outerEnd + 1);
        const outer = JSON.parse(outerStr);
        // Outer parsed OK — now safely extract the hooks array
        if (Array.isArray(outer.hooks) && outer.hooks.length) {
          structuredHooks = outer.hooks;
          console.log('[hook-miner] JSON OK, hooks:', structuredHooks.length);
        } else if (Array.isArray(outer.hooks)) {
          // hooks array is empty — try individual hook extraction
          console.log('[hook-miner] outer.hooks is empty array, trying individual extraction');
          const hookMatches = [...outerStr.matchAll(/\{"hook_text"\s*:\s*"([^"]{10,})"[^}]*\}/g)];
          structuredHooks = hookMatches.map(m => {
            try {
              const objStart = outerStr.indexOf('{' + m[0].slice(1));
              const objEnd = outerStr.indexOf('}', objStart);
              if (objStart !== -1 && objEnd !== -1) {
                return JSON.parse(outerStr.slice(objStart, objEnd + 1));
              }
            } catch {}
            return { hook_text: m[1], brand_persona: null };
          }).filter(h => h.hook_text);
          console.log('[hook-miner] individual extraction:', structuredHooks.length);
        }
      } else { console.log('[hook-miner] no JSON found, output[:100]:', output.slice(0, 100)); }
    } catch(e) {
      console.log('[hook-miner] outer parse failed:', e.message);
      // Try robust per-hook extraction from raw output
      const hookMatches = [...output.matchAll(/\{"hook_text"\s*:\s*"([^"]{10,})"[^}]*\}/g)];
      structuredHooks = hookMatches.map(m => {
        try {
          const objStart = output.indexOf('{' + m[0].slice(1));
          const objEnd = output.indexOf('}', objStart);
          if (objStart !== -1 && objEnd !== -1) {
            return JSON.parse(output.slice(objStart, objEnd + 1));
          }
        } catch {}
        return { hook_text: m[1], brand_persona: null };
      }).filter(h => h.hook_text);
      console.log('[hook-miner] per-hook fallback extracted:', structuredHooks.length);
    }
  } else { console.log('[hook-miner] output was falsy'); }
  if (!structuredHooks.length) structuredHooks = parseHooks(finalOutput);
  structuredHooks.forEach((hook, i) => insertHook(hook, signals[i] || signals[0], i));


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
  const hookLines = structuredHooks.slice(0, 3).map((h, i) => [
    `HOOK ${i + 1}: "${h.hook_text}"`,
    h.linkedin_opener ? `> ${h.linkedin_opener}` : null,
    h.ad_headline ? `**Ad:** ${h.ad_headline}` : null,
    ''
  ].filter(Boolean).join('\n'));

  const summary = [
    `**🎣 Hook Miner — ${today}**`,
    `_${signals.length} signals processed | Top 5 hooks extracted_`,
    '',
    hookLines.join('\n') || finalOutput.slice(0, 600),
    '',
    `Full report: \`output/hooks/${today}.md\``,
    `_qwen3.5:397b_`
  ].join('\n');

  console.log(summary);
}

main().catch(e => {
  console.error('[hook-miner] Fatal:', e.message);
  process.exit(1);
});
