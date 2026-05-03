#!/usr/bin/env node
/**
 * Build 3: Signal Pattern Classifier
 * Runs daily at 4:00 AM ET — before trajectory prediction at 5:30 AM
 * Model: kimi-k2.6:cloud (via local Ollama), $0 cost
 * 
 * Classifies new signals from the signals table into 5 pattern types:
 * distress | growth | leadership_transition | tech_shift | competitive_risk
 */

'use strict';

const { execSync } = require('child_process');
const { writeFileSync, unlinkSync } = require('fs');
const http = require('http');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';
const OLLAMA_HOST = 'localhost';
const OLLAMA_PORT = 11434;

function sqlFile(sql) {
  const tmp = `/tmp/pat_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, sql);
  try {
    return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
  } finally { unlinkSync(tmp); }
}

function sqlJSON(sql) {
  const tmp = `/tmp/pat_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const out = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
    return out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

async function callKimi(prompt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'kimi-k2.6:cloud',
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 1024 }
    });
    const req = http.request({
      hostname: OLLAMA_HOST, port: OLLAMA_PORT,
      path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: true, response: parsed.response || null, model: 'kimi-k2.6:cloud', host: `${OLLAMA_HOST}:${OLLAMA_PORT}` });
        } catch {
          resolve({ ok: false, response: null, model: 'kimi-k2.6:cloud', host: `${OLLAMA_HOST}:${OLLAMA_PORT}` });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, response: null, model: 'kimi-k2.6:cloud', host: `${OLLAMA_HOST}:${OLLAMA_PORT}` }));
    req.write(body);
    req.end();
  });
}

// Rule-based classifier (fast, no API needed for clear cases)
function ruleBasedClassify(signal) {
  const text = JSON.stringify(signal).toLowerCase();
  const scores = {
    distress: 0, growth: 0, leadership_transition: 0,
    tech_shift: 0, competitive_risk: 0
  };

  // Distress indicators
  if (/layoff|restructur|downsiz|cost.cut|loss|decline|closing|bankrupt/.test(text)) scores.distress += 3;
  if (/negative review|complaint|dissatisf/.test(text)) scores.distress += 2;

  // Growth indicators  
  if (/hiring|new role|expand|funding|raise|series [abc]|growth|launch/.test(text)) scores.growth += 3;
  if (/new office|partnership|acqui/.test(text)) scores.growth += 2;

  // Leadership transition
  if (/new ceo|new cto|new vp|appointed|promoted|left|departed|resigned/.test(text)) scores.leadership_transition += 3;
  if (/executive|c-suite|leadership change/.test(text)) scores.leadership_transition += 2;

  // Tech shift
  if (/ai|machine learning|automation|digital transform|new platform|migrat/.test(text)) scores.tech_shift += 2;
  if (/api|integration|saas|cloud/.test(text)) scores.tech_shift += 1;

  // Competitive risk
  if (/competitor|rival|alternative|switch|comparison/.test(text)) scores.competitive_risk += 3;

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore < 2) return null; // Not clear enough for rule-based

  const pattern = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const confidence = Math.min(10, Math.round(maxScore * 2.5));
  return { pattern_type: pattern, confidence, method: 'rules' };
}

async function main() {
  console.log('[signal-classifier] Starting signal pattern classification...');
  const today = new Date().toISOString().split('T')[0];

  // Get unclassified signals from last 7 days
  const signals = sqlJSON(`
    SELECT s.id, s.title, s.body as summary, s.signal_type, s.score, s.created_at::date as date,
           NULL as contact_name, NULL as tier
    FROM signals s
    LEFT JOIN signal_patterns sp ON sp.signal_id = s.id
    WHERE sp.id IS NULL
      AND s.created_at > NOW() - INTERVAL '7 days'
    ORDER BY s.score DESC NULLS LAST
    LIMIT 30
  `);

  console.log(`[signal-classifier] Processing ${signals.length} unclassified signals`);

  let classified = 0;
  let skipped = 0;
  let ruleCount = 0;
  let kimiCount = 0;
  let kimiReachable = false;

  for (const signal of signals) {
    // Try rule-based first (fast, $0)
    let result = ruleBasedClassify(signal);

    // If ambiguous, use Kimi K2.6 (local Ollama, $0)
    if (!result) {
      const prompt = `Classify this signal into exactly ONE category. Reply with JSON only.

Signal: ${signal.title || ''}
Summary: ${(signal.summary || '').slice(0, 300)}
Type: ${signal.signal_type || 'unknown'}
Contact: ${signal.contact_name || 'unknown'} (Tier ${signal.tier || '?'})

Categories:
- distress: company in trouble (layoffs, negative reviews, stagnation)
- growth: company scaling (hiring, funding, expansion, new product)
- leadership_transition: C-suite or key person change
- tech_shift: technology stack or AI adoption change
- competitive_risk: competitor activity near our client/prospect

Reply with exactly: {"pattern_type":"<category>","confidence":<1-10>,"urgency":"<today|this_week|this_month|monitor>"}`;

      const kimi = await callKimi(prompt);
      if (kimi.ok) kimiReachable = true;
      if (kimi.response) {
        try {
          const match = kimi.response.match(/\{[^}]+\}/);
          if (match) result = { ...JSON.parse(match[0]), method: 'kimi', model: kimi.model, host: kimi.host };
        } catch {}
      }
    }

    if (!result) { skipped++; continue; }

    // Insert into signal_patterns
    sqlFile(`
      INSERT INTO signal_patterns (signal_id, pattern_type, confidence, urgency, indicators, detected_at)
      VALUES (
        '${signal.id}',
        '${result.pattern_type}',
        ${result.confidence || 5},
        '${result.urgency || 'monitor'}',
        '{"method":"${result.method || 'rules'}","signal_type":"${signal.signal_type || ''}","score":${signal.score || 0}}'::jsonb,
        NOW()
      )
      ON CONFLICT DO NOTHING
    `);

    console.log(`[signal-classifier] ✓ ${signal.contact_name || 'unknown'} — ${result.pattern_type} (${result.confidence}/10) via ${result.method || 'unknown'}`);
    if (result.method === 'rules') ruleCount++;
    if (result.method === 'kimi') kimiCount++;
    classified++;
  }

  // Summary by pattern type
  const counts = sqlJSON(`
    SELECT pattern_type, COUNT(*) as count
    FROM signal_patterns
    WHERE detected_at > NOW() - INTERVAL '24 hours'
    GROUP BY pattern_type
    ORDER BY count DESC
  `);

  let summary = `**🔍 Signal Patterns — ${today}**\n`;
  if (counts.length > 0) {
    counts.forEach(r => { summary += `• ${r.pattern_type}: ${r.count}\n`; });
  } else {
    summary += `No patterns classified today.\n`;
  }
  summary += `Classified: ${classified} | Skipped: ${skipped}\n`;
  summary += `Methods: rules=${ruleCount} | kimi=${kimiCount}\n`;
  summary += `_Build 3 | classifier path: ${kimiCount > 0 ? 'kimi-k2.6 + rules' : ruleCount > 0 ? 'rules-only' : 'no classifications'} | kimi reachable: ${kimiReachable ? 'yes' : 'no'} | $0_`;

  console.log(summary);
}

main().catch(e => {
  console.error('[signal-classifier] Error:', e.message);
  process.exit(1);
});
