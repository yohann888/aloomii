#!/usr/bin/env node
/**
 * sync-buffer-to-db.js (REVISED by Gemini 3.1 Pro)
 * One-time bootstrap: Pulls LinkedIn drafts from Buffer into our DB.
 * 
 * DB = Source of Truth.
 * Buffer is only the final distribution endpoint.
 * 
 * Run: node scripts/bridge/sync-buffer-to-db.js
 * 
 * Post-run recommendation:
 * ALTER TABLE content_posts ADD CONSTRAINT IF NOT EXISTS unique_external_id UNIQUE (external_id);
 */

const https = require('https');
const { Client } = require('pg');

const BUFFER_TOKEN = 'GkB7cingsMpgX-DpfbRwdqAN1Spir8QxeEe7gp_9Jn1';
const ORG_ID = '69c5d72e44dbc563b3e02e34';
const CHANNELS = {
  yohann: '69c5d74baf47dacb695bff50',
  jenny: '69cec9b0af47dacb69816953'
};

const DB_URL = 'postgresql://superhana@localhost:5432/aloomii';

const NEWSLETTER_CTA = '\n\n---\n\n✉️ Want the last 20% that makes the difference? Subscribe to The Last 20%:\nhttps://www.linkedin.com/newsletters/the-last-20-7445126674708451328';

async function query(sql, params = []) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function fetchBufferDrafts(channelId, label) {
  // Improved: Use documented `posts` query with status filter (safer than undocumented drafts field)
  const graphqlQuery = JSON.stringify({
    query: `
      query GetDrafts($organizationId: ID!, $channelId: ID!) {
        posts(input: {
          organizationId: $organizationId,
          filter: {
            channelIds: [$channelId],
            status: [draft]
          }
        }) {
          edges {
            node {
              id
              text
              createdAt
              updatedAt
              status
            }
          }
        }
      }
    `,
    variables: {
      organizationId: ORG_ID,
      channelId: channelId
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.buffer.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BUFFER_TOKEN}`,
        'Content-Length': Buffer.byteLength(graphqlQuery)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const nodes = json?.data?.posts?.edges?.map(e => e.node) || [];
          console.log(`[${label}] Found ${nodes.length} drafts in Buffer`);
          resolve(nodes);
        } catch (e) {
          console.error(`[${label}] Failed to parse:`, e.message, data);
          resolve([]);
        }
      });
    });

    req.on('error', (e) => { console.error(`[${label}] Request error:`, e); resolve([]); });
    req.write(graphqlQuery);
    req.end();
  });
}

async function upsertDraftToDb(draft, adapter) {
  const textWithCTA = draft.text?.includes('The Last 20%') ? 
    draft.text : 
    (draft.text || '') + NEWSLETTER_CTA;

  try {
    // Safer idempotent upsert (no reliance on missing constraint/column)
    const exists = await query(
      'SELECT id FROM content_posts WHERE external_id = $1',
      [draft.id]
    );

    let result;
    if (exists.rows.length > 0) {
      // Update existing
      result = await query(`
        UPDATE content_posts 
        SET content_text = $1, 
            status = 'draft'
        WHERE external_id = $2 
        RETURNING id
      `, [textWithCTA, draft.id]);
      console.log(`[${adapter}] Updated draft ${draft.id}`);
    } else {
      // Insert new
      result = await query(`
        INSERT INTO content_posts (
          platform, post_type, topic, content_text, adapter, 
          external_id, status, published_at, original_text
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $4)
        RETURNING id
      `, [
        'linkedin',
        'draft',
        `LinkedIn Draft - ${adapter}`,
        textWithCTA,
        adapter,
        draft.id,
        'draft'
      ]);
      console.log(`[${adapter}] Inserted draft ${draft.id} → DB ID ${result.rows[0].id}`);
    }
    return result.rows[0].id;
  } catch (e) {
    console.error(`Failed to sync draft ${draft.id}:`, e.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Syncing Buffer LinkedIn drafts to DB (revised)...');
  
  for (const [adapter, channelId] of Object.entries(CHANNELS)) {
    const drafts = await fetchBufferDrafts(channelId, adapter);
    for (const draft of drafts) {
      await upsertDraftToDb(draft, adapter);
    }
  }
  
  console.log('\n✅ Buffer → DB sync complete.');
  console.log('Recommendation: Add UNIQUE constraint on external_id and add updated_at column if needed.');
  console.log('DB is now the source of truth for drafts.');
}

main().catch(console.error);
