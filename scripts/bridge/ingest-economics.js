/**
 * scripts/bridge/ingest-economics.js
 * Writes a daily cost snapshot to the economics_daily table.
 * Used by daily-spend-alert.js as part of Bridge C.
 *
 * Usage (CLI):
 *   node scripts/bridge/ingest-economics.js '{"date":"2026-04-06","cost_usd":4.32,"input_tokens":500000,"output_tokens":120000}'
 *
 * Usage (require):
 *   const { ingestEconomics } = require('./bridge/ingest-economics');
 *   await ingestEconomics({ date, cost_usd, input_tokens, output_tokens, metadata });
 */

'use strict';

const { Pool } = require('pg');

const DB_URL = 'postgresql://superhana@localhost:5432/aloomii';

/**
 * @param {Object} opts
 * @param {string} opts.date          - YYYY-MM-DD
 * @param {number} opts.cost_usd     - Total cost in USD
 * @param {number} [opts.input_tokens=0]
 * @param {number} [opts.output_tokens=0]
 * @param {number} [opts.cache_read_tokens=0]
 * @param {number} [opts.cache_write_tokens=0]
 * @param {Object} [opts.metadata]
 */
async function ingestEconomics(opts) {
  const {
    date,
    cost_usd,
    input_tokens = 0,
    output_tokens = 0,
    cache_read_tokens = 0,
    cache_write_tokens = 0,
    metadata = null,
  } = opts;

  if (!date || cost_usd == null) {
    throw new Error('ingestEconomics requires date and cost_usd');
  }

  const pool = new Pool({
    connectionString: DB_URL,
    connectionTimeoutMillis: 2000,
  });

  let client;
  try {
    client = await pool.connect();

    // Set statement timeout to 3 seconds
    await client.query("SET statement_timeout = '3000'");

    const sql = `
      INSERT INTO economics_daily (date, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (date) DO UPDATE SET
        cost_usd          = EXCLUDED.cost_usd,
        input_tokens     = EXCLUDED.input_tokens,
        output_tokens    = EXCLUDED.output_tokens,
        cache_read_tokens = EXCLUDED.cache_read_tokens,
        cache_write_tokens = EXCLUDED.cache_write_tokens,
        metadata         = COALESCE(EXCLUDED.metadata, economics_daily.metadata),
        created_at       = NOW()
      RETURNING id, date, cost_usd
    `;

    const res = await client.query(sql, [
      date,
      cost_usd,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_write_tokens,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    return { ok: true, row: res.rows[0] };
  } catch (err) {
    console.error('[ingest-economics] DB error:', err.message);
    return { ok: false, error: err.message };
  } finally {
    if (client) await client.end();
  }
}

module.exports = { ingestEconomics };

// CLI entry point
if (require.main === module) {
  const raw = process.argv[2];
  if (!raw) {
    console.error('Usage: node ingest-economics.js \'{"date":"...","cost_usd":...}\'');
    process.exit(1);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }

  ingestEconomics(input)
    .then((result) => {
      if (result.ok) {
        console.log('[ingest-economics] Saved:', JSON.stringify(result.row));
      } else {
        console.error('[ingest-economics] Failed:', result.error);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('[ingest-economics] Fatal:', err.message);
      process.exit(1);
    });
}
