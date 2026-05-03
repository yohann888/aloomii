#!/usr/bin/env node
// ensembledata-tw-ebook-sync.js — Twitter/X discovery for Ebook ICPs
// Uses manual handle lists + EnsembleData /twitter/user/info for enrichment
// Budget key: ebook_twitter
//
// NOTE: EnsembleData Twitter search requires session cookies (ct0, auth_token).
// Discovery works via keyword-targeted handle lists. For true search discovery,
// use Twitter API v2 or a scraping service like Apify.

const https = require('https');
const { Pool } = require('pg');
const budgetTracker = require('./budget-tracker');

const TOKEN = process.env.ENSEMBLEDATA_TOKEN || 'mYhi8PoTRudPx31j';
const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const pool = new Pool({ connectionString: DB_URL });

// Seed handles by ICP — these are manually curated from populate-ebook-influencers.js
// In production, source from: Twitter Lists, Apollo.io, manual research, or community curation
const TWITTER_HANDLES = {
  ebook_founder: [
    'sangramvajre', 'jasontoconnor', 'guyyalif', 'davidcbreaker',
    'naval', 'shreyas', 'lennysan', 'jasonlk', 'patio11',
    'arambaz', 'gaganbiyani', 'suhail', 'awilkinson',
    'clairevo', 'johnjneri', 'briannekimmel', 'sama'
  ],
  ebook_solo: [
    'arvidkahl', 'dannypostmaa', 'tdinh_me', 'louispereira',
    'justinwelsh', 'dickiebush', 'nathanbarry', 'shaneswift',
    'marckohlbrugge', 'levelsio', 'pieterlevels', 'tibo_maker',
    'jonathanstark', 'brennanvo', 'robwalling', 'tylertringas'
  ],
  ebook_operator: [
    'cgallenstein', 'samjacobshl', 'kyle_poyar', 'ruchin',
    'jennysun', 'katerosario', 'elenavna', 'andrewhchen',
    'davegerhardt', 'dcancel', 'kyleplacy', 'ejarcher'
  ]
};

const EMAIL_RE = /[\w.\+\-]+@[\w\-]+\.[\w\-]+/;

function edFetch(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: 30000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function extractEmail(text) {
  if (!text) return null;
  const m = text.match(EMAIL_RE);
  return m ? m[0] : null;
}

// ── USER INFO: /twitter/user/info ──────────────────────────────────────
// Returns legacy profile data, entities (urls), description
// Cost: 2 units
async function getTwitterUserInfo(username) {
  const url = `https://ensembledata.com/apis/twitter/user/info?username=${encodeURIComponent(username)}&token=${TOKEN}`;
  return edFetch(url);
}

// ── ICP classification ─────────────────────────────────────────────────
function classifyIcp(text, icpBase) {
  const lower = (text || '').toLowerCase();
  if (icpBase === 'ebook_solo') {
    const soloKw = ['solopreneur','indie','freelance','one person','solo founder','digital nomad','side hustle','creator economy'];
    return soloKw.some(k => lower.includes(k)) ? 'ebook_solo' : null;
  }
  if (icpBase === 'ebook_operator') {
    const opKw = ['revops','sales ops','product manager','operations','b2b','saas','growth','team lead','revenue'];
    return opKw.some(k => lower.includes(k)) ? 'ebook_operator' : null;
  }
  if (icpBase === 'ebook_founder') {
    const founderKw = ['founder','startup','gtm','go-to-market','bootstrapped','b2b saas','ceo','cto'];
    return founderKw.some(k => lower.includes(k)) ? 'ebook_founder' : null;
  }
  return null;
}

// ── Deduplication ────────────────────────────────────────────────────────
async function isDuplicate(handle) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT 1 FROM influencer_pipeline WHERE handle = $1 LIMIT 1',
      [handle]
    );
    return res.rowCount > 0;
  } finally {
    client.release();
  }
}

