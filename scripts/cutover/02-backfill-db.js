#!/usr/bin/env node
/**
 * 02-backfill-db.js
 * Backfills planning_state='active' for all existing signals/entities
 * that don't yet have the field set.
 * Run AFTER 024_planning_state_v2.sql migration.
 *
 * Usage: node scripts/cutover/02-backfill-db.js
 * Safety: SELECT COUNT first, then UPDATE. Reports what changed.
 */
'use strict';

const { Client } = require('pg');

const CONN = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';

async function main() {
  const client = new Client({ connectionString: CONN });

  try {
    await client.connect();
    console.log('[backfill] Connected to DB');

    // ── signals ──────────────────────────────────────────────
    const sigRes = await client.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE planning IS NULL) AS nulls
      FROM signals
    `);
    const { total: sigTotal, nulls: sigNulls } = sigRes.rows[0];
    console.log(`[signals] total=${sigTotal}  null_planning=${sigNulls}`);

    if (parseInt(sigNulls) > 0) {
      const upd = await client.query(`
        UPDATE signals
        SET planning = 'active',
            suppressed_at = NOW(),
            suppressed_by = 'cutover-backfill'
        WHERE planning IS NULL
        RETURNING id, title
      `);
      console.log(`[signals] Updated ${upd.rowCount} rows → planning='active'`);
      upd.rows.slice(0, 5).forEach(r =>
        console.log(`  → ${r.id}  ${r.title?.slice(0, 60)}`)
      );
      if (upd.rowCount > 5) console.log(`  ... and ${upd.rowCount - 5} more`);
    } else {
      console.log('[signals] No backfill needed — all rows already have planning state');
    }

    // ── entities ─────────────────────────────────────────────
    const entRes = await client.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE planning IS NULL) AS nulls
      FROM entities
    `);
    const { total: entTotal, nulls: entNulls } = entRes.rows[0];
    console.log(`[entities] total=${entTotal}  null_planning=${entNulls}`);

    if (parseInt(entNulls) > 0) {
      const upd = await client.query(`
        UPDATE entities
        SET planning = 'active',
            suppressed_at = NOW(),
            suppressed_by = 'cutover-backfill'
        WHERE planning IS NULL
        RETURNING id, name
      `);
      console.log(`[entities] Updated ${upd.rowCount} rows → planning='active'`);
      upd.rows.slice(0, 5).forEach(r =>
        console.log(`  → ${r.id}  ${r.name}`)
      );
      if (upd.rowCount > 5) console.log(`  ... and ${upd.rowCount - 5} more`);
    } else {
      console.log('[entities] No backfill needed');
    }

    // ── Stamp cutover record ──────────────────────────────────
    await client.query(`
      INSERT INTO activity_log (type, subreddit, title, score, payload)
      VALUES (
        'signal',
        'aloomii',
        'cutover-backfill',
        5,
        jsonb_build_object(
          'event',        'stale-signal-cutover',
          'step',         '02-backfill',
          'signals_updated', $1,
          'entities_updated', $2,
          'ran_at',       NOW()
        )
      )
    `, [parseInt(sigNulls), parseInt(entNulls)]);

    console.log('\n[backfill] Done.');
  } catch (err) {
    console.error('[backfill] ERROR:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
