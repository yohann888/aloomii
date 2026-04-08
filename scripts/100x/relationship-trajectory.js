#!/usr/bin/env node
/**
 * Build 1: Relationship Trajectory Prediction
 * Runs daily at 5:30 AM ET — before senior-pm-daily at 6:30 AM
 * Model: ollama/gemma4:31b (runtime), $0 cost
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';

function query(sqlFile) {
  const tmp = `/tmp/traj_${Date.now()}_q.sql`;
  writeFileSync(tmp, sqlFile);
  try {
    return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
  } finally { unlinkSync(tmp); }
}

function queryJSON(sql) {
  const tmp = `/tmp/traj_${Date.now()}_j.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const result = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 30000 });
    return result.trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

async function main() {
  console.log('[trajectory] Starting relationship trajectory prediction...');
  const today = new Date().toISOString().split('T')[0];

  // 1. Snapshot today's RHS into history
  query(`
    INSERT INTO relationship_history (contact_id, rhs_score, recorded_at)
    SELECT id, rhs_current, NOW()
    FROM contacts
    WHERE rhs_current IS NOT NULL
      AND status NOT IN ('do_not_contact')
    ON CONFLICT DO NOTHING
  `);

  // 2. Calculate velocity and predictions
  query(`
    UPDATE contacts c
    SET 
      rhs_velocity = sub.velocity,
      rhs_predicted_30d = GREATEST(0, LEAST(10, c.rhs_current + (sub.velocity * 30))),
      rhs_trend = CASE
        WHEN sub.velocity < -0.05 THEN 'declining'
        WHEN sub.velocity > 0.05 THEN 'improving'
        ELSE 'stable'
      END,
      decay_alert = CASE
        WHEN (c.rhs_current + (sub.velocity * 30)) < 4.0 AND c.rhs_current >= 4.0 THEN true
        ELSE false
      END,
      decay_alert_date = CASE
        WHEN (c.rhs_current + (sub.velocity * 30)) < 4.0 AND c.rhs_current >= 4.0 THEN CURRENT_DATE
        ELSE decay_alert_date
      END,
      updated_at = NOW()
    FROM (
      SELECT 
        contact_id,
        COALESCE(
          (MAX(rhs_score) FILTER (WHERE recorded_at > NOW() - INTERVAL '3 days') -
           MAX(rhs_score) FILTER (WHERE recorded_at < NOW() - INTERVAL '27 days' AND recorded_at > NOW() - INTERVAL '33 days'))
          / 30.0,
          0
        ) as velocity
      FROM relationship_history
      GROUP BY contact_id
    ) sub
    WHERE c.id = sub.contact_id
  `);

  // 3. Pull decay alerts
  const alerts = queryJSON(`
    SELECT name, tier, rhs_current, rhs_predicted_30d, rhs_velocity, rhs_trend, decay_alert
    FROM contacts
    WHERE rhs_current IS NOT NULL
      AND status NOT IN ('do_not_contact')
      AND (decay_alert = true OR rhs_trend = 'declining')
    ORDER BY rhs_velocity ASC
    LIMIT 10
  `);

  const improving = queryJSON(`
    SELECT name, tier, rhs_current, rhs_predicted_30d
    FROM contacts
    WHERE rhs_trend = 'improving' AND rhs_current IS NOT NULL
    ORDER BY rhs_velocity DESC
    LIMIT 5
  `);

  // 4. Build summary
  let summary = `**📊 Relationship Trajectories — ${today}**\n\n`;
  const critical = alerts.filter(a => a.decay_alert);
  const warning = alerts.filter(a => !a.decay_alert && a.rhs_trend === 'declining');

  if (critical.length > 0) {
    summary += `🔴 **CRITICAL (intervention within 7 days)**\n`;
    critical.forEach(c => {
      summary += `• **${c.name}** (Tier ${c.tier}) — RHS ${c.rhs_current} → predicted ${c.rhs_predicted_30d} in 30d\n`;
    });
    summary += '\n';
  }

  if (warning.length > 0) {
    summary += `⚠️ **WARNING (early decay)**\n`;
    warning.forEach(c => {
      summary += `• **${c.name}** — declining at ${Math.abs(c.rhs_velocity || 0).toFixed(3)}/day\n`;
    });
    summary += '\n';
  }

  if (improving.length > 0) {
    summary += `✅ **IMPROVING**\n`;
    improving.forEach(c => {
      summary += `• **${c.name}** — RHS ${c.rhs_current} → ${c.rhs_predicted_30d}\n`;
    });
    summary += '\n';
  }

  if (critical.length === 0 && warning.length === 0) {
    summary += `✅ All tracked relationships stable. No alerts.\n`;
  }

  summary += `_Build 1 | gemma4:31b local | $0_`;

  console.log('[trajectory] Complete:', summary);
}

main().catch(e => {
  console.error('[trajectory] Error:', e.message);
  process.exit(1);
});
