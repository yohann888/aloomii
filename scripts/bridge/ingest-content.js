/**
 * Fleet-to-Dashboard Bridge 2: Content → DB
 * Writes content briefs and posts to `content_posts` table.
 * Resilient, non-fatal, uses strict connection safety.
 *
 * Usage:
 *   node scripts/bridge/ingest-content.js '{"platform":"pbn","post_type":"brief","topic":"Weekly Content Brief","content_text":"...full brief...","scheduled_at":"2026-04-06T08:00:00Z"}'
 */

const { Client } = require('pg');

const DB_URL = 'postgresql://superhana@localhost:5432/aloomii';

/**
 * Main ingest function
 */
async function ingestContent(payload) {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Invalid payload' };
  }

  const {
    platform,
    post_type,
    topic,
    content_text,
    media_url,
    scheduled_at,
    adapter,
    brand_profile_id
  } = payload;

  if (!platform || !content_text) {
    return { success: false, error: 'platform and content_text are required' };
  }

  const client = new Client({
    connectionString: DB_URL,
    connectionTimeoutMillis: 2000,
    statement_timeout: 3000,
  });

  let result = { success: false, inserted: false, post_id: null };

  try {
    await client.connect();

    const now = new Date();
    const publishedAt = scheduled_at ? null : now;
    const scheduledAt = scheduled_at ? new Date(scheduled_at) : null;

    const queryText = `
      INSERT INTO content_posts (
        platform, post_type, topic, content_text, media_url,
        scheduled_at, published_at, adapter, brand_profile_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const queryParams = [
      platform,
      post_type || 'post',
      topic || 'Untitled',
      content_text,
      media_url || null,
      scheduledAt,
      publishedAt,
      adapter || 'bridge_ingest',
      brand_profile_id || null
    ];

    const res = await client.query(queryText, queryParams);

    result.post_id = res.rows[0].id;
    result.inserted = true;
    result.success = true;

  } catch (error) {
    console.error('ingestContent error:', error.message);
    result.error = error.message;
  } finally {
    try {
      await client.end();
    } catch (e) {
      console.warn('Failed to close client:', e.message);
    }
  }

  return result;
}

/**
 * CLI handler
 */
if (require.main === module) {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node ingest-content.js \'<json-payload>\'');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(input);
  } catch (e) {
    console.error('Invalid JSON payload');
    process.exit(1);
  }

  ingestContent(payload)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err.message);
      process.exit(1);
    });
}

module.exports = { ingestContent };
