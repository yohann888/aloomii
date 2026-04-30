#!/usr/bin/env node
// ensembledata-tt-ebook-sync.js — TikTok discovery for Ebook ICPs (solopreneur, operator)
// Uses /tt/keyword/search with get_author_stats=true for content-first discovery
// This activates the previously dead 'ebook_tiktok' budget pipeline

const https = require('https');
const { Pool } = require('pg');
const budgetTracker = require('./budget-tracker');

const TOKEN = process.env.ENSEMBLEDATA_TOKEN || 'mYhi8PoTRudPx31j';
const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const pool = new Pool({ connectionString: DB_URL });

const EBOOK_KEYWORDS = {
  ebook_solo: [
    'solopreneur productivity tips',
    'one person business TikTok',
    'indie hacker daily',
    'build in public solo',
    'freelance to founder journey'
  ],
  ebook_operator: [
    'RevOps automation tips',
    'b2b sales operations daily',
    'product management TikTok',
    'operating leader productivity',
    'team efficiency AI tools'
  ]
};

// Hashtag rotation (high-quality creator-coined tags)
const EBOOK_HASHTAGS = {
  ebook_solo: ['solopreneur', 'indiehackers', 'onepersonbusiness', 'buildinpublic', 'digitalnomad'],
  ebook_operator: ['revops', 'saassales', 'productmanagement', 'b2bmarketing', 'growthmarketing']
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

// ── KEYWORD SEARCH: /tt/keyword/search with get_author_stats=true ──────────
// Returns 15 posts WITH full author stats (follower_count, heart_count, etc.)
// Cost: 16 units for 15 posts
async function searchTikTokKeywords(keyword) {
  const url = `https://ensembledata.com/apis/tt/keyword/search?keyword=${encodeURIComponent(keyword)}&depth=1&get_author_stats=true&token=${TOKEN}`;
  return edFetch(url);
}

// ── HASHTAG SEARCH: /tt/hashtag/posts ─────────────────────────────────────
// Returns ~20 posts with author info for a given hashtag
// Cost: 1 unit
async function searchTikTokHashtag(hashtag) {
  const url = `https://ensembledata.com/apis/tt/hashtag/posts?name=${encodeURIComponent(hashtag)}&cursor=0&token=${TOKEN}`;
  return edFetch(url);
}

// ── USER INFO: /tt/user/info ─────────────────────────────────────────────
// Returns ins_id (Instagram handle), youtube_channel_id, bio_email, bio_link
// Cost: 1 unit
async function getTikTokUserInfo(username) {
  const url = `https://ensembledata.com/apis/tt/user/info?username=${encodeURIComponent(username)}&token=${TOKEN}`;
  return edFetch(url);
}

// ── ICP classification ───────────────────────────────────────────────────
function classifyIcp(desc, keywordSet) {
  const lower = (desc || '').toLowerCase();
  if (keywordSet === 'ebook_solo') {
    const soloKw = ['solopreneur','indie','freelance','one person','solo founder','digital nomad','side hustle'];
    return soloKw.some(k => lower.includes(k)) ? 'ebook_solo' : null;
  }
  if (keywordSet === 'ebook_operator') {
    const opKw = ['revops','sales ops','product manager','operations','b2b','saas','growth','team lead'];
    return opKw.some(k => lower.includes(k)) ? 'ebook_operator' : null;
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

// ── Upsert influencer ────────────────────────────────────────────────────
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
        notes = COALESCE(influencer_pipeline.notes, '') || E'\n[Updated ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '] via TT ebook sync'
    `, [
      row.handle, row.platform, row.platform_primary, row.icp_target,
      row.followers, row.profile_url, row.notes, row.status,
      row.email, row.email_source, row.engagement_rate, row.platform_external_id
    ]);
  } finally {
    client.release();
  }
}

// ── Process keyword search results ──────────────────────────────────────
async function processKeywordResults(data, icpBase, budgetKey) {
  const raw = data?.data;
  const posts = Array.isArray(raw) ? raw : (raw?.posts || raw?.items || raw?.aweme_list || []);
  let inserted = 0;

  for (const post of posts.slice(0, 15)) {
    // Author stats are returned inline with get_author_stats=true
    const author = post?.author || post?.author_info || {};
    if (!author?.unique_id && !author?.nickname) continue;

    const handle = author.unique_id || author.nickname;
    const followers = author.follower_count || 0;

    // Skip mega-creators (unlikely to collab) and sub-1K (too small)
    if (followers > 1000000 || followers < 1000) continue;

    // Check dedup
    if (await isDuplicate(handle)) continue;

    // ICP classification from post description + author bio
    const desc = post?.desc || post?.body || '';
    const bio = author.signature || '';
    const combined = `${desc} ${bio}`;
    const icpTarget = classifyIcp(combined, icpBase) || icpBase;

    // Extract engagement metrics from post stats
    const stats = post?.statistics || {};
    const likes = stats.digg_count || 0;
    const comments = stats.comment_count || 0;
    const shares = stats.share_count || 0;
    const er = followers > 0
      ? ((likes + comments + shares) / followers * 100).toFixed(2)
      : null;

    // Try to get email from bio
    const email = extractEmail(bio);

    await upsertInfluencer({
      handle,
      platform: 'TikTok',
      platform_primary: 'tiktok',
      icp_target: icpTarget,
      followers,
      profile_url: `https://www.tiktok.com/@${handle}`,
      notes: `Auto-discovered via TT keyword: "${post.keyword || ''}". Bio: ${(bio||'').substring(0, 100)}`,
      status: 'Identified',
      email,
      email_source: email ? 'bio' : null,
      engagement_rate: er,
      platform_external_id: author.sec_uid || null
    });
    inserted++;
  }

  return inserted;
}

