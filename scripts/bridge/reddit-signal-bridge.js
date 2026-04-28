#!/usr/bin/env node
/**
 * reddit-signal-bridge.js v2
 *
 * Bridges high-severity Reddit pain/mood signals into prospect_signals.
 * Single-query CTE with inline deduplication (no ON CONFLICT needed).
 *
 * Runs every 6 hours via cron.
 * Cost: $0 per run (pure SQL, no LLM calls)
 * Speed target: <500ms for 200 signals
 */

'use strict';

const { Pool } = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const ALOOMII_CLIENT_ID = '3de76741-bc17-4050-b819-fcb899ffcead'; // Self-client

const PAIN_THRESHOLD = parseInt(process.env.PAIN_THRESHOLD, 10) || 7;
const MOOD_THRESHOLD = parseInt(process.env.MOOD_THRESHOLD, 10) || 8;
const LOOKBACK_HOURS = parseInt(process.env.LOOKBACK_HOURS, 10) || 6;

const pool = new Pool({
  connectionString: DB_URL,
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

const BRIDGE_SQL = `
WITH existing_hashes AS (
  SELECT DISTINCT signal_hash FROM prospect_signals
  WHERE signal_hash LIKE 'reddit_pain_%' OR signal_hash LIKE 'reddit_mood_%'
),
pain_candidates AS (
  SELECT
    'reddit_signal'::text AS signal_type,
    'reddit'::text AS signal_source,
    ps.verbatim_quote AS signal_text,
    COALESCE('https://www.reddit.com' || rp.permalink, rp.url) AS signal_url,
    LEAST(ps.severity / 10.0, 1.0) AS relevance_score,
    'reddit_pain_' || ps.source_id AS signal_hash,
    ps.created_at
  FROM pain_signals ps
  LEFT JOIN reddit_posts rp ON rp.id = ps.source_id
  WHERE ps.severity >= $1::int
    AND ps.created_at >= NOW() - ($3::int * INTERVAL '1 hour')
    AND COALESCE('https://www.reddit.com' || rp.permalink, rp.url) IS NOT NULL
),
mood_candidates AS (
  SELECT
    'reddit_signal'::text AS signal_type,
    'reddit'::text AS signal_source,
    CASE
      WHEN jsonb_typeof(ms.verbatim_phrases) = 'array' THEN
        (SELECT string_agg(elem::text, ' | ')
         FROM jsonb_array_elements_text(ms.verbatim_phrases) elem)
      ELSE ms.verbatim_phrases::text
    END AS signal_text,
    COALESCE('https://www.reddit.com' || rp.permalink, rp.url) AS signal_url,
    LEAST(ms.emotional_punch / 10.0, 1.0) AS relevance_score,
    'reddit_mood_' || ms.source_id AS signal_hash,
    ms.created_at
  FROM mood_signals ms
  LEFT JOIN reddit_posts rp ON rp.id = ms.source_id
  WHERE ms.emotional_punch >= $2::int
    AND ms.created_at >= NOW() - ($3::int * INTERVAL '1 hour')
    AND COALESCE('https://www.reddit.com' || rp.permalink, rp.url) IS NOT NULL
),
all_candidates AS (
  SELECT * FROM pain_candidates
  UNION ALL
  SELECT * FROM mood_candidates
),
new_candidates AS (
  SELECT c.* FROM all_candidates c
  LEFT JOIN existing_hashes eh ON eh.signal_hash = c.signal_hash
  WHERE eh.signal_hash IS NULL
)
INSERT INTO prospect_signals (
  client_id,
  signal_type,
  signal_source,
  signal_text,
  signal_url,
  relevance_score,
  signal_hash,
  acted_on,
  captured_at
)
SELECT
  $4::uuid,
  signal_type,
  signal_source,
  signal_text,
  signal_url,
  relevance_score,
  signal_hash,
  false,
  created_at
FROM new_candidates
RETURNING signal_hash;
`;

async function bridgeSignals() {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    await client.query('BEGIN');

    const result = await client.query(BRIDGE_SQL, [
      PAIN_THRESHOLD,
      MOOD_THRESHOLD,
      LOOKBACK_HOURS,
      ALOOMII_CLIENT_ID,
    ]);

    await client.query('COMMIT');

    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Bridge complete: ${result.rowCount} inserted. Duration: ${duration}ms`);

    return { inserted: result.rowCount, duration_ms: duration };

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[${new Date().toISOString()}] Bridge failed:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  bridgeSignals()
    .then(async (result) => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { bridgeSignals };
