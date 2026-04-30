#!/usr/bin/env node
/**
 * signal-insight-enricher.js — Batched enrichment using kimi k2.6
 * Sends 5 signals per prompt to reduce latency (~$0.001/signal)
 *
 * Usage: node scripts/reddit-research/signal-insight-enricher.js [--limit N] [--table pain|mood|both]
 */

const { Pool } = require('pg');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const GOOGLE_API_KEY = (function() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.openclaw/openclaw.json'), 'utf8'));
    return config.models.providers.google.apiKey;
  } catch (e) { return null; }
})();
const MODEL = 'gemini-2.5-flash';
const BATCH_SIZE = parseInt(process.env.ENRICH_BATCH || '20');
const PROMPT_BATCH = 5; // signals per LLM call

const pool = new Pool({ connectionString: DB_URL });

async function geminiChat(messages, model = MODEL, timeoutMs = 60000) {
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY not found');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('gemini timeout')), timeoutMs);
    const payload = JSON.stringify({
      contents: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.2, response_mime_type: 'application/json' }
    });
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            reject(new Error(`Gemini Error: ${parsed.error.message}`));
          } else {
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve(text);
          }
        } catch (e) { reject(new Error('Parse error: ' + e.message)); }
      });
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
    req.write(payload); req.end();
  });
}

function extractJSONArray(text) {
  // Find JSON array between triple backticks
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch (e) { /* fall through */ }
  }
  // Find bare JSON array
  const bareMatch = text.match(/\[[\s\S]*\]/);
  if (bareMatch) {
    try { return JSON.parse(bareMatch[0]); } catch (e) { /* fall through */ }
  }
  throw new Error('No valid JSON array found');
}

const INSIGHT_SYSTEM = `You are a strategic signal analyst for Aloomii, an AI GTM service for B2B founders.

For each signal below, produce:
- "insight": what this means for Aloomii in one specific sentence (no fluff, no marketing speak)
- "tags": 2-4 keyword tags mapping to content pillars or ICPs (lowercase, hyphenated)
- "action_suggestion": one concrete next step (e.g., "Draft LinkedIn hook: ...", "Add to snipe pipeline", "Reach out to commenter")

Return ONLY a valid JSON array. No markdown, no explanation outside the JSON. Format:
[
  {"id":0,"insight":"...","tags":["tag1","tag2"],"action_suggestion":"..."},
  ...
]`;

async function enrichBatch(table, rows) {
  const client = await pool.connect();
  let enriched = 0;
  let failed = 0;

  // Process in chunks of PROMPT_BATCH
  for (let i = 0; i < rows.length; i += PROMPT_BATCH) {
    const chunk = rows.slice(i, i + PROMPT_BATCH);
    
    const promptSignals = chunk.map((row, idx) => {
      const quote = row.verbatim_quote || (row.verbatim_phrases?.join(' '));
      const category = row.pain_category || row.mood_primary || 'signal';
      return `[${idx}] ICP: ${row.icp_slug} | Category: ${category}\nQuote: "${quote?.substring(0, 300) || 'N/A'}"`;
    }).join('\n\n');

    const prompt = `${INSIGHT_SYSTEM}\n\n${promptSignals}\n\nReturn JSON array with entries matching [0] through [${chunk.length - 1}]:`;

    try {
      console.log(`  Processing batch ${i/PROMPT_BATCH + 1}/${Math.ceil(rows.length/PROMPT_BATCH)} (${chunk.length} signals)...`);
      const response = await geminiChat([
        { role: 'system', content: INSIGHT_SYSTEM },
        { role: 'user', content: prompt }
      ], MODEL, 60000);

      const results = extractJSONArray(response);
      if (!Array.isArray(results)) throw new Error('Response is not an array');

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const result = results.find(r => r.id === j) || results[j];
        if (!result?.insight) { failed++; continue; }

        await client.query(`
          UPDATE ${table}
          SET insight = $1,
              tags = $2::text[],
              action_suggestion = $3,
              updated_at = NOW()
          WHERE id = $4
        `, [result.insight, result.tags || [], result.action_suggestion, row.id]);

        enriched++;
      }
    } catch (e) {
      console.warn(`  Batch failed: ${e.message}`);
      failed += chunk.length;
    }
  }

  client.release();
  return { enriched, failed };
}

async function main() {
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit'))?.split('=')[1] || BATCH_SIZE, 10);
  const tableArg = process.argv.find(a => a.startsWith('--table'))?.split('=')[1] || 'both';

  let totalEnriched = 0;
  let totalFailed = 0;

  if (tableArg === 'pain' || tableArg === 'both') {
    const painRes = await pool.query(`
      SELECT id, icp_slug, verbatim_quote, pain_category, context_snippet
      FROM pain_signals
      WHERE insight IS NULL
      ORDER BY severity DESC, created_at DESC
      LIMIT $1
    `, [limit]);

    console.log(`\n🩺 Pain signals to enrich: ${painRes.rows.length}`);
    if (painRes.rows.length) {
      const result = await enrichBatch('pain_signals', painRes.rows);
      totalEnriched += result.enriched;
      totalFailed += result.failed;
      console.log(`  Pain: ${result.enriched} enriched, ${result.failed} failed`);
    }
  }

  if (tableArg === 'mood' || tableArg === 'both') {
    const moodRes = await pool.query(`
      SELECT id, icp_slug, verbatim_phrases, mood_primary, trigger_context
      FROM mood_signals
      WHERE insight IS NULL
      ORDER BY emotional_punch DESC, created_at DESC
      LIMIT $1
    `, [limit]);

    console.log(`\n🌡️ Mood signals to enrich: ${moodRes.rows.length}`);
    if (moodRes.rows.length) {
      const result = await enrichBatch('mood_signals', moodRes.rows);
      totalEnriched += result.enriched;
      totalFailed += result.failed;
      console.log(`  Mood: ${result.enriched} enriched, ${result.failed} failed`);
    }
  }

  console.log(`\n✅ Done. ${totalEnriched} enriched, ${totalFailed} failed.`);
  await pool.end();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
