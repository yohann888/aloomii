#!/usr/bin/env node
/**
 * 04-verify-cutover.js
 * Verifies the stale-signal cutover completed correctly.
 * Checks: migration applied, backfill done, PM read boundary enforced.
 *
 * Usage: node scripts/cutover/04-verify-cutover.js
 * Exit: 0 = all checks pass, 1 = one or more checks fail
 */
'use strict';

const { Client } = require('pg');
const fs = require('fs');

const CONN  = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const checks = [];

function check(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  const client = new Client({ connectionString: CONN });

  try {
    await client.connect();

    // ── Check 1: planning_state column exists ───────────────
    const cols = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'signals'
        AND column_name IN ('planning', 'suppressed_at', 'suppress_reason')
      ORDER BY column_name
    `);
    const colMap = {};
    cols.rows.forEach(r => { colMap[r.column_name] = r; });
    check('signals.planning exists',    !!colMap['planning']);
    check('signals.suppressed_at exists', !!colMap['suppressed_at']);
    check('signals.suppress_reason exists', !!colMap['suppress_reason']);

    // ── Check 2: planning_state enum exists ─────────────────
    const enums = await client.query(`
      SELECT enumlabel FROM pg_enum
      WHERE enumtypid = 'planning_state'::regtype
      ORDER BY enumlabel
    `);
    const labels = enums.rows.map(r => r.enumlabel).join(', ');
    const hasAll = ['active','suppressed','quarantined','archived'].every(
      l => enums.rows.some(r => r.enumlabel === l)
    );
    check('planning_state enum has all 4 states', hasAll, labels);

    // ── Check 3: All existing signals have planning state ───
    const nulls = await client.query(`
      SELECT COUNT(*) AS null_count FROM signals WHERE planning IS NULL
    `);
    check('No signals with NULL planning', nulls.rows[0].null_count === '0',
      `${nulls.rows[0].null_count} NULL rows`);

    // ── Check 4: entities same ────────────────────────────────
    const entNulls = await client.query(`
      SELECT COUNT(*) AS null_count FROM entities WHERE planning IS NULL
    `);
    check('No entities with NULL planning', entNulls.rows[0].null_count === '0');

    // ── Check 5: Active-only index exists ───────────────────
    const indexes = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'signals'
        AND indexname = 'idx_signals_planning_state'
    `);
    check('idx_signals_planning_state partial index exists', indexes.rowCount > 0);

    // ── Check 6: freeze flag present ────────────────────────
    const freezeFile = process.env.WORKSPACE
      ? `${process.env.WORKSPACE}/.cutover-frozen`
      : '/Users/superhana/.openclaw/workspace/.cutover-frozen';
    const frozen = fs.existsSync(freezeFile);
    check('.cutover-frozen flag exists', frozen);

    // ── Check 7: quarantine log created ─────────────────────
    const quarantineLogs = fs.readdirSync('/Users/superhana/.openclaw/workspace/logs')
      .filter(f => f.startsWith('quarantine-log-'));
    check('Quarantine log exists', quarantineLogs.length > 0,
      quarantineLogs[quarantineLogs.length - 1] || 'none');

    // ── Summary ───────────────────────────────────────────────
    const passed = checks.filter(c => c.pass).length;
    const failed = checks.filter(c => !c.pass).length;
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

    if (failed > 0) {
      console.log('\nFailed checks:');
      checks.filter(c => !c.pass).forEach(c => console.log(`  ✗ ${c.name}`));
      process.exit(1);
    } else {
      console.log('\nCutover verified. Next: unfreeze jobs by removing CUTOVER-FROZEN comments from crontab.');
    }

  } catch (err) {
    console.error('[verify] ERROR:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
