#!/usr/bin/env node
'use strict';

const { Client } = require('pg');

const DB_URL = 'postgresql://superhana@localhost:5432/aloomii';

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT q.id, c.name AS contact_name, a.name AS account_name
      FROM outreach_queue q
      LEFT JOIN contacts c ON q.contact_id = c.id
      LEFT JOIN accounts a ON c.account_id = a.id
      WHERE q.status = 'pending'
      ORDER BY q.fire_date ASC NULLS LAST
      LIMIT 5
    `);

    for (const row of res.rows) {
      const opener = row.contact_name
        ? `Your recent work at ${row.account_name || 'the company'} stood out. It maps closely to the relationship-ops gap we keep seeing.`
        : `There is a clear relationship-ops signal here worth addressing before more volume hits the team.`;
      await client.query(`
        UPDATE outreach_queue
        SET personalization_source_type = 'seed_test',
            personalization_note = 'Seeded test batch for CC personalization review flow',
            personalization_opener = $2,
            personalization_status = 'ready',
            personalized_by = 'seed-script',
            personalized_at = NOW()
        WHERE id = $1
      `, [row.id, opener]);
    }

    console.log(`Seeded personalization on ${res.rows.length} outreach queue items.`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
