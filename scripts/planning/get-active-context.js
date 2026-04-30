#!/usr/bin/env node
/**
 * scripts/planning/get-active-context.js
 * Returns active (non-suppressed/quarantined) signals + entities
 * for PM brief synthesis. This is the canonical PM read boundary.
 *
 * Usage:
 *   node scripts/planning/get-active-context.js [daysBack]
 *
 * Output: JSON array of active signals, sorted by score desc, created_at desc
 *        Only rows where planning = 'active' (or NULL, legacy fallback)
 *
 * Integration point: called by senior-pm.js / pm-brief synthesis
 * before building the context for PM runs.
 */
'use strict';

const { Client } = require('pg');

const CONN = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const DAYS = parseInt(process.argv[2] || '7', 10);

async function main() {
  const client = new Client({ connectionString: CONN });

  try {
    await client.connect();

    // Active signals only — excludes quarantined/suppressed/archived
    // NULL planning = legacy pre-cutover rows, included with 'active' fallback
    const result = await client.query(`
      SELECT
        s.id,
        s.signal_type,
        s.title,
        s.body,
        s.score,
        s.confidence,
        s.source_bu,
        s.collection_method,
        s.source_url,
        s.created_at,
        s.planning,
        s.suppressed_at,
        s.suppress_reason,
        e.name        AS entity_name,
        e.entity_type AS entity_type
      FROM signals s
      LEFT JOIN entity_signals es ON es.signal_id = s.id
      LEFT JOIN entities e ON e.id = es.entity_id
      WHERE s.planning IN ('active', NULL)
        AND s.expires_at IS NULL
        AND s.created_at >= NOW() - INTERVAL '1 day' * $1
      ORDER BY s.score DESC, s.created_at DESC
      LIMIT 200
    `, [DAYS]);

    const output = {
      generated_at: new Date().toISOString(),
      days_back: DAYS,
      count: result.rowCount,
      signals: result.rows,
    };

    // Write to temp file for PM consumption (atomic write)
    const path = require('path');
    const fs   = require('fs');
    const outFile = `/Users/superhana/.openclaw/workspace/output/pm-active-signals-${Date.now()}.json`;
    fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

    console.log(JSON.stringify(output, null, 2));

  } catch (err) {
    console.error('[get-active-context] ERROR:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
