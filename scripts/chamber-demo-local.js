#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const chamberConfig = require('../config/chambercore');
const { query, tenantQuery, resolveTenantId } = require('./chambercore-db');

const port = parseInt(process.env.PORT || '3300', 10);
const demoDir = path.join(__dirname, '..', 'demo');
const files = {
  home: path.join(demoDir, 'chamber-demo.html'),
  directory: path.join(demoDir, 'chamber-directory.html'),
  orgDetail: path.join(demoDir, 'chamber-org-detail.html'),
  events: path.join(demoDir, 'chamber-events.html'),
  eventDetail: path.join(demoDir, 'chamber-event-detail.html'),
  join: path.join(demoDir, 'chamber-join.html'),
  admin: path.join(demoDir, 'chamber-admin.html'),
  adminOrgDetail: path.join(demoDir, 'chamber-admin-org-detail.html'),
  sharedCss: path.join(demoDir, 'chamber-ui.css'),
  sharedJs: path.join(demoDir, 'chamber-ui.js'),
};

function sendHtml(res, filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function isAdminAuthed(req) {
  const cookies = parseCookies(req);
  return cookies[chamberConfig.auth.adminSessionCookie] === chamberConfig.auth.adminAccessCode;
}

function getMemberToken(req) {
  const cookies = parseCookies(req);
  return cookies.chamber_demo_member || null;
}

async function getAuthedMember(req, tenantId = chamberConfig.tenantId) {
  const token = getMemberToken(req);
  if (!token) return null;
  const resolvedTenantId = resolveTenantId(tenantId);
  const result = await tenantQuery(
    resolvedTenantId,
    `SELECT u.id, u.email, u.role, u.first_name, u.last_name, o.id AS org_id, o.name AS org_name, o.status AS org_status,
            o.payment_status, o.renewal_date, t.name AS tier_name
     FROM chamber.magic_links ml
     JOIN chamber.users u ON u.id = ml.user_id
     LEFT JOIN chamber.organizations o ON o.id = u.org_id
     LEFT JOIN chamber.tiers t ON t.id = o.tier_id
     WHERE ml.tenant_id = $1 AND ml.token = $2 AND ml.used_at IS NOT NULL
     LIMIT 1`,
    [token]
  );
  return result.rows[0] || null;
}

function sendAdminUnauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'admin auth required' }));
}

async function getOverview(tenantId = chamberConfig.tenantId) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const settings = (await tenantQuery(
    resolvedTenantId,
    `SELECT chamber_name, hero_copy, tagline, primary_color, secondary_color
     FROM chamber.settings
     WHERE tenant_id = $1
     LIMIT 1`
  )).rows[0] || null;

  const summary = (await tenantQuery(
    resolvedTenantId,
    `SELECT
       COUNT(*)::int AS organizations,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_organizations,
       COUNT(*) FILTER (WHERE featured IS TRUE)::int AS featured_organizations
     FROM chamber.organizations
     WHERE tenant_id = $1`
  )).rows[0];

  const eventsCount = (await tenantQuery(
    resolvedTenantId,
    `SELECT COUNT(*)::int AS upcoming_events
     FROM chamber.events
     WHERE tenant_id = $1
       AND status = 'published'
       AND starts_at >= NOW()`
  )).rows[0];

  const dealsCount = (await tenantQuery(
    resolvedTenantId,
    `SELECT COUNT(*)::int AS hot_deals
     FROM chamber.content_items
     WHERE tenant_id = $1
       AND type = 'hot_deal'`
  )).rows[0];

  const featuredOrganizations = (await tenantQuery(
    resolvedTenantId,
    `SELECT o.slug, o.name, o.description, o.city, o.categories[1] AS category, t.name AS tier_name
     FROM chamber.organizations o
     LEFT JOIN chamber.tiers t ON o.tier_id = t.id
     WHERE o.tenant_id = $1
       AND o.status = 'active'
     ORDER BY o.featured DESC, o.created_at ASC
     LIMIT 6`
  )).rows;

  const upcomingEvents = (await tenantQuery(
    resolvedTenantId,
    `SELECT slug, title, description, location, starts_at, member_only
     FROM chamber.events
     WHERE tenant_id = $1
       AND status = 'published'
       AND starts_at >= NOW()
     ORDER BY starts_at ASC
     LIMIT 12`
  )).rows;

  const hotDeals = (await tenantQuery(
    resolvedTenantId,
    `SELECT title, body, status, metadata->>'teaser' AS teaser
     FROM chamber.content_items
     WHERE tenant_id = $1
       AND type = 'hot_deal'
     ORDER BY created_at DESC
     LIMIT 4`
  )).rows;

  return {
    settings,
    summary: {
      organizations: summary?.organizations || 0,
      activeOrganizations: summary?.active_organizations || 0,
      featuredOrganizations: summary?.featured_organizations || 0,
      upcomingEvents: eventsCount?.upcoming_events || 0,
      hotDeals: dealsCount?.hot_deals || 0,
    },
    featuredOrganizations,
    upcomingEvents,
    hotDeals,
  };
}

