#!/usr/bin/env node
/**
 * Build 7: Nightly Embedding Sync
 * Embeds any contacts missing embeddings using gemini-embedding-2-preview
 * Runs nightly at 2:00 AM ET
 * Cost: ~$0.00002/contact
 */

'use strict';

const { execSync } = require('child_process');
const { writeFileSync, unlinkSync, readFileSync } = require('fs');
const { homedir } = require('os');
const https = require('https');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';
const DELAY_MS = 700;

function getApiKey() {
  const config = JSON.parse(readFileSync(homedir() + '/.openclaw/openclaw.json', 'utf8'));
  return config.models.providers.google.apiKey;
}

function sqlFile(sql) {
  const tmp = `/tmp/emb_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, sql);
  try {
    return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
  } finally { unlinkSync(tmp); }
}

function sqlJSON(sql) {
  const tmp = `/tmp/emb_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const out = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 60000 });
    return out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

function buildContactText(c) {
  return [
    c.name ? `Name: ${c.name}` : null,
    c.role ? `Role: ${c.role}` : null,
    c.location ? `Location: ${c.location}` : null,
    c.category ? `Category: ${c.category}` : null,
    c.notes ? `Notes: ${c.notes}` : null,
    c.tags ? `Tags: ${c.tags}` : null,
  ].filter(Boolean).join('\n');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function embed(text, apiKey) {
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
        try { resolve(JSON.parse(data).embedding.values); }
        catch (e) { reject(new Error('Embed error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('[embed-sync] Starting nightly embedding sync...');
  const apiKey = getApiKey();

  // Find contacts missing embeddings
  const contacts = sqlJSON(`
    SELECT id, name, role, location, category, notes, tags::text
    FROM contacts
    WHERE embedding IS NULL
      AND status NOT IN ('do_not_contact')
    ORDER BY tier ASC, created_at DESC
    LIMIT 50
  `);

  console.log(`[embed-sync] Found ${contacts.length} contacts needing embeddings`);

  let embedded = 0;
  let failed = 0;

  for (const c of contacts) {
    try {
      const text = buildContactText(c);
      if (!text.trim()) { console.log(`[embed-sync] Skipping ${c.name} — no content`); continue; }

      const vector = await embed(text, apiKey);
      const vectorStr = `[${vector.join(',')}]`;
      // DB columns are both 3072 dims — use full vector for both

      sqlFile(`
        UPDATE contacts SET
          embedding = '${vectorStr}'::vector,
          embedding_hv = '${vectorStr}'::halfvec(3072),
          embedding_model = 'gemini-embedding-2-preview',
          embedding_updated_at = NOW(),
          updated_at = NOW()
        WHERE id = '${c.id}'
      `);

      console.log(`[embed-sync] ✓ ${c.name}`);
      embedded++;
      await sleep(DELAY_MS);
    } catch (e) {
      console.error(`[embed-sync] ✗ ${c.name}: ${e.message}`);
      failed++;
    }
  }

  const summary = `**🔄 Embedding Sync — ${new Date().toISOString().split('T')[0]}**\nEmbedded: ${embedded} contacts | Failed: ${failed}\n_Build 7 | gemini-embedding-2-preview | $${(embedded * 0.00002).toFixed(4)}_`;
  console.log(summary);
}

main().catch(e => {
  console.error('[embed-sync] Fatal:', e.message);
  process.exit(1);
});
