/**
 * Vibrnt Auth Worker
 * Handles /vibrnt/* — checks auth cookie, serves static assets, handles login.
 * Deploy with: wrangler deploy workers/auth.js --env production
 */

const AUTH_COOKIE = 'vibrnt_auth';
const LOGIN_PATH = '/vibrnt/login';
const STATIC_PATH = '/vibrnt/dist';
const ASSETS = 'aloomii.pages.dev'; // Pages project for static assets

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Login handler
  if (path === LOGIN_PATH && request.method === 'POST') {
    const form = await request.formData();
    const pass = (form.get('password') || '').toString().trim();
    const ref = (form.get('ref') || '/vibrnt/').toString();
    const validPass = env.VIBRNT_PASS || 'vibrnt2026';

    if (pass === validPass) {
      const resp = Response.redirect(url.origin + ref, 302);
      resp.headers.set('Set-Cookie', `${AUTH_COOKIE}=${pass}; Path=/; Max-Age=86400; SameSite=Lax`);
      return resp;
    } else {
      const errUrl = new URL(LOGIN_PATH, url.origin);
      errUrl.searchParams.set('error', '1');
      return Response.redirect(errUrl.toString(), 302);
    }
  }

  // Auth check for protected paths
  if (path.startsWith('/vibrnt/') && !path.startsWith(LOGIN_PATH) && path !== '/vibrnt/favicon.ico') {
    const cookies = request.headers.get('Cookie') || '';
    const match = cookies.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]*)`));
    const cookie = match ? decodeURIComponent(match[1]) : null;
    const validPass = env.VIBRNT_PASS || 'vibrnt2026';

    if (cookie !== validPass) {
      return Response.redirect(url.origin + LOGIN_PATH + '?ref=' + encodeURIComponent(path), 302);
    }
  }

  // Serve static files from dist/ or redirect to Pages
  const stripped = path.replace('/vibrnt', '') || '/';
  const assetPath = stripped === '/' ? '/index.html' : stripped;

  // Try to fetch from Cloudflare Pages
  try {
    const staticUrl = `https://aloomii.com/vibrnt/dist${assetPath}`;
    const resp = await fetch(staticUrl, request);
    if (resp.ok) return resp;
  } catch {}

  // Fallback: serve from local dist if running locally
  try {
    const localPath = path.join('/var/task/dist', assetPath);
    const fs = require('fs');
    if (fs.existsSync(localPath)) {
      const body = fs.readFileSync(localPath);
      const ext = path.extname(localPath);
      return new Response(body, {
        headers: { 'Content-Type': MIME[ext] || 'text/html' }
      });
    }
  } catch {}

  // Last resort: index.html
  return Response.redirect(`https://aloomii.com/vibrnt/dist/index.html`, 302);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  }
};
