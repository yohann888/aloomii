#!/usr/bin/env node
/**
 * Build 2: Network Graph — Weekly Update
 * Runs Sunday 8:00 AM ET
 * Detects new connections from new event_contacts entries since last run
 * Reports network changes to Discord
 */

'use strict';

const { execSync } = require('child_process');
const { writeFileSync, unlinkSync } = require('fs');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';

function sqlFile(sql) {
  const tmp = `/tmp/ngu_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, sql);
  try { return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 60000 }).trim(); }
  finally { unlinkSync(tmp); }
}

function sqlJSON(sql) {
  const tmp = `/tmp/ngu_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const out = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 60000 });
    return out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

async function main() {
  const today = new Date().toISOString().split('T')[0];
  console.log('[network-update] Running weekly network graph update...');

  // Upsert new co-attendance edges from last 7 days
  const newEdges = sqlFile(`
    INSERT INTO contact_connections (contact_a, contact_b, relationship_type, strength, source, detected_at)
    SELECT ec1.contact_id, ec2.contact_id, 'event_co_attendance',
      CASE WHEN COUNT(DISTINCT ec1.event_id) >= 3 THEN 'strong'
           WHEN COUNT(DISTINCT ec1.event_id) = 2 THEN 'medium'
           ELSE 'weak' END,
      'event_contacts_table', NOW()
    FROM event_contacts ec1
    JOIN event_contacts ec2 ON ec1.event_id = ec2.event_id AND ec1.contact_id < ec2.contact_id
    WHERE ec1.detected_at > NOW() - INTERVAL '7 days'
       OR ec2.detected_at > NOW() - INTERVAL '7 days'
    GROUP BY ec1.contact_id, ec2.contact_id
    ON CONFLICT (contact_a, contact_b) DO UPDATE SET strength = EXCLUDED.strength, detected_at = NOW()
    RETURNING id
  `);
  const newCount = newEdges.split('\n').filter(Boolean).length;

  // Top connected contacts (potential connectors)
  const connectors = sqlJSON(`
    SELECT c.name, c.tier,
      COUNT(DISTINCT cc.contact_b) + COUNT(DISTINCT cc2.contact_a) as connection_count
    FROM contacts c
    LEFT JOIN contact_connections cc ON cc.contact_a = c.id
    LEFT JOIN contact_connections cc2 ON cc2.contact_b = c.id
    GROUP BY c.id, c.name, c.tier
    HAVING COUNT(DISTINCT cc.contact_b) + COUNT(DISTINCT cc2.contact_a) > 2
    ORDER BY connection_count DESC
    LIMIT 5
  `);

  const stats = sqlJSON(`
    SELECT COUNT(*) as total_edges,
      COUNT(CASE WHEN strength='strong' THEN 1 END) as strong,
      COUNT(CASE WHEN strength='medium' THEN 1 END) as medium,
      COUNT(CASE WHEN strength='weak' THEN 1 END) as weak
    FROM contact_connections
  `);

  const s = stats[0] || {};
  let summary = `**🕸️ Network Graph Update — ${today}**\n`;
  summary += `New edges this week: ${newCount > 0 ? newCount : 0}\n`;
  summary += `Total: ${s.total_edges} edges (${s.strong} strong / ${s.medium} medium / ${s.weak} weak)\n\n`;

  if (connectors.length > 0) {
    summary += `**Top connectors:**\n`;
    connectors.forEach(c => {
      summary += `• ${c.name} (Tier ${c.tier}) — ${c.connection_count} connections\n`;
    });
  }

  summary += `_Build 2 | local SQL | $0_`;
  console.log(summary);
}

main().catch(e => { console.error('[network-update] Error:', e.message); process.exit(1); });
