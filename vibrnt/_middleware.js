/**
 * Vibrnt Dashboard — Password Protection Middleware
 * Cloudflare Pages Function (runs on every request to /vibrnt/*)
 * Checks for auth cookie. Redirects to /vibrnt/login if missing.
 */

const COOKIE_NAME = 'vibrnt_auth';

function setAuthCookie(pass) {
  const maxAge = 60 * 60 * 24; // 24 hours
  return `${COOKIE_NAME}=${pass}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function clearAuthCookie() {
  return `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

function unauthorized(request, path) {
  const loginUrl = new URL('/vibrnt/login', request.url);
  if (path !== '/vibrnt/') {
    loginUrl.searchParams.set('ref', path);
  }
  return Response.redirect(loginUrl.toString(), 302);
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Login page — always allow through
  if (path === '/vibrnt/login' || path === '/login.html') {
    return fetch(request);
  }

  // Auth endpoint — handles password validation
  if (path === '/vibrnt/auth') {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    const formData = await request.formData();
    const pass = (formData.get('password') || '').toString().trim();
    const ref = (formData.get('ref') || '/vibrnt/').toString();
    const validPass = (request.env && request.env.VIBRNT_DASHBOARD_PASS) || 'vibrnt2026';

    if (pass === validPass) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': ref,
          'Set-Cookie': setAuthCookie(pass),
        },
      });
    } else {
      const errUrl = new URL('/vibrnt/login', request.url);
      errUrl.searchParams.set('error', '1');
      errUrl.searchParams.set('ref', ref);
      return Response.redirect(errUrl.toString(), 302);
    }
  }

  // Protected routes: require auth cookie
  if (path.startsWith('/vibrnt/') && path !== '/vibrnt/') {
    const cookies = request.headers.get('Cookie') || '';
    const match = cookies.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]*)'));
    const cookieValue = match ? decodeURIComponent(match[1]) : null;
    const validPass = (request.env && request.env.VIBRNT_DASHBOARD_PASS) || 'vibrnt2026';

    if (cookieValue !== validPass) {
      return unauthorized(request, path);
    }
  }

  // Root /vibrnt/ — always pass through (but requires auth on first load)
  // Strip /vibrnt prefix and serve from static/
  const stripped = path.replace(/^\/vibrnt/, '') || '/';
  const staticPath = stripped === '/' ? '/index.html' : stripped;

  const staticUrl = new URL(staticPath, request.url);
  staticUrl.hostname = url.hostname;
  staticUrl.protocol = url.protocol;

  // Try to fetch the static file
  const staticReq = new Request(staticUrl.toString(), request);
  try {
    const resp = await fetch(staticReq);
    if (resp.ok && resp.status < 400) {
      return resp;
    }
  } catch {}

  // Fallback to index.html (SPA routing)
  try {
    const indexReq = new Request(url.origin + '/index.html', request);
    const indexResp = await fetch(indexReq);
    return indexResp;
  } catch {
    return new Response('Service Unavailable', { status: 503 });
  }
}

export const onRequest = handleRequest;