// ── Process hashtag search results ───────────────────────────────────────
async function processHashtagResults(data, icpBase, budgetKey) {
  const raw = data?.data;
  const posts = Array.isArray(raw) ? raw : (raw?.data || raw?.posts || raw?.aweme_list || []);
  let inserted = 0;

  for (const post of posts.slice(0, 20)) {
    const author = post?.author || {};
    if (!author?.unique_id && !author?.nickname) continue;

    const handle = author.unique_id || author.nickname;
    const followers = author.follower_count || 0;
    if (followers > 1000000 || followers < 1000) continue;
    if (await isDuplicate(handle)) continue;

    const desc = post?.desc || '';
    const bio = author.signature || '';
    const icpTarget = classifyIcp(`${desc} ${bio}`, icpBase) || icpBase;

    const stats = post?.statistics || {};
    const likes = stats.digg_count || 0;
    const comments = stats.comment_count || 0;
    const shares = stats.share_count || 0;
    const er = followers > 0
      ? ((likes + comments + shares) / followers * 100).toFixed(2)
      : null;

    const email = extractEmail(bio);

    await upsertInfluencer({
      handle,
      platform: 'TikTok',
      platform_primary: 'tiktok',
      icp_target: icpTarget,
      followers,
      profile_url: `https://www.tiktok.com/@${handle}`,
      notes: `Auto-discovered via TT hashtag: "${post.hashtag || ''}". Bio: ${(bio||'').substring(0, 100)}`,
      status: 'Identified',
      email,
      email_source: email ? 'bio' : null,
      engagement_rate: er,
      platform_external_id: author.sec_uid || null
    });
    inserted++;
  }

  return inserted;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  let totalInserted = 0;
  let totalUnits = 0;
  const budgetKey = 'ebook_tiktok';

  // Process keywords for both ICPs
  for (const [icp, keywords] of Object.entries(EBOOK_KEYWORDS)) {
    for (const kw of keywords) {
      console.log(`🔍 Keyword search: "${kw}" (${icp})...`);

      const check = await budgetTracker.checkBudget(budgetKey, 20);
      if (!check.allowed) {
        console.warn(`Budget exhausted for ${budgetKey}`);
        break;
      }

      try {
        const results = await searchTikTokKeywords(kw);
        totalUnits += 16; // get_author_stats=true cost
        await budgetTracker.recordUsage(budgetKey, 16);

        const inserted = await processKeywordResults(results, icp, budgetKey);
        totalInserted += inserted;
        console.log(`  → ${inserted} new influencers`);
      } catch(e) {
        console.error(`Error on "${kw}": ${e.message}`);
      }

      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }
  }

  // Process hashtags (cheaper, good for micro-influencers)
  for (const [icp, hashtags] of Object.entries(EBOOK_HASHTAGS)) {
    for (const tag of hashtags) {
      console.log(`🏷️ Hashtag search: #${tag} (${icp})...`);

      const check = await budgetTracker.checkBudget(budgetKey, 5);
      if (!check.allowed) {
        console.warn(`Budget exhausted for ${budgetKey}`);
        break;
      }

      try {
        const results = await searchTikTokHashtag(tag);
        totalUnits += 1;
        await budgetTracker.recordUsage(budgetKey, 1);

        const inserted = await processHashtagResults(results, icp, budgetKey);
        totalInserted += inserted;
        console.log(`  → ${inserted} new influencers`);
      } catch(e) {
        console.error(`Error on #${tag}: ${e.message}`);
      }

      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`📊 TikTok Ebook Sync Complete`);
  console.log(`   New influencers: ${totalInserted}`);
  console.log(`   Units spent: ${totalUnits}`);
  console.log(`══════════════════════════════════════════`);

  await pool.end();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