async function getDirectory(tenantId = chamberConfig.tenantId) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const organizations = (await tenantQuery(
    resolvedTenantId,
    `SELECT o.slug, o.name, o.description, o.city, o.categories[1] AS category, t.name AS tier_name
     FROM chamber.organizations o
     LEFT JOIN chamber.tiers t ON o.tier_id = t.id
     WHERE o.tenant_id = $1
       AND o.status = 'active'
     ORDER BY o.featured DESC, o.name ASC`
  )).rows;
  return { organizations };
}

async function getOrganization(slug, tenantId = chamberConfig.tenantId) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const organization = (await tenantQuery(
    resolvedTenantId,
    `SELECT o.slug, o.name, o.description, o.address, o.city, o.province, o.website, o.categories[1] AS category, t.name AS tier_name
     FROM chamber.organizations o
     LEFT JOIN chamber.tiers t ON o.tier_id = t.id
     WHERE o.tenant_id = $1 AND o.slug = $2
     LIMIT 1`,
    [slug]
  )).rows[0] || null;
  return { organization };
}

async function getEvents(tenantId = chamberConfig.tenantId) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const events = (await tenantQuery(
    resolvedTenantId,
    `SELECT slug, title, description, location, starts_at, member_only
     FROM chamber.events
     WHERE tenant_id = $1 AND status = 'published'
     ORDER BY starts_at ASC`
  )).rows;
  return { events };
}

async function getEvent(slug, tenantId = chamberConfig.tenantId) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const event = (await tenantQuery(
    resolvedTenantId,
    `SELECT slug, title, description, location, starts_at, member_only
     FROM chamber.events
     WHERE tenant_id = $1 AND slug = $2
     LIMIT 1`,
    [slug]
  )).rows[0] || null;
  return { event };
}

