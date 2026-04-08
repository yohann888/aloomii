/**
 * Fleet-to-Dashboard Bridge 1: Signal Scout → DB
 * Writes signals to both `signals` and `prospect_signals` tables.
 * Resilient, non-fatal, uses strict connection safety.
 *
 * Usage:
 *   node scripts/bridge/ingest-signal.js '{"handle":"u/test","company":"Acme","signal_type":"reddit_signal","signal_source":"reddit","signal_text":"Looking for SDR...","signal_url":"https://reddit.com/r/sales/...","relevance_score":0.8,"score":4}'
 */

const { Client } = require('pg');
const crypto = require('crypto');

const DB_URL = 'postgresql://superhana@localhost:5432/aloomii';

const SIGNAL_TYPE_MAP = {
  'reddit_signal': 'reddit_signal',
  'indiehackers_signal': 'indiehackers_signal',
  'buying_signal': 'other',
  'pain_signal': 'other',
  'sales_intel_dwy': 'other',
  'pipeline_health': 'other',
  'sdr_replacement': 'other',
  'consulting': 'other',
  'funding_announced': 'funding',
  'expansion_signal': 'other',
  'job_change': 'job_change',
  'hiring': 'hiring',
  'product_launch': 'product_launch',
};

const SIGNAL_SOURCE_MAP = {
  'reddit': 'reddit',
  'x': 'x_search',
  'x_search': 'x_search',
  'twitter': 'x_search',
  'linkedin': 'linkedin',
  'indiehackers': 'indiehackers',
  'scrapling': 'scrapling',
  'job_board': 'job_board',
};

/**
 * Generate deterministic signal hash for deduplication
 */
function generateSignalHash(signalUrl, handle, signalText) {
  const text = (signalText || '').slice(0, 100);
  const input = `${signalUrl || ''}|${handle || ''}|${text}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Main ingest function
 */
async function ingestSignal(payload) {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Invalid payload' };
  }

  const {
    handle,
    company,
    signal_type: rawType,
    signal_source: rawSource,
    signal_text,
    signal_url,
    relevance_score = 0.5,
    score = 3,
    scoring_reason,
    icp_match,
  } = payload;

  if (!signal_text || !signal_url) {
    return { success: false, error: 'signal_text and signal_url are required' };
  }

  const client = new Client({
    connectionString: DB_URL,
    connectionTimeoutMillis: 2000,
    statement_timeout: 3000,
  });

  let result = { success: false, inserted: false, signal_id: null, prospect_signal_id: null };

  try {
    await client.connect();

    const signalType = SIGNAL_TYPE_MAP[rawType] || 'other';
    const signalSource = SIGNAL_SOURCE_MAP[rawSource] || 'other';
    const signalHash = generateSignalHash(signal_url, handle, signal_text);
    const title = (signal_text || '').slice(0, 120);

    // === 1. Insert into signals table (with dedup via unique index) ===
    // Merge scoring_reason and icp_match into raw_data (do not overwrite existing raw_data fields)
    const enrichedPayload = {
      ...payload,
      ...(scoring_reason != null ? { scoring_reason } : {}),
      ...(icp_match != null ? { icp_match } : {}),
    };

    const signalsQuery = `
      INSERT INTO signals (
        signal_type, source_bu, title, body, score,
        source_url, raw_data, collection_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (source_url)
      WHERE source_url IS NOT NULL AND source_url <> ''
      DO UPDATE SET raw_data = signals.raw_data || $7::jsonb
      RETURNING id
    `;

    const signalsResult = await client.query(signalsQuery, [
      signalType,
      'signal-scout',
      title,
      signal_text,
      parseFloat(score),
      signal_url,
      enrichedPayload,
      'bridge_ingest'
    ]);

    const signalId = signalsResult.rows[0]?.id;
    result.signal_id = signalId;

    // === 2. Insert into prospect_signals (with pre-flight dedup check) ===
    let clientId = null;
    try {
      const clientRes = await client.query('SELECT id FROM client_pilots LIMIT 1');
      clientId = clientRes.rows[0]?.id;
    } catch (e) {
      console.warn('Failed to get client_pilot id:', e.message);
    }

    if (clientId) {
      // Pre-flight dedup check (signal_hash is NOT a unique constraint)
      const dupCheck = await client.query(
        'SELECT id FROM prospect_signals WHERE signal_hash = $1 LIMIT 1',
        [signalHash]
      );

      if (dupCheck.rows.length === 0) {
        const psQuery = `
          INSERT INTO prospect_signals (
            client_id, handle, company, signal_type, signal_source,
            signal_text, signal_url, relevance_score, signal_hash
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `;

        const psResult = await client.query(psQuery, [
          clientId,
          handle || null,
          company || null,
          signalType,
          signalSource,
          signal_text,
          signal_url,
          parseFloat(relevance_score),
          signalHash
        ]);

        result.prospect_signal_id = psResult.rows[0]?.id;
        result.inserted = true;
      } else {
        result.skipped = true;
        result.reason = 'duplicate_signal_hash';
      }
    } else {
      result.skipped_prospect = true;
      result.reason = 'no_client_pilot_found';
    }

    result.success = true;

  } catch (error) {
    console.error('ingestSignal error:', error.message);
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
    console.error('Usage: node ingest-signal.js \'<json-payload>\'');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(input);
  } catch (e) {
    console.error('Invalid JSON payload');
    process.exit(1);
  }

  ingestSignal(payload)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err.message);
      process.exit(1);
    });
}

module.exports = { ingestSignal };
