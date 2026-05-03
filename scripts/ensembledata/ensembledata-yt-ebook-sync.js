#!/usr/bin/env node
// ensembledata-yt-ebook-sync.js — YouTube discovery for Ebook ICPs (founder, solopreneur, operator)
// Uses /youtube/search to find channels, then /youtube/channel/detailed-info for enrichment
// Budget key: ebook_youtube

const https = require('https');
const { Pool } = require('pg');
const budgetTracker = require('./budget-tracker');

const TOKEN = process.env.ENSEMBLEDATA_TOKEN || 'mYhi8PoTRudPx31j';
const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const pool = new Pool({ connectionString: DB_URL });

const EBOOK_KEYWORDS = {
  ebook_founder: [
    'founder sales strategy',
    'startup GTM playbook',
    'bootstrapped SaaS growth',
    'founder led growth',
    'B2B startup sales'
  ],
  ebook_solo: [
    'solopreneur business tips',
    'indie hacker revenue',
    'one person business growth',
    'build in public startup',
    'freelance to founder'
  ],
  ebook_operator: [
    'RevOps strategy',
    'B2B sales operations',
    'product management SaaS',
    'revenue operations framework',
    'GTM operations playbook'
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

// ── SEARCH: /youtube/search ───────────────────────────────────────────────
// Returns video results; we extract channel IDs from them
// Cost: ~1-2 units per search
async function searchYouTube(keyword) {
  const url = `https://ensembledata.com/apis/youtube/search?keyword=${encodeURIComponent(keyword)}&depth=1&token=${TOKEN}`;
  return edFetch(url);
}

// ── CHANNEL INFO: /youtube/channel/detailed-info ────────────────────────
// Returns about page, metadata, business email
// Cost: 2 units
async function getYouTubeChannelInfo(channelId) {
  const url = `https://ensembledata.com/apis/youtube/channel/detailed-info?browseId=${channelId}&get_additional_info=true&token=${TOKEN}`;
  return edFetch(url);
}

// ── ICP classification ─────────────────────────────────────────────────
function classifyIcp(text, icpBase) {
  const lower = (text || '').toLowerCase();
  if (icpBase === 'ebook_solo') {
    const soloKw = ['solopreneur','indie','freelance','one person','solo founder','digital nomad','side hustle'];
    return soloKw.some(k => lower.includes(k)) ? 'ebook_solo' : null;
  }
  if (icpBase === 'ebook_operator') {
    const opKw = ['revops','sales ops','product manager','operations','b2b','saas','growth','team lead'];
    return opKw.some(k => lower.includes(k)) ? 'ebook_operator' : null;
  }
  if (icpBase === 'ebook_founder') {
    const founderKw = ['founder','startup','gtm','go-to-market','bootstrapped','b2b saas'];
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
        notes = COALESCE(influencer_pipeline.notes, '') || E'\n[Updated ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '] via YT ebook sync'
    `, [
      row.handle, row.platform, row.platform_primary, row.icp_target,
      row.followers, row.profile_url, row.notes, row.status,
      row.email, row.email_source, row.engagement_rate, row.platform_external_id
    ]);
  } finally {
    client.release();
  }
}

// ── Process search results ──────────────────────────────────────────────
async function processSearchResults(data, icpBase, budgetKey) {
  const posts = data?.data?.posts || [];
  let inserted = 0;
  const channelIdsSeen = new Set();

  for (const post of posts.slice(0, 20)) {
    const renderer = post?.videoRenderer || {};
    const channelId = renderer?.channelId;
    const title = renderer?.title?.runs?.[0]?.text || '';
    
    if (!channelId || channelIdsSeen.has(channelId)) continue;
    channelIdsSeen.add(channelId);

    // Check budget for channel info lookup
    const check = await budgetTracker.checkBudget(budgetKey, 3);
    if (!check.allowed) {
      console.warn(`  Budget exhausted for ${budgetKey}`);
      break;
    }

    try {
      const chInfo = await getYouTubeChannelInfo(channelId);
      await budgetTracker.recordUsage(budgetKey, 2);

      const about = chInfo?.data?.about?.details || {};
      const meta = chInfo?.data?.metadata || {};
      const handle = meta?.title || channelId;
      const subs = meta?.subscriber_count || about?.stats?.subscriberCount || 0;
      const followers = typeof subs === 'string' 
        ? parseInt(subs.replace(/[^0-9]/g, '')) 
        : subs;

      // Skip mega-creators and too-small channels
      if (followers > 5000 || followers < 1000) continue;
      if (await isDuplicate(handle)) continue;

      const bio = about?.description || meta?.description || '';
      const icpTarget = classifyIcp(`${title} ${bio}`, icpBase) || icpBase;
      
      // Extract email from business_email or about links
      let email = meta.business_email || about?.contact?.email || null;
      let emailSource = email ? 'youtube_business_email' : null;
      
      if (!email && about?.links?.length > 0) {
        const linkUrls = about.links.map(l => l.url || '').join(' ');
        email = extractEmail(linkUrls);
        if (email) emailSource = 'youtube_about_links';
      }

      // Engagement rate estimate from video view ratios
      const viewCount = parseInt((renderer?.viewCountText?.simpleText || '').replace(/[^0-9]/g, '')) || 0;
      const er = followers > 0 ? ((viewCount / followers) * 100).toFixed(2) : null;

      await upsertInfluencer({
        handle,
        platform: 'YouTube',
        platform_primary: 'youtube',
        icp_target: icpTarget,
        followers,
        profile_url: `https://www.youtube.com/channel/${channelId}`,
        notes: `Auto-discovered via YT search: "${title?.substring(0, 80)}...". Bio: ${bio.substring(0, 100)}`,
        status: 'Identified',
        email,
        email_source: emailSource,
        engagement_rate: er,
        platform_external_id: channelId
      });
      inserted++;
      console.log(`  ✓ ${handle} (${followers.toLocaleString()} subs)`);

    } catch(e) {
      console.error(`  ✗ Error fetching channel ${channelId}: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 300)); // Rate limit
  }

  return inserted;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  let totalInserted = 0;
  let totalUnits = 0;
  const budgetKey = 'ebook_youtube';

  console.log('🎬 Starting YouTube ebook influencer discovery...\n');

  for (const [icp, keywords] of Object.entries(EBOOK_KEYWORDS)) {
    console.log(`📚 ICP: ${icp}`);
    for (const kw of keywords) {
      console.log(`  🔍 Searching: "${kw}"...`);
      
      const check = await budgetTracker.checkBudget(budgetKey, 5);
      if (!check.allowed) {
        console.warn(`  Budget exhausted for ${budgetKey}: ${check.remaining} remaining`);
        break;
      }

      try {
        const results = await searchYouTube(kw);
        totalUnits += 1;
        await budgetTracker.recordUsage(budgetKey, 1);

        const inserted = await processSearchResults(results, icp, budgetKey);
        totalInserted += inserted;
        console.log(`  → ${inserted} new influencers\n`);
      } catch(e) {
        console.error(`  Error on "${kw}": ${e.message}`);
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`📊 YouTube Ebook Sync Complete`);
  console.log(`   Total new influencers: ${totalInserted}`);
  console.log(`   Total units spent: ${totalUnits}`);
  console.log('══════════════════════════════════════════');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
