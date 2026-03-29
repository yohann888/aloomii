/**
 * Vibrnt Dashboard — Cloudflare Worker
 * Serves at https://aloomii.com/vibrnt/*
 * Password: set via CLOUDFLARE_SECRET_VIBRNT_PASS (Workers Secrets)
 * Default dev password: vibrnt2026
 *
 * Deploy:
 *   npx wrangler secret put VIBRNT_PASS --name vibrnt-worker
 *   npx wrangler deploy workers/auth.js
 *
 * Or via CI: set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in GitHub Actions secrets
 */

const AUTH_COOKIE = 'vibrnt_auth';
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vibrnt — Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0f; color: #e8e8f0; font-family: system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #111118; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 40px; width: 100%; max-width: 380px; }
    .logo { font-size: 28px; font-weight: 700; margin-bottom: 28px; color: #e040fb; text-align: center; }
    .logo span { color: #00e5ff; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 6px; text-align: center; }
    p { font-size: 13px; color: #8888a0; text-align: center; margin-bottom: 28px; }
    label { display: block; font-size: 11px; color: #8888a0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    input { width: 100%; padding: 12px 16px; background: #0a0a0f; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #e8e8f0; font-size: 15px; outline: none; transition: border-color 0.2s; margin-bottom: 16px; }
    input:focus { border-color: #e040fb; }
    button { width: 100%; padding: 13px; background: #e040fb; border: none; border-radius: 8px; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:hover { background: #c030e0; }
    .error { color: #ff4d6a; font-size: 12px; text-align: center; margin-top: 12px; display: none; }
    .error.show { display: block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">vibrnt<span>.ai</span></div>
    <h1>Operations Dashboard</h1>
    <p>Enter your access password to continue</p>
    <form action="/vibrnt/auth" method="POST">
      <input type="hidden" name="ref" value="/vibrnt/">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Enter password" autocomplete="current-password" required>
      <button type="submit">Sign In</button>
    </form>
    <div id="error" class="error">Incorrect password. Try again.</div>
  </div>
  <script>if (new URLSearchParams(location.search).has('error')) document.getElementById('error').classList.add('show');</script>
</body>
</html>`;

// Inline the dashboard HTML — this will be replaced at deploy time
const DASHBOARD_B64 = '';

function redirect(url) {
  return Response.redirect(url, 302);
}

function buildSetCookieHeader(value, maxAge = 86400) {
  // Returns just the header VALUE — Headers() constructor auto-prefixes the header name
  return `${AUTH_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Serve static assets
  if (path === '/vibrnt/favicon.ico') {
    return new Response(null, { status: 204 });
  }

  // Auth endpoint
  if (path === '/vibrnt/auth' && request.method === 'POST') {
    const form = await request.formData();
    const pass = (form.get('password') || '').toString().trim();
    const ref = (form.get('ref') || '/vibrnt/').toString().slice(0, 200);
    const validPass = env.VIBRNT_PASS || 'vibrnt2026';

    if (pass === validPass) {
      const location = url.origin + ref;
      const headers = new Headers();
      headers.set('Location', location);
      headers.append('Set-Cookie', buildSetCookieHeader(pass));
      return new Response(null, { status: 302, headers });
    } else {
      const errUrl = new URL('/vibrnt/login', url.origin);
      errUrl.searchParams.set('error', '1');
      return redirect(errUrl.toString());
    }
  }

  // Serve dashboard HTML for protected routes
  if (path === '/vibrnt/' || path === '/vibrnt/index.html' || path.startsWith('/vibrnt/')) {
    if (path === '/vibrnt/login') {
      return new Response(LOGIN_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Check auth
    const cookies = request.headers.get('Cookie') || '';
    const match = cookies.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]*)`));
    const cookie = match ? decodeURIComponent(match[1]) : null;
    const validPass = env.VIBRNT_PASS || 'vibrnt2026';

    if (cookie !== validPass) {
      return redirect(url.origin + '/vibrnt/login?ref=' + encodeURIComponent(path));
    }

    // Serve dashboard — use inline HTML if available
    // Decode base64-encoded dashboard HTML
let DASHBOARD_HTML = '';
try {
  DASHBOARD_HTML = atob(DASHBOARD_B64);
} catch(e) {
  DASHBOARD_HTML = generateDashboardHTML();
}
const html = DASHBOARD_HTML || generateDashboardHTML();

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  return new Response('Not Found', { status: 404 });
}

function generateDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vibrnt — Dashboard</title>
<style>
body{background:#0a0a0f;color:#e8e8f0;font-family:system-ui,sans-serif;padding:40px;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px;max-width:600px}
h1{color:#e040fb;margin-bottom:16px}.data{margin-top:24px;padding:16px;background:#0a0a0f;border-radius:8px;font-size:13px}
.status{color:#00e5a0;margin-bottom:8px}.note{color:#888;font-size:12px;margin-top:16px}
</style>
</head>
<body>
<div class="card">
  <h1>vibrnt.ai Dashboard</h1>
  <div class="status">&#10003; Authenticated</div>
  <div class="data">
    <p><strong>Vibrnt Operations Dashboard</strong></p>
    <p>To enable full dashboard content:</p>
    <ol style="margin-top:8px;padding-left:20px">
      <li>Run <code>node vibrnt/build-static.js</code> to embed latest trends/scripts</li>
      <li>Redeploy this Worker with the updated HTML</li>
    </ol>
  </div>
  <p class="note">Built: ${new Date().toISOString().slice(0,10)} | Fleet running 24/7</p>
</div>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return new Response('Internal Error: ' + e.message, { status: 500 });
    }
  },
};