async function getAdminOverview(tenantId = chamberConfig.tenantId) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const settings = (await tenantQuery(
    resolvedTenantId,
    `SELECT chamber_name, tagline, contact_email, contact_phone
     FROM chamber.settings
     WHERE tenant_id = $1
     LIMIT 1`
  )).rows[0] || {};

  const summary = (await tenantQuery(
    resolvedTenantId,
    `SELECT
       COUNT(*)::int AS organizations,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_organizations
     FROM chamber.organizations
     WHERE tenant_id = $1`
  )).rows[0] || {};

  const publishedEvents = (await tenantQuery(
    resolvedTenantId,
    `SELECT COUNT(*)::int AS published_events
     FROM chamber.events
     WHERE tenant_id = $1 AND status = 'published'`
  )).rows[0] || {};

  const pendingOrganizations = (await tenantQuery(
    resolvedTenantId,
    `SELECT id, slug, name, email, status
     FROM chamber.organizations
     WHERE tenant_id = $1 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 6`
  )).rows;

  const organizations = (await tenantQuery(
    resolvedTenantId,
    `SELECT o.id, o.slug, o.name, o.city, o.payment_status, o.status, t.name AS tier_name
     FROM chamber.organizations o
     LEFT JOIN chamber.tiers t ON o.tier_id = t.id
     WHERE o.tenant_id = $1
     ORDER BY o.created_at DESC
     LIMIT 8`
  )).rows;

  const events = (await tenantQuery(
    resolvedTenantId,
    `SELECT title, starts_at, location, status
     FROM chamber.events
     WHERE tenant_id = $1
     ORDER BY starts_at ASC
     LIMIT 5`
  )).rows;

  const pendingContent = (await tenantQuery(
    resolvedTenantId,
    `SELECT c.id, c.title, c.status, o.name AS organization_name
     FROM chamber.content_items c
     LEFT JOIN chamber.organizations o ON c.org_id = o.id
     WHERE c.tenant_id = $1 AND c.status = 'pending_review'
     ORDER BY c.created_at DESC
     LIMIT 6`
  )).rows;

  return {
    settings,
    summary: {
      organizations: summary.organizations || 0,
      pendingOrganizations: summary.pending_organizations || 0,
      publishedEvents: publishedEvents.published_events || 0,
    },
    pendingOrganizations,
    organizations,
    events,
    pendingContent,
  };
}

async function getAdminOrganization(id, tenantId = chamberConfig.tenantId) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const organization = (await tenantQuery(
    resolvedTenantId,
    `SELECT o.id, o.slug, o.name, o.status, o.description, o.email, o.phone, o.website, o.city, o.province, o.payment_status, o.renewal_date,
            t.name AS tier_name,
            COALESCE(json_agg(json_build_object('email', u.email, 'role', u.role, 'first_name', u.first_name, 'last_name', u.last_name)) FILTER (WHERE u.id IS NOT NULL), '[]'::json) AS users
     FROM chamber.organizations o
     LEFT JOIN chamber.tiers t ON o.tier_id = t.id
     LEFT JOIN chamber.users u ON u.org_id = o.id
     WHERE o.tenant_id = $1 AND o.id = $2
     GROUP BY o.id, t.name
     LIMIT 1`,
    [id]
  )).rows[0] || null;
  return { organization };
}

async function approveOrganization(id, tenantId = chamberConfig.tenantId) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const result = await tenantQuery(
    resolvedTenantId,
    `UPDATE chamber.organizations
     SET status = 'active', updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
     RETURNING id, name, status`,
    [id]
  );
  return result.rows[0] || null;
}

async function moderateContent(id, action, tenantId = chamberConfig.tenantId) {
  const nextStatus = action === 'approve' ? 'published' : 'archived';
  const result = await tenantQuery(
    tenantId,
    `UPDATE chamber.content_items
     SET status = $3::chamber.chamber_content_status,
         published_at = CASE WHEN $3 = 'published' THEN NOW() ELSE published_at END,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND status = 'pending_review'
     RETURNING id, title, status`,
    [id, nextStatus]
  );
  return result.rows[0] || null;
}

