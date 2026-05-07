#!/usr/bin/env node
// migrate-mutual-connections.js — One-time backfill from contacts.mutual_connection → contact_relationships
// Parses comma-separated names, fuzzy-matches against contacts, inserts verified relationships.
// Leaves unmatched strings in the flat column as fallback.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://superhana@localhost:5432/aloomii' });

function cleanName(raw) {
  // Remove trailing "+ N others", parens, extra whitespace
  let name = raw.replace(/\s*\+\s*\d+\s+others?\s*$/i, '').trim();
  name = name.replace(/\s*\(.*\)\s*$/, '').trim();
  return name;
}

function parseMutualConnection(text) {
  if (!text) return [];
  return text.split(/,\s*/).map(cleanName).filter(n => n.length >= 2);
}

async function run() {
  const client = await pool.connect();
  try {
    // Get all contacts with mutual_connection data
    const { rows: contacts } = await client.query(
      `SELECT id, name, mutual_connection FROM contacts
       WHERE mutual_connection IS NOT NULL AND mutual_connection != ''
       ORDER BY tier ASC NULLS LAST, name ASC`
    );

    // Build a name lookup map for fuzzy matching
    const { rows: allContacts } = await client.query(
      `SELECT id, name FROM contacts WHERE name IS NOT NULL`
    );

    const nameToId = new Map();
    const nameList = [];
    allContacts.forEach(c => {
      const key = c.name.toLowerCase();
      nameToId.set(key, c.id);
      nameList.push(key);
    });

    let inserted = 0;
    let skipped = 0;
    let unmatched = 0;

    for (const contact of contacts) {
      const names = parseMutualConnection(contact.mutual_connection);
      if (names.length === 0) continue;

      for (const rawName of names) {
        const lowerName = rawName.toLowerCase();

        // Exact match first
        let matchedId = nameToId.get(lowerName);

        // Fuzzy: starts-with match on any contact name
        if (!matchedId) {
          const fuzzy = nameList.find(n => n.startsWith(lowerName) || lowerName.startsWith(n));
          if (fuzzy) matchedId = nameToId.get(fuzzy);
        }

        if (!matchedId) {
          console.warn(`[SKIP] No contact match for "${rawName}" (from ${contact.name})`);
          unmatched++;
          continue;
        }

        if (matchedId === contact.id) {
          console.warn(`[SKIP] Self-reference: ${contact.name} → ${rawName}`);
          skipped++;
          continue;
        }

        try {
          await client.query(
            `INSERT INTO contact_relationships (contact_id_a, contact_id_b, relationship, strength, source, notes)
             VALUES (
               LEAST($1::uuid, $2::uuid),
               GREATEST($1::uuid, $2::uuid),
               'mutual_connection',
               5,
               'contact_card',
               $3
             )
             ON CONFLICT DO NOTHING`,
            [contact.id, matchedId, `Migrated from ${contact.name}'s mutual_connection field: "${contact.mutual_connection}"`]
          );
          inserted++;
          console.log(`[OK] ${contact.name} → ${rawName}`);
        } catch (e) {
          console.error(`[ERR] ${contact.name} → ${rawName}:`, e.message);
          skipped++;
        }
      }
    }

    console.log(`\n✅ Done. Inserted: ${inserted}, Skipped: ${skipped}, Unmatched: ${unmatched}`);
    console.log(`   Total contacts processed: ${contacts.length}`);
    console.log(`\n💡 Next step: review unmatched names, then optionally set mutual_connection = NULL`);
    console.log(`   where relationships were successfully migrated.`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
