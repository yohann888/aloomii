#!/usr/bin/env node
// email-backfill.js — Cross-platform email resolution on existing influencer_pipeline rows
// Uses EnsembleData API to resolve emails via cross-platform lookups
// Expected: 4.5% → ~25% email coverage on existing 291 rows
// Cost: ~1500 units (one day's budget)

const https = require('https');
const { Pool } = require('pg');

const TOKEN = process.env.ENSEMBLEDATA_TOKEN || 'mYhi8PoTRudPx31j';
const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const pool = new Pool({ connectionString: DB_URL });

// Track budget usage per pipeline
const budgetKey = 'email_backfill';
let totalUnits = 0;

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
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch(e) {
          reject(new Error(`Invalid JSON: ${body.substring(0,200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ── YouTube enrichment ───────────────────────────────────────────────────────
// Endpoint: /youtube/channel/detailed-info?browseId={id}&get_additional_info=true
// Returns: data.metadata.business_email, data.about.details.contact.email,
//          data.about.details.links[].url
async function enrichYouTube(handle, profileUrl) {
  // Extract channel ID from profile URL: https://www.youtube.com/channel/{ID}
  const match = profileUrl?.match(/channel\/([\w\-]+)/);
  if (!match) return null;
  const channelId = match[1];

  const url = `https://ensembledata.com/apis/youtube/channel/detailed-info?browseId=${channelId}&get_additional_info=true&token=${TOKEN}`;
  const data = await edFetch(url);
  totalUnits += 4; // 2u base + 2u for additional_info

  const about = data?.data?.about?.details || {};
  const meta = data?.data?.metadata || {};

  // Primary: explicit business email
  let email = meta.business_email || about.contact?.email || null;
  let source = email ? 'youtube_business_email' : null;

  // Secondary: link in about page that might be a Linktree/Beacons
  let externalUrl = null;
  if (!email && about.links?.length > 0) {
    externalUrl = about.links.find(l => l.url)?.url || about.links[0].url;
  }

  return { email, source, external_url: externalUrl, platform_external_id: channelId };
}

// ── TikTok enrichment ────────────────────────────────────────────────────────
// Endpoint: /tt/user/info?username={handle}
// Returns: user.ins_id (Instagram handle), user.youtube_channel_id,
//          user.bio_email, user.bio_link.link
async function enrichTikTok(handle) {
  const url = `https://ensembledata.com/apis/tt/user/info?username=${encodeURIComponent(handle)}&token=${TOKEN}`;
  const data = await edFetch(url);
  totalUnits += 1;

  const user = data?.data?.user || data?.user || {};

  // Direct TikTok bio email
  let email = user.bio_email || null;
  let source = email ? 'tiktok_bio_email' : null;
  let crossRefResult = null;

  // Cross-reference: Instagram → public_email
  const igHandle = user.ins_id || user.instagram_id || null;
  if (!email && igHandle) {
    crossRefResult = await enrichInstagram(igHandle);
    if (crossRefResult?.email) {
      email = crossRefResult.email;
      source = 'instagram_public_email_via_tiktok';
      totalUnits += crossRefResult.units_spent;
    }
  }

  // Cross-reference: YouTube channel → business_email
  const ytChannelId = user.youtube_channel_id || null;
  if (!email && ytChannelId) {
    const yt = await enrichYouTubeById(ytChannelId);
    if (yt?.email) {
      email = yt.email;
      source = 'youtube_business_email_via_tiktok';
      totalUnits += yt.units_spent;
    }
  }

  return {
    email,
    source,
    external_url: user.bio_link?.link || user.bio_url || null,
    platform_external_id: user.sec_uid || null,
    cross_ref: crossRefResult
  };
}

// ── Instagram enrichment (standalone or cross-ref) ─────────────────────────
// Endpoint: /instagram/user/detailed-info?username={handle}
// Returns: data.public_email, data.business_email, data.bio_links[].url
async function enrichInstagram(handle) {
  const url = `https://ensembledata.com/apis/instagram/user/detailed-info?username=${encodeURIComponent(handle)}&token=${TOKEN}`;
  const data = await edFetch(url);
  const units = 10; // documented cost

  const ig = data?.data || {};
  let email = ig.public_email || ig.business_email || null;
  let source = email ? 'instagram_public_email' : null;

  // Bio links as fallback
  let externalUrl = null;
  if (!email && ig.bio_links?.length > 0) {
    externalUrl = ig.bio_links.find(l => l.url)?.url || ig.bio_links[0].url;
  }
  if (!email && ig.external_url) {
    externalUrl = ig.external_url;
  }

  return {
    email,
    source,
    external_url: externalUrl,
    platform_external_id: ig.id || null,
    units_spent: units
  };
}

// Helper: enrich YouTube by channel ID (for TikTok cross-ref)
async function enrichYouTubeById(channelId) {
  const url = `https://ensembledata.com/apis/youtube/channel/detailed-info?browseId=${channelId}&get_additional_info=true&token=${TOKEN}`;
  const data = await edFetch(url);
  const units = 4;

  const about = data?.data?.about?.details || {};
  const meta = data?.data?.metadata || {};
  const email = meta.business_email || about.contact?.email || null;

  return { email, source: 'youtube_business_email', units_spent: units };
}

// ── Twitter/X enrichment ─────────────────────────────────────────────────────
// Endpoint: /twitter/user/info?username={handle}
// Returns: legacy.entities.url.urls[].expanded_url (bypasses t.co)
async function enrichTwitter(handle) {
  const url = `https://ensembledata.com/apis/twitter/user/info?username=${encodeURIComponent(handle)}&token=${TOKEN}`;
  const data = await edFetch(url);
  totalUnits += 2; // documented cost

  const legacy = data?.data?.legacy || data?.legacy || {};
  const entities = legacy.entities || {};

  // External URL (bypass t.co shortener)
  let externalUrl = null;
  if (entities.url?.urls?.length > 0) {
    externalUrl = entities.url.urls[0].expanded_url || entities.url.urls[0].url;
  }

  // Email regex on bio description
  const desc = legacy.description || '';
  const emailMatch = desc.match(/[\w.\+\-]+@[\w\-]+\.[\w\-]+/);
  let email = emailMatch ? emailMatch[0] : null;
  let source = email ? 'twitter_bio' : null;

  return { email, source, external_url: externalUrl, platform_external_id: legacy.id_str || null };
}

// ── Main backfill loop ───────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  let processed = 0;
  let found = 0;
  let errors = 0;

  try {
    // Get all NULL-email influencers, ordered by platform (YouTube first — highest yield)
    const { rows } = await client.query(`
      SELECT id, handle, platform_primary, profile_url, icp_target
      FROM influencer_pipeline
      WHERE email IS NULL
        AND status IN ('Identified', 'active', 'pending')
      ORDER BY
        CASE platform_primary
          WHEN 'youtube' THEN 1
          WHEN 'tiktok' THEN 2
          WHEN 'instagram' THEN 3
          WHEN 'twitter' THEN 4
          ELSE 5
        END,
        followers DESC NULLS LAST
    `);

    console.log(`🔍 Found ${rows.length} influencers without email. Starting backfill...`);
    console.log(`   YouTube: ${rows.filter(r => r.platform_primary === 'youtube').length}`);
    console.log(`   TikTok: ${rows.filter(r => r.platform_primary === 'tiktok').length}`);
    console.log(`   Instagram: ${rows.filter(r => r.platform_primary === 'instagram').length}`);
    console.log(`   Twitter: ${rows.filter(r => r.platform_primary === 'twitter').length}`);
    console.log(`   LinkedIn: ${rows.filter(r => r.platform_primary === 'linkedin').length}`);
    console.log(`   Other: ${rows.filter(r => !['youtube','tiktok','instagram','twitter','linkedin'].includes(r.platform_primary)).length}`);

    for (const row of rows) {
      processed++;
      let result = null;

      try {
        switch (row.platform_primary) {
          case 'youtube':
            result = await enrichYouTube(row.handle, row.profile_url);
            break;
          case 'tiktok':
            result = await enrichTikTok(row.handle);
            break;
          case 'instagram':
            result = await enrichInstagram(row.handle);
            totalUnits += result.units_spent;
            break;
          case 'twitter':
            result = await enrichTwitter(row.handle);
            break;
          default:
            console.log(`  [${processed}/${rows.length}] SKIP ${row.platform_primary}: ${row.handle} (unsupported platform)`);
            continue;
        }

        if (result?.email) {
          // Validate email format
          const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email);
          if (!isValid) {
            console.log(`  [${processed}/${rows.length}] INVALID email for ${row.handle}: ${result.email}`);
            continue;
          }

          await client.query(`
            UPDATE influencer_pipeline
            SET email = $1,
                email_source = $2,
                email_found_at = NOW(),
                platform_external_id = COALESCE($3, platform_external_id),
                notes = COALESCE(notes, '') || E'\n[Backfill ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '] Email resolved via ' || $2 || ': ' || $1 || E'\n'
            WHERE id = $4
          `, [result.email, result.source, result.platform_external_id || null, row.id]);

          found++;
          console.log(`  [${processed}/${rows.length}] ✅ ${row.platform_primary}: ${row.handle} → ${result.email} (${result.source})`);
        } else {
          console.log(`  [${processed}/${rows.length}] ❌ ${row.platform_primary}: ${row.handle} (no email found)`);
        }

        // Rate limit: 2 calls/sec max to be safe
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        errors++;
        console.error(`  [${processed}/${rows.length}] ERROR ${row.platform_primary}: ${row.handle} — ${err.message}`);
        // Continue on error — don't let one bad row kill the batch
      }

      // Budget safety: stop if we're approaching the daily reserve
      if (totalUnits > 1400) {
        console.log(`\n⚠️ Budget cutoff at ${totalUnits} units. Stopping to preserve reserve.`);
        break;
      }
    }

    console.log(`\n══════════════════════════════════════════`);
    console.log(`📊 Email Backfill Complete`);
    console.log(`   Processed: ${processed}/${rows.length}`);
    console.log(`   Found: ${found} new emails`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total units spent: ${totalUnits}`);
    console.log(`   Email coverage: ${found}/${rows.length} = ${(found/rows.length*100).toFixed(1)}%`);
    console.log(`══════════════════════════════════════════`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
