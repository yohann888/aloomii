#!/usr/bin/env node
/**
 * scripts/planning/suppress-entity.js
 * Marks a signal or entity as suppressed/quarantined to prevent
 * it from resurfacing in PM briefs.
 *
 * Usage:
 *   node scripts/planning/suppress-entity.js signal <uuid> suppressed "Jim Rogers — thread archived"
 *   node scripts/planning/suppress-entity.js entity <uuid> quarantined "Hallucinated UUID"
 *   node scripts/planning/suppress-entity.js signal <uuid> archived "15 months old"
 *
 * States: suppressed | quarantined | archived
 * Rollback: node scripts/planning/suppress-entity.js signal <uuid> active ""
 *
 * This is the operational tool for the "Present-Ad-1365 pattern":
 * stale artifacts get marked suppressed so they stop polluting PM synthesis.
 */
'use strict';

const { Client } = require('pg');

const CONN = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';

const tableMap = { signal: 'signals', entity: 'entities' };
const idColMap = { signal: 'signal_id', entity: 'entity_id' };

const VALID_STATES = ['active', 'suppressed', 'quarantined', 'archived'];

async function main() {
  const [, , tableType, id, newState, ...reasonParts] = process.argv;
  const reason = reasonParts.join(' ');

  if (!tableType || !id || !newState) {
    console.error('Usage: suppress-entity.js <signal|entity> <uuid> <active|suppressed|quarantined|archived> [reason]');
    process.exit(1);
  }

  if (!VALID_STATES.includes(newState)) {
    console.error(`Invalid state: ${newState}. Must be one of: ${VALID_STATES.join(', ')}`);
    process.exit(1);
  }

  const table = tableMap[tableType];
  if (!table) {
    console.error(`Invalid type: ${tableType}. Use 'signal' or 'entity'.`);
    process.exit(1);
  }

  const client = new Client({ connectionString: CONN });

  try {
    await client.connect();

    const idCol = idColMap[tableType];

    // Verify row exists
    const check = await client.query(
      `SELECT id FROM ${table} WHERE id = $1`,
      [id]
    );
    if (check.rowCount === 0) {
      console.error(`ERROR: No ${tableType} found with id=${id}`);
      process.exit(1);
    }

    // Update planning_state + metadata
    const result = await client.query(`
      UPDATE ${table}
      SET planning       = $1,
          suppressed_at  = CASE WHEN $1 != 'active' THEN NOW() ELSE NULL END,
          suppressed_by   = CASE WHEN $1 != 'active' THEN 'manual-ops' ELSE NULL END,
          suppress_reason = CASE WHEN $1 != 'active' THEN $2 ELSE NULL END
      WHERE id = $3
      RETURNING id, name, title, planning, suppressed_at, suppress_reason
    `, [newState, reason || null, id]);

    const row = result.rows[0];

    // Log to activity_log
    await client.query(`
      INSERT INTO activity_log (type, subreddit, title, score, payload)
      VALUES (
        'signal',
        'aloomii',
        'suppress-entity',
        5,
        jsonb_build_object(
          'event',       'planning-state-change',
          'table',       $1,
          'id',          $2,
          'new_state',   $3,
          'reason',      $4,
          'changed_at',  NOW()
        )
      )
    `, [table, id, newState, reason]);

    const display = row.name || row.title || id;
    console.log(`[suppress] ${table}.${id} → ${newState}`);
    console.log(`           ${display}`);
    if (reason) console.log(`           Reason: ${reason}`);

  } catch (err) {
    console.error('[suppress-entity] ERROR:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
