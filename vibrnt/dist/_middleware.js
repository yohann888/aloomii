/**
 * Vibrnt Dashboard — Cloudflare Pages Function (Auth Middleware)
 * Protects /vibrnt/* with password auth.
 * Deploy as: _middleware.js in the Pages project root (auto-runs on all routes)
 * Password: set in Cloudflare Pages env var VIBRNT_DASHBOARD_PASS
 */

const AUTH_COOKIE = 'vibrnt_auth';
const LOGIN_PATH = '/vibrnt/login';

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Allow login page through
  if (path === LOGIN_PATH) {
    return next();
  }

  // POST /vibrnt/auth — handle login form
  if (path === '/vibrnt/auth' && request.method === 'POST') {
    try {
      const formData = await request.formData();
      const pass = (formData.get('password') || '').toString().trim();
      const ref = (formData.get('ref') || '/vibrnt/').toString();
      const validPass = env.VIBRNT_DASHBOARD_PASS || 'vibrnt2026';

      if (pass === validPass) {
        const resp = Response.redirect(url.origin + ref, 302);
        resp.headers.append('Set-Cookie', `${AUTH_COOKIE}=${pass}; Path=/; Max-Age=86400; SameSite=Lax`);
        return resp;
      } else {
        const errUrl = new URL(LOGIN_PATH, url.origin);
        errUrl.searchParams.set('error', '1');
        errUrl.searchParams.set('ref', ref);
        return Response.redirect(errUrl.toString(), 302);
      }
    } catch {
      return Response.redirect(url.origin + LOGIN_PATH, 302);
    }
  }

  // Check auth cookie
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]*)`));
  const cookie = match ? decodeURIComponent(match[1]) : null;
  const validPass = env.VIBRNT_DASHBOARD_PASS || 'vibrnt2026';

  if (cookie !== validPass) {
    const refUrl = new URL(LOGIN_PATH, url.origin);
    refUrl.searchParams.set('ref', path);
    return Response.redirect(refUrl.toString(), 302);
  }

  // Authenticated — serve the static file
  return next();
}