async function createJoinApplication(body, tenantId = chamberConfig.tenantId) {
  const resolvedTenantId = resolveTenantId(tenantId);
  const slugBase = String(body.organization_name || 'new-member').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slug = `${slugBase || 'new-member'}-${Date.now().toString().slice(-6)}`;
  const tier = (await tenantQuery(
    resolvedTenantId,
    `SELECT id FROM chamber.tiers WHERE tenant_id = $1 AND slug = $2 LIMIT 1`,
    [body.tier_slug || 'bronze']
  )).rows[0];

  const orgRes = await tenantQuery(
    resolvedTenantId,
    `INSERT INTO chamber.organizations (tenant_id, tier_id, slug, name, status, description, website, email, categories, payment_status)
     VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,'pending_review')
     RETURNING id`,
    [
      tier?.id || null,
      slug,
      body.organization_name,
      body.notes || 'Pending chamber application from public join flow.',
      body.website || '',
      body.email,
      ['Prospective Member'],
    ]
  );

  await tenantQuery(
    resolvedTenantId,
    `INSERT INTO chamber.users (tenant_id, org_id, email, role, first_name, last_name)
     VALUES ($1,$2,$3,'member_rep',$4,$5)
     ON CONFLICT (tenant_id, email) DO NOTHING`,
    [orgRes.rows[0].id, body.email, body.contact_name || 'New', 'Applicant']
  );

  return { ok: true, slug };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const method = req.method.toUpperCase();

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'chamber-demo-local' }));
    return;
  }

  if (url.pathname === '/api/chamber-demo/overview') {
    try {
      const payload = await getOverview();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === '/api/chamber-demo/directory') {
    const payload = await getDirectory();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }

  if (url.pathname.startsWith('/api/chamber-demo/directory/')) {
    const slug = url.pathname.split('/').pop();
    const payload = await getOrganization(slug);
    res.writeHead(payload.organization ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload.organization ? payload : { error: 'organization not found' }));
    return;
  }

  if (url.pathname === '/api/chamber-demo/events') {
    const payload = await getEvents();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }

  if (url.pathname.startsWith('/api/chamber-demo/events/')) {
    const slug = url.pathname.split('/').pop();
    const payload = await getEvent(slug);
    res.writeHead(payload.event ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload.event ? payload : { error: 'event not found' }));
    return;
  }

  if (url.pathname === '/api/chamber-demo/member-auth/request-link' && method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        const { issueMagicLink, buildMagicLinkUrl } = require('./chambercore-db');
        const issued = await issueMagicLink({ email: body.email, purpose: 'member_login' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          provider: chamberConfig.auth.emailProvider,
          magicLink: buildMagicLinkUrl(issued.token),
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/chamber-demo/member-auth/consume' && method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        const { consumeMagicLink } = require('./chambercore-db');
        const user = await consumeMagicLink({ token: body.token, purpose: 'member_login' });
        if (!user) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid or expired magic link' }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `chamber_demo_member=${encodeURIComponent(body.token)}; Path=/; HttpOnly; SameSite=Lax`,
        });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/chamber-demo/member-auth/logout' && method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'chamber_demo_member=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax',
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === '/api/chamber-demo/member/me') {
    const member = await getAuthedMember(req);
    if (!member) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'member auth required' }));
      return;
    }
    const hotDeals = (await tenantQuery(
      chamberConfig.tenantId,
      `SELECT COUNT(*)::int AS hot_deals FROM chamber.content_items WHERE tenant_id = $1 AND org_id = $2`,
      [member.org_id]
    )).rows[0];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      user: {
        id: member.id,
        email: member.email,
        role: member.role,
        first_name: member.first_name,
        last_name: member.last_name,
      },
      organization: {
        id: member.org_id,
        name: member.org_name,
        status: member.org_status,
        payment_status: member.payment_status,
        renewal_date: member.renewal_date,
        tier_name: member.tier_name,
      },
      summary: {
        hotDeals: hotDeals?.hot_deals || 0,
      },
    }));
    return;
  }

  if (url.pathname === '/api/chamber-demo/admin/login' && method === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        if (body.code !== chamberConfig.auth.adminAccessCode) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid access code' }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `${chamberConfig.auth.adminSessionCookie}=${encodeURIComponent(chamberConfig.auth.adminAccessCode)}; Path=/; HttpOnly; SameSite=Lax`,
        });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/chamber-demo/admin/logout' && method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `${chamberConfig.auth.adminSessionCookie}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`,
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === '/api/chamber-demo/admin/overview') {
    if (!isAdminAuthed(req)) return sendAdminUnauthorized(res);
    const payload = await getAdminOverview();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }

  if (url.pathname.startsWith('/api/chamber-demo/admin/organizations/')) {
    if (!isAdminAuthed(req)) return sendAdminUnauthorized(res);
    const parts = url.pathname.split('/');
    const orgId = parts[5];
    const action = parts[6] || null;

    if (method === 'GET' && !action) {
      const payload = await getAdminOrganization(orgId);
      res.writeHead(payload.organization ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload.organization ? payload : { error: 'organization not found' }));
      return;
    }

    if (method === 'POST' && action === 'approve') {
      const payload = await approveOrganization(orgId);
      res.writeHead(payload ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload || { error: 'organization not found or not pending' }));
      return;
    }
  }

  if (url.pathname.startsWith('/api/chamber-demo/admin/content/')) {
    if (!isAdminAuthed(req)) return sendAdminUnauthorized(res);
    const parts = url.pathname.split('/');
    const contentId = parts[5];
    const action = parts[6] || null;

    if (method === 'POST' && (action === 'approve' || action === 'archive')) {
      const payload = await moderateContent(contentId, action);
      res.writeHead(payload ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload || { error: 'content item not found or not pending_review' }));
      return;
    }
  }

  if (url.pathname === '/api/chamber-demo/join' && req.method.toUpperCase() === 'POST') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        const payload = await createJoinApplication(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === '/demo/chamber-ui.css') {
    const css = fs.readFileSync(files.sharedCss, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end(css);
    return;
  }

  if (url.pathname === '/demo/chamber-ui.js') {
    const js = fs.readFileSync(files.sharedJs, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(js);
    return;
  }

  if (url.pathname.startsWith('/demo/assets/')) {
    const assetName = path.basename(url.pathname);
    const assetPath = path.join(demoDir, 'assets', assetName);
    if (!fs.existsSync(assetPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'asset not found' }));
      return;
    }
    const ext = path.extname(assetPath).toLowerCase();
    const contentType = ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.png'
        ? 'image/png'
        : ext === '.svg'
          ? 'image/svg+xml'
          : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(assetPath));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/chamber-demo' || url.pathname === '/chamber-demo/') return sendHtml(res, files.home);
  if (url.pathname === '/chamber-demo/directory') return sendHtml(res, files.directory);
  if (url.pathname.startsWith('/chamber-demo/directory/')) return sendHtml(res, files.orgDetail);
  if (url.pathname === '/chamber-demo/events') return sendHtml(res, files.events);
  if (url.pathname.startsWith('/chamber-demo/events/')) return sendHtml(res, files.eventDetail);
  if (url.pathname === '/chamber-demo/join') return sendHtml(res, files.join);
  if (url.pathname === '/chamber-demo/member-login') return sendHtml(res, path.join(demoDir, 'chamber-member-login.html'));
  if (url.pathname === '/chamber-demo/member-consume') return sendHtml(res, path.join(demoDir, 'chamber-member-consume.html'));
  if (url.pathname === '/chamber-demo/member-dashboard') return sendHtml(res, path.join(demoDir, 'chamber-member-dashboard.html'));
  if (url.pathname === '/chamber-demo/admin') return sendHtml(res, files.admin);
  if (url.pathname.startsWith('/chamber-demo/admin/organizations/')) return sendHtml(res, files.adminOrgDetail);

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, () => {
  console.log(`Chamber demo local server running at http://localhost:${port}`);
});

process.on('uncaughtException', (err) => {
  console.error('[chamber-demo] Uncaught exception:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[chamber-demo] Unhandled rejection:', reason);
});
process.on('SIGTERM', () => {
  console.log('[chamber-demo] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[chamber-demo] Server closed');
    process.exit(0);
  });
});
process.on('SIGINT', () => {
  console.log('[chamber-demo] SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('[chamber-demo] Server closed');
    process.exit(0);
  });
});
server.on('error', (err) => {
  console.error('[chamber-demo] Server error:', err.message, err.stack);
});
server.on('close', () => {
  console.log('[chamber-demo] Server connections closed');
});
