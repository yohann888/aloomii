#!/usr/bin/env node
/**
 * Build 7: Discord @researcher Query Handler
 * Called by OpenClaw when someone asks a research question
 * 
 * Usage: node scripts/100x/discord-researcher.js "your question"
 * 
 * Searches across:
 * - contacts (vector similarity, 3072d)
 * - outreach_drafts (vector similarity, 3072d)
 * - contact_connections (network paths)
 * - signal_patterns (classified signals)
 * - events (co-attendance)
 */

'use strict';

const { execSync } = require('child_process');
const { writeFileSync, unlinkSync, readFileSync } = require('fs');
const { homedir } = require('os');
const https = require('https');
const http = require('http');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';
const OLLAMA_HOST = '10.211.55.2';

const question = process.argv.slice(2).join(' ');
if (!question) { console.error('Usage: discord-researcher.js "question"'); process.exit(1); }

function getGeminiKey() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.openclaw/openclaw.json', 'utf8'));
  return cfg.models.providers.google.apiKey;
}

function sqlJSON(sql) {
  const tmp = `/tmp/dr_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const out = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
    return out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

function sqlFile(sql) {
  const tmp = `/tmp/dr_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, sql);
  try { return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 }).trim(); }
  finally { unlinkSync(tmp); }
}

async function embedText(text, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'models/gemini-embedding-2-preview', content: { parts: [{ text }] } });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-embedding-2-preview:embedContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).embedding.values); }
        catch { reject(new Error('Embed error: ' + d.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function callGemma(prompt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ model: 'gemma4:31b', prompt, stream: false, options: { temperature: 0.2, num_predict: 800 } });
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

// Detect query intent to route search
function detectIntent(q) {
  const lower = q.toLowerCase();
  if (/who know|connect|introduc|warm path|network|mutual/.test(lower)) return 'network';
  if (/signal|buying|interest|trigger|pattern/.test(lower)) return 'signals';
  if (/outreach|draft|email|wrote|sent/.test(lower)) return 'drafts';
  if (/event|conference|attended|meet/.test(lower)) return 'events';
  return 'contacts'; // default
}

async function main() {
  console.error(`[researcher] "${question}"`);
  const apiKey = getGeminiKey();
  const intent = detectIntent(question);
  console.error(`[researcher] Intent: ${intent}`);

  let contextParts = [];

  // Always embed + search contacts
  const qvec = await embedText(question, apiKey);
  const vecLit = `'[${qvec.join(',')}]'::vector`;

  const contacts = sqlJSON(`
    SELECT name, role, tier, status, notes,
      ROUND((1 - (embedding <=> ${vecLit}))::numeric, 3) AS sim
    FROM contacts WHERE embedding IS NOT NULL AND status != 'do_not_contact'
    ORDER BY embedding <=> ${vecLit} LIMIT 6
  `);
  if (contacts.length) {
    contextParts.push('RELEVANT CONTACTS:\n' + contacts.map((c,i) =>
      `${i+1}. ${c.name} (${c.role||'?'}) Tier${c.tier} — ${(c.sim*100).toFixed(0)}% match${c.notes ? '\n   '+c.notes.slice(0,120) : ''}`
    ).join('\n'));
  }

  // Network path queries
  if (intent === 'network') {
    const connectors = sqlJSON(`
      SELECT c.name, c.tier,
        COUNT(DISTINCT cc.contact_b) + COUNT(DISTINCT cc2.contact_a) as connections
      FROM contacts c
      LEFT JOIN contact_connections cc ON cc.contact_a = c.id
      LEFT JOIN contact_connections cc2 ON cc2.contact_b = c.id
      GROUP BY c.id, c.name, c.tier
      HAVING COUNT(DISTINCT cc.contact_b) + COUNT(DISTINCT cc2.contact_a) > 1
      ORDER BY connections DESC LIMIT 5
    `);
    if (connectors.length) {
      contextParts.push('NETWORK CONNECTORS:\n' + connectors.map(c =>
        `• ${c.name} (Tier ${c.tier}) — ${c.connections} connections`).join('\n'));
    }
  }

  // Signal patterns
  if (intent === 'signals') {
    const patterns = sqlJSON(`
      SELECT sp.pattern_type, sp.confidence, sp.urgency,
        s.title, s.created_at::date as date
      FROM signal_patterns sp
      JOIN signals s ON s.id = sp.signal_id
      WHERE sp.detected_at > NOW() - INTERVAL '30 days'
      ORDER BY sp.confidence DESC, sp.detected_at DESC LIMIT 8
    `);
    if (patterns.length) {
      contextParts.push('RECENT SIGNAL PATTERNS:\n' + patterns.map(p =>
        `• [${p.pattern_type}] ${p.title||'signal'} — confidence ${p.confidence}/10, urgency: ${p.urgency}`).join('\n'));
    }
  }

  // Draft search
  if (intent === 'drafts') {
    const drafts = sqlJSON(`
      SELECT channel, draft_text, status, score_total, created_at::date as date,
        ROUND((1-(embedding <=> ${vecLit}))::numeric,3) as sim
      FROM outreach_drafts WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vecLit} LIMIT 4
    `);
    if (drafts.length) {
      contextParts.push('RELEVANT DRAFTS:\n' + drafts.map((d,i) =>
        `${i+1}. ${d.channel||'email'} (${d.date}) score:${d.score_total||'?'} — ${(d.draft_text||'').slice(0,120)}`).join('\n'));
    }
  }

  // Events
  if (intent === 'events') {
    const events = sqlJSON(`
      SELECT e.name, e.date, e.city, e.country, COUNT(ec.contact_id) as attendees
      FROM events e LEFT JOIN event_contacts ec ON ec.event_id = e.id
      GROUP BY e.id, e.name, e.date, e.city, e.country
      ORDER BY e.date DESC LIMIT 6
    `);
    if (events.length) {
      contextParts.push('EVENTS:\n' + events.map(e =>
        `• ${e.name} (${e.date}) ${e.city||''} — ${e.attendees} contacts`).join('\n'));
    }
  }

  // Synthesize
  const prompt = `You are a B2B intelligence assistant for Aloomii. Answer this question concisely using only the data provided.

Question: ${question}

Data:
${contextParts.join('\n\n')}

Answer in 2-4 sentences. Cite specific names and numbers. If the data doesn't answer the question, say so clearly.`;

  let answer = await callGemma(prompt);
  if (!answer) {
    // Fallback: structured summary without Gemma
    answer = contacts.slice(0, 3).map(c => `${c.name} (${(c.sim*100).toFixed(0)}% match)`).join(', ');
    if (!answer) answer = 'No matching data found in the CRM.';
  }

  const output = `**🔍 @researcher**\n> ${question}\n\n${answer}\n\n_pgvector + gemma4:31b | Build 7 | ~$0.00001_`;
  console.log(output);
}

main().catch(e => { console.error('[researcher] Fatal:', e.message); process.exit(1); });
