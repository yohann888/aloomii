#!/usr/bin/env node
/**
 * Build 2: Network Graph — One-time seed + weekly refresh
 * Seeds contact_connections from:
 * 1. Event co-attendance (event_contacts table)
 * 2. mutual_connection field in contacts
 * 3. metadata.mutual / tags references
 * 
 * Run manually first time, then weekly via network-graph-update cron
 */

'use strict';

const { execSync } = require('child_process');
const { writeFileSync, unlinkSync } = require('fs');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';

function sqlFile(sql) {
  const tmp = `/tmp/net_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, sql);
  try {
    return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 60000 }).trim();
  } finally { unlinkSync(tmp); }
}

function sqlJSON(sql) {
  const tmp = `/tmp/net_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const out = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 60000 });
    return out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

async function main() {
  console.log('[network-graph] Seeding contact_connections...');
  let total = 0;

  // --- SOURCE 1: Event co-attendance ---
  const coattend = sqlFile(`
    INSERT INTO contact_connections (contact_a, contact_b, relationship_type, strength, source, detected_at)
    SELECT 
      ec1.contact_id,
      ec2.contact_id,
      'event_co_attendance',
      CASE WHEN COUNT(DISTINCT ec1.event_id) >= 3 THEN 'strong'
           WHEN COUNT(DISTINCT ec1.event_id) = 2 THEN 'medium'
           ELSE 'weak' END,
      'event_contacts_table',
      NOW()
    FROM event_contacts ec1
    JOIN event_contacts ec2 ON ec1.event_id = ec2.event_id AND ec1.contact_id < ec2.contact_id
    GROUP BY ec1.contact_id, ec2.contact_id
    ON CONFLICT (contact_a, contact_b) DO UPDATE SET
      strength = EXCLUDED.strength,
      detected_at = NOW()
    RETURNING id
  `);
  const coattendCount = coattend.split('\n').filter(Boolean).length;
  console.log(`[network-graph] Co-attendance edges: ${coattendCount}`);
  total += coattendCount;

  // --- SOURCE 2: mutual_connection field ---
  // contacts.mutual_connection is a text field — find name matches
  const mutuals = sqlJSON(`
    SELECT c.id, c.name, c.mutual_connection
    FROM contacts c
    WHERE c.mutual_connection IS NOT NULL AND c.mutual_connection != ''
    LIMIT 200
  `);

  let mutualEdges = 0;
  for (const contact of mutuals) {
    if (!contact.mutual_connection) continue;
    // Find matching contact by name
    const match = sqlJSON(`
      SELECT id FROM contacts
      WHERE name ILIKE '%${contact.mutual_connection.replace(/'/g, "''")}%'
        AND id != '${contact.id}'
      LIMIT 1
    `);
    if (match.length > 0) {
      const a = contact.id < match[0].id ? contact.id : match[0].id;
      const b = contact.id < match[0].id ? match[0].id : contact.id;
      sqlFile(`
        INSERT INTO contact_connections (contact_a, contact_b, relationship_type, strength, source)
        VALUES ('${a}', '${b}', 'mutual_connection', 'medium', 'contacts.mutual_connection')
        ON CONFLICT (contact_a, contact_b) DO NOTHING
      `);
      mutualEdges++;
    }
  }
  console.log(`[network-graph] Mutual connection edges: ${mutualEdges}`);
  total += mutualEdges;

  // --- SUMMARY ---
  const stats = sqlJSON(`
    SELECT 
      COUNT(*) as total_edges,
      COUNT(CASE WHEN strength = 'strong' THEN 1 END) as strong,
      COUNT(CASE WHEN strength = 'medium' THEN 1 END) as medium,
      COUNT(CASE WHEN strength = 'weak' THEN 1 END) as weak,
      COUNT(DISTINCT contact_a) + COUNT(DISTINCT contact_b) as connected_contacts
    FROM contact_connections
  `);

  const s = stats[0] || {};
  const summary = `**🕸️ Network Graph Seeded**
Total edges: ${s.total_edges || 0} (${s.strong || 0} strong / ${s.medium || 0} medium / ${s.weak || 0} weak)
Connected contacts: ${s.connected_contacts || 0}
Sources: event co-attendance + mutual_connection field
_Build 2 | local SQL | $0_`;

  console.log(summary);
}

main().catch(e => {
  console.error('[network-graph] Error:', e.message);
  process.exit(1);
});
