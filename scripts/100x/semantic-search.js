#!/usr/bin/env node
/**
 * Build 7: Semantic Search — Query Interface
 * Called with: node scripts/100x/semantic-search.js "your question here"
 * 
 * How it works:
 * 1. Embed the query using gemini-embedding-2-preview (3072d)
 * 2. pgvector similarity search across contacts + outreach_drafts
 * 3. Gemma 4 31B synthesizes answer from top results
 * 
 * Cost: ~$0.00001 per query (one embedding call)
 */

'use strict';

const { execFileSync, execSync } = require('child_process');
const { writeFileSync, unlinkSync, readFileSync } = require('fs');
const { homedir } = require('os');
const path = require('path');
const https = require('https');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';
const OLLAMA_BASE = 'http://10.211.55.2:11434';

const question = process.argv.slice(2).join(' ');
if (!question) {
  console.error('Usage: node semantic-search.js "your question"');
  process.exit(1);
}

function getGeminiKey() {
  const config = JSON.parse(readFileSync(homedir() + '/.openclaw/openclaw.json', 'utf8'));
  return config.models.providers.google.apiKey;
}

function sqlFile(sql) {
  const tmp = `/tmp/sem_${Date.now()}.sql`;
  writeFileSync(tmp, sql);
  try {
    return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
  } finally { unlinkSync(tmp); }
}

function sqlJSON(sql) {
  const tmp = `/tmp/sem_${Date.now()}.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const out = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
    return out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

async function embedText(text, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'models/gemini-embedding-2-preview',
      content: { parts: [{ text }] }
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-embedding-2-preview:embedContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.embedding.values);
        } catch (e) { reject(new Error('Embed API error: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callGemma(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gemma4:31b',
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 1024 }
    });
    const req = require('http').request({
      hostname: '10.211.55.2',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).response); }
        catch (e) { reject(new Error('Ollama error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.error(`[semantic-search] Query: "${question}"`);

  const apiKey = getGeminiKey();

  // 1. Embed the query
  console.error('[semantic-search] Generating query embedding...');
  const queryVector = await embedText(question, apiKey);
  const vectorLiteral = `'[${queryVector.join(',')}]'`;

  // 2. Search contacts
  const contactResults = sqlJSON(`
    SELECT 
      name, role, tier, status, notes, tags::text,
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM contacts
    WHERE embedding IS NOT NULL
      AND status NOT IN ('do_not_contact')
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT 8
  `);

  // 3. Search outreach drafts
  const draftResults = sqlJSON(`
    SELECT 
      channel, draft_text,
      created_at::date as date,
      status, score_total,
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM outreach_drafts
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT 5
  `);

  // 4. Build context for Gemma
  let context = `Question: ${question}\n\n`;

  if (contactResults.length > 0) {
    context += `RELEVANT CONTACTS:\n`;
    contactResults.forEach((c, i) => {
      context += `${i+1}. ${c.name} (${c.role || 'unknown role'}) — Tier ${c.tier}, Status: ${c.status}, Similarity: ${(c.similarity * 100).toFixed(1)}%\n`;
      if (c.notes) context += `   Notes: ${c.notes.slice(0, 200)}\n`;
    });
    context += '\n';
  }

  if (draftResults.length > 0) {
    context += `RELEVANT OUTREACH DRAFTS:\n`;
    draftResults.forEach((d, i) => {
      context += `${i+1}. ${d.channel || 'email'} (${d.date}) — Status: ${d.status}, Score: ${d.score_total || 'unscored'}\n`;
      if (d.draft_text) context += `   Preview: ${d.draft_text.slice(0, 150)}\n`;
    });
    context += '\n';
  }

  context += `Based on this data, answer the question concisely and cite specific names/dates where relevant.`;

  // 5. Synthesize with Gemma 4
  console.error('[semantic-search] Synthesizing with Gemma 4 31B...');
  let answer;
  try {
    answer = await callGemma(context);
  } catch (e) {
    // Fallback: return raw search results if Ollama unreachable
    answer = `Top matches:\n` + contactResults.slice(0, 3).map(c => `• ${c.name} (${(c.similarity*100).toFixed(0)}% match)`).join('\n');
  }

  const output = `**🔍 Semantic Search Result**\n\n**Q:** ${question}\n\n**A:** ${answer}\n\n_Build 7 | pgvector + gemma4:31b | ~$0.00001_`;
  console.log(output);
}

main().catch(e => {
  console.error('[semantic-search] Fatal:', e.message);
  process.exit(1);
});