// ── Upsert influencer ───────────────────────────────────────────────────
async function upsertInfluencer(row) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO influencer_pipeline (
        handle, platform, platform_primary, icp_target, followers,
        profile_url, notes, status, email, email_source, email_found_at,
        engagement_rate, platform_external_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12)
      ON CONFLICT (handle) DO UPDATE SET
        followers = EXCLUDED.followers,
        platform_primary = EXCLUDED.platform_primary,
        icp_target = COALESCE(EXCLUDED.icp_target, influencer_pipeline.icp_target),
        email = COALESCE(EXCLUDED.email, influencer_pipeline.email),
        email_source = COALESCE(EXCLUDED.email_source, influencer_pipeline.email_source),
        engagement_rate = COALESCE(EXCLUDED.engagement_rate, influencer_pipeline.engagement_rate),
        platform_external_id = COALESCE(EXCLUDED.platform_external_id, influencer_pipeline.platform_external_id),
        notes = COALESCE(influencer_pipeline.notes, '') || E'\n[Updated ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '] via TW ebook sync'
    `, [
      row.handle, row.platform, row.platform_primary, row.icp_target,
      row.followers, row.profile_url, row.notes, row.status,
      row.email, row.email_source, row.engagement_rate, row.platform_external_id
    ]);
  } finally {
    client.release();
  }
}

// ── Process Twitter handle ──────────────────────────────────────────────
async function processTwitterHandle(handle, icpBase, budgetKey) {
  const check = await budgetTracker.checkBudget(budgetKey, 3);
  if (!check.allowed) {
    console.warn(`  Budget exhausted for ${budgetKey}`);
    return { inserted: 0, skipped: true };
  }

  if (await isDuplicate(handle)) {
    console.log(`  ↷ ${handle} (already exists)`);
    return { inserted: 0, skipped: true };
  }

  try {
    const data = await getTwitterUserInfo(handle);
    await budgetTracker.recordUsage(budgetKey, 2);

    const legacy = data?.data?.legacy || data?.legacy || {};
    const restId = data?.data?.rest_id || data?.rest_id || null;
    const followers = legacy?.followers_count || 0;
    const following = legacy?.friends_count || 0;
    const tweets = legacy?.statuses_count || 0;
    const desc = legacy?.description || '';
    const displayName = legacy?.name || legacy?.screen_name || handle;

    // Skip bots and very small accounts
    if (followers < 2000 || followers > 5000) {
      console.log(`  ✗ ${handle} (${followers.toLocaleString()} followers) — outside range`);
      return { inserted: 0, skipped: true };
    }

    // Calculate engagement rate proxy: tweets / followers ratio
    const er = followers > 0 ? ((tweets / followers) * 100).toFixed(2) : null;

    // Extract email from bio or expanded URL
    let email = extractEmail(desc);
    let emailSource = email ? 'twitter_bio' : null;

    // Check expanded URLs (bypass t.co shortener)
    const entities = legacy?.entities || {};
    if (!email && entities?.url?.urls?.length > 0) {
      const expanded = entities.url.urls[0].expanded_url || entities.url.urls[0].url;
      email = extractEmail(expanded);
      if (email) emailSource = 'twitter_url_expanded';
    }

    // ICP classification from bio
    const icpTarget = classifyIcp(desc, icpBase) || icpBase;

    await upsertInfluencer({
      handle,
      platform: 'Twitter',
      platform_primary: 'twitter',
      icp_target: icpTarget,
      followers,
      profile_url: `https://x.com/${handle}`,
      notes: `Auto-enriched via TW API. Bio: ${desc.substring(0, 120)}. Name: ${displayName}`,
      status: 'Identified',
      email,
      email_source: emailSource,
      engagement_rate: er,
      platform_external_id: restId
    });
    console.log(`  ✓ ${handle} (${followers.toLocaleString()} followers)` + (email ? ` 📧 ${email}` : ''));
    return { inserted: 1, skipped: false };

  } catch(e) {
    console.error(`  ✗ Error on ${handle}: ${e.message}`);
    return { inserted: 0, skipped: true };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  let totalInserted = 0;
  let totalSkipped = 0;
  const budgetKey = 'ebook_twitter';

  console.log('🐦 Starting Twitter ebook influencer discovery...\n');
  console.log('NOTE: Using curated handle lists. For true discovery, integrate Twitter API v2 or Apify.\n');

  for (const [icp, handles] of Object.entries(TWITTER_HANDLES)) {
    console.log(`📚 ICP: ${icp} (${handles.length} handles)`);
    let icpInserted = 0;

    for (const handle of handles) {
      const result = await processTwitterHandle(handle, icp, budgetKey);
      if (result.inserted) icpInserted++;
      if (result.skipped) totalSkipped++;
      else totalInserted += result.inserted;

      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }

    console.log(`  → ${icpInserted} new influencers\n`);
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`🐦 Twitter Ebook Sync Complete`);
  console.log(`   Total new influencers: ${totalInserted}`);
  console.log(`   Skipped (dup/range): ${totalSkipped}`);
  console.log('══════════════════════════════════════════');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
