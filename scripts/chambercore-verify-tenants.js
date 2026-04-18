#!/usr/bin/env node
'use strict';

const { tenantQuery } = require('./chambercore-db');

const tenants = ['caledonia-demo', 'hamilton-demo'];

async function collectTenantSnapshot(tenantId) {
  const settings = (await tenantQuery(
    tenantId,
    `SELECT chamber_name, contact_email FROM chamber.settings WHERE tenant_id = $1 LIMIT 1`
  )).rows[0] || null;

  const organizationCount = (await tenantQuery(
    tenantId,
    `SELECT COUNT(*)::int AS count FROM chamber.organizations WHERE tenant_id = $1`
  )).rows[0]?.count || 0;

  const eventCount = (await tenantQuery(
    tenantId,
    `SELECT COUNT(*)::int AS count FROM chamber.events WHERE tenant_id = $1`
  )).rows[0]?.count || 0;

  const userCount = (await tenantQuery(
    tenantId,
    `SELECT COUNT(*)::int AS count FROM chamber.users WHERE tenant_id = $1`
  )).rows[0]?.count || 0;

  const sampleOrg = (await tenantQuery(
    tenantId,
    `SELECT slug, name FROM chamber.organizations WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`
  )).rows[0] || null;

  const sampleEvent = (await tenantQuery(
    tenantId,
    `SELECT slug, title FROM chamber.events WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`
  )).rows[0] || null;

  return {
    tenantId,
    settings,
    counts: {
      organizations: organizationCount,
      events: eventCount,
      users: userCount,
    },
    sampleOrg,
    sampleEvent,
  };
}

async function main() {
  const snapshots = [];
  for (const tenantId of tenants) {
    snapshots.push(await collectTenantSnapshot(tenantId));
  }

  console.log(JSON.stringify({ ok: true, snapshots }, null, 2));
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
