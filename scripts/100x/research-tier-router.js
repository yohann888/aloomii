#!/usr/bin/env node
/**
 * Build 5: Research Tier Router (v2 — queue-based)
 * Runs daily at 3:00 AM ET
 * 
 * Does NOT do the research itself — that's deep-researcher's job.
 * This script: decides WHICH contacts need research today and flags them.
 * 
 * Tier 1: Top 20 contacts (by tier + recency) — flag daily
 * Tier 2: Contacts 21-50 — flag on Mondays only  
 * Tier 3: All remaining tier 3 — flag on 1st of month only
 * 
 * Sets metadata.research_status = 'pending' so deep-researcher picks them up.
 * Also updates metadata.monitoring_tier for each contact.
 * 
 * Cost: $0 (pure Postgres operations)
 */

'use strict';

const { execSync } = require('child_process');
const { writeFileSync, unlinkSync } = require('fs');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';

const today = new Date();
const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon
const dayOfMonth = today.getDate();
const dateStr = today.toISOString().split('T')[0];
const isMonday = dayOfWeek === 1;
const isFirstOfMonth = dayOfMonth === 1;

function sqlFile(sql) {
  const tmp = `/tmp/rtr_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, sql);
  try { return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 }).trim(); }
  finally { unlinkSync(tmp); }
}

function sqlJSON(sql) {
  const tmp = `/tmp/rtr_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const out = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
    return out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

function flagForResearch(ids, tier, reason) {
  if (!ids.length) return 0;
  const idList = ids.map(id => `'${id}'`).join(',');
  sqlFile(`
    UPDATE contacts SET
      metadata = jsonb_set(
        jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'),
            '{research_status}', '"pending"'),
          '{monitoring_tier}', '"${tier}"'),
        '{research_queued_at}', '"${dateStr}"'),
      updated_at = NOW()
    WHERE id IN (${idList})
      AND (metadata->>'research_status' IS NULL 
           OR metadata->>'research_status' != 'complete'
           OR (metadata->>'research_updated_at')::timestamptz < NOW() - INTERVAL '30 days')
  `);
  return ids.length;
}

async function main() {
  console.log(`[tier-router] ${dateStr} | Mon:${isMonday} | 1st:${isFirstOfMonth}`);

  // TIER 1: Flag top 20 Tier 1 contacts daily for research
  const tier1 = sqlJSON(`
    SELECT id, name
    FROM contacts
    WHERE tier = 1 AND status NOT IN ('do_not_contact')
    ORDER BY 
      CASE WHEN metadata->>'research_status' IS NULL THEN 0
           WHEN metadata->>'research_status' = 'pending' THEN 1
           ELSE 2 END,
      signal_count DESC NULLS LAST,
      last_signal DESC NULLS LAST
    LIMIT 20
  `);
  const t1Count = flagForResearch(tier1.map(c => c.id), 'tier1_daily', 'daily_tier1');
  console.log(`[tier-router] Tier 1 flagged: ${t1Count}/${tier1.length}`);

  let t2Count = 0, t3Count = 0;

  // TIER 2: Flag top 30 Tier 2 contacts on Mondays
  if (isMonday) {
    const tier2 = sqlJSON(`
      SELECT id, name FROM contacts
      WHERE tier = 2 AND status NOT IN ('do_not_contact')
      ORDER BY signal_count DESC NULLS LAST, last_signal DESC NULLS LAST
      LIMIT 30
    `);
    t2Count = flagForResearch(tier2.map(c => c.id), 'tier2_weekly', 'monday_sweep');
    console.log(`[tier-router] Tier 2 flagged: ${t2Count}/${tier2.length}`);
  }

  // TIER 3: Flag all Tier 3 on 1st of month
  if (isFirstOfMonth) {
    const tier3 = sqlJSON(`
      SELECT id, name FROM contacts
      WHERE tier = 3 AND status NOT IN ('do_not_contact')
      LIMIT 50
    `);
    t3Count = flagForResearch(tier3.map(c => c.id), 'tier3_monthly', 'monthly_sweep');
    console.log(`[tier-router] Tier 3 flagged: ${t3Count}/${tier3.length}`);
  }

  // Count total pending for deep-researcher
  const pending = sqlFile(`
    SELECT COUNT(*) FROM contacts WHERE metadata->>'research_status' = 'pending'
  `);

  const summary = `**🔭 Research Tier Router — ${dateStr}**
Flagged for research: ${t1Count} Tier 1 (daily)${isMonday ? ` + ${t2Count} Tier 2 (Mon)` : ''}${isFirstOfMonth ? ` + ${t3Count} Tier 3 (monthly)` : ''}
Total pending in queue: ${pending}
Next: deep-researcher-signal picks up at 6:45 AM
_Build 5 | local SQL only | $0_`;

  console.log(summary);
}

main().catch(e => {
  console.error('[tier-router] Fatal:', e.message);
  process.exit(1);
});
