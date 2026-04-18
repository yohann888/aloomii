const { Pool } = require('pg');
const crypto = require('crypto');
const chamberConfig = require('../config/chambercore');

const dbUrl = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';
const pool = new Pool({ connectionString: dbUrl });

function resolveTenantId(tenantId) {
  return tenantId || chamberConfig.tenantId;
}

async function query(text, params = []) {
  return pool.query(text, params);
}

// NOTE: tenantQuery prepends tenant_id as the first parameter.
// All queries in this file use $1 for tenant_id.
async function tenantQuery(tenantId, text, params = []) {
  const resolvedTenantId = resolveTenantId(tenantId);
  return pool.query(text, [resolvedTenantId, ...params]);
}

function benefitPayload(input) {
  const payload = {
    free_event_tickets: Number(input?.free_event_tickets || 0),
    hot_deal_posts: Number(input?.hot_deal_posts || 0),
    directory_logo: Boolean(input?.directory_logo),
    featured_directory_placement: Boolean(input?.featured_directory_placement),
  };

  const keys = Object.keys(payload);
  const allowed = chamberConfig.benefits.allowedTypes;
  const filtered = {};
  for (const k of keys) {
    if (allowed.includes(k)) filtered[k] = payload[k];
  }
  return filtered;
}

async function appendLedgerEntry({ tenantId, orgId, type, meta = {} }) {
  const resolvedTenantId = resolveTenantId(tenantId);
  return pool.query(
    `INSERT INTO chamber.benefit_ledger (tenant_id, org_id, type, meta)
     VALUES ($1, $2, $3, $4)`,
    [resolvedTenantId, orgId, type, JSON.stringify(meta)]
  );
}

// issueMagicLink uses pool.query directly to avoid tenantQuery's implicit tenant prepend.
// tenant_id is explicitly placed as $1 in every query here.
async function issueMagicLink({ tenantId = chamberConfig.tenantId, email, purpose = 'member_login' }) {
  const resolvedTenantId = resolveTenantId(tenantId);

  const userRes = await pool.query(
    `SELECT id, email, role, org_id
     FROM chamber.users
     WHERE tenant_id = $1 AND email = $2
     LIMIT 1`,
    [resolvedTenantId, email]
  );
  const user = userRes.rows[0];
  if (!user) throw new Error('member not found for magic link');

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 20).toISOString();

  await pool.query(
    `INSERT INTO chamber.magic_links (tenant_id, user_id, token, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [resolvedTenantId, user.id, token, purpose, expiresAt]
  );

  await pool.query(
    `UPDATE chamber.users
     SET last_magic_link_sent_at = NOW(), updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [resolvedTenantId, user.id]
  );

  return { token, expiresAt, user };
}

// consumeMagicLink uses pool.query directly for the same reason.
async function consumeMagicLink({ tenantId = chamberConfig.tenantId, token, purpose = 'member_login' }) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const result = await pool.query(
    `UPDATE chamber.magic_links ml
     SET used_at = NOW()
     FROM chamber.users u
     WHERE ml.tenant_id = $1
       AND ml.token = $2
       AND ml.purpose = $3
       AND ml.used_at IS NULL
       AND ml.expires_at > NOW()
       AND u.id = ml.user_id
     RETURNING u.id, u.email, u.role, u.org_id`,
    [resolvedTenantId, token, purpose]
  );
  return result.rows[0] || null;
}

function buildMagicLinkUrl(token) {
  const basePath = chamberConfig.basePath || '/chamber-demo';
  return `${basePath}/member-consume?token=${encodeURIComponent(token)}`;
}

// issueBenefit uses pool.query directly for the same reason.
async function issueBenefit({ tenantId, orgId, type, amount, referenceId, referenceType, note }) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const meta = { referenceId, referenceType, note };
  await pool.query(
    `INSERT INTO chamber.benefit_ledger (tenant_id, org_id, type, amount, reference_id, reference_type, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [resolvedTenantId, orgId, type, amount, referenceId, referenceType, note]
  );
}

module.exports = {
  pool,
  query,
  tenantQuery,
  benefitPayload,
  appendLedgerEntry,
  issueMagicLink,
  consumeMagicLink,
  buildMagicLinkUrl,
  issueBenefit,
  resolveTenantId,
};