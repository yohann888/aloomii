#!/usr/bin/env node
/**
 * Local dev server for Command Center
 * Serves static files + /api/command from real Postgres
 * Usage: node command/serve-local.js
 * Opens at http://localhost:3200
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const registerCommandAPI = require('../scripts/dashboard/command-api');
const config = require('./config');
const { cfAuth } = require('./cloudflare-auth');

// ─── Minimal Express-like app shim ────────────────────────────────────────────
// Supports get/post/patch/delete, Express-style :param routing, JSON body parsing

const routes = []; // Array of { method, pattern, regex, keys, handler }

function pathToRegex(pattern) {
  // Convert Express pattern like /api/command/queue/:id/snooze
  // to a regex that captures :param values
  const keys = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${regexStr}$`), keys };
}

const app = {
  get(path, handler) {
    const { regex, keys } = pathToRegex(path);
    routes.push({ method: 'GET', path, regex, keys, handler });
  },
  post(path, handler) {
    const { regex, keys } = pathToRegex(path);
    routes.push({ method: 'POST', path, regex, keys, handler });
  },
  patch(path, handler) {
    const { regex, keys } = pathToRegex(path);
    routes.push({ method: 'PATCH', path, regex, keys, handler });
  },
  delete(path, handler) {
    const { regex, keys } = pathToRegex(path);
    routes.push({ method: 'DELETE', path, regex, keys, handler });
  },
};

registerCommandAPI(app);

// ─── Route matcher ─────────────────────────────────────────────────────────────
function matchRoute(method, urlPath) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.regex.exec(urlPath);
    if (match) {
      const params = {};
      route.keys.forEach((key, i) => { params[key] = match[i + 1]; });
      return { handler: route.handler, params };
    }
  }
  return null;
}

// ─── Body parser (async, reads POST/PATCH request body) ────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ─── Rate Limiter ──────────────────────────────────────────────────────────────
const rateLimitMap = new Map(); // ip -> [{ ts, count }]
const RATE_LIMIT = 100;        // requests
const RATE_WINDOW = 60000;     // per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || [];

  // Prune old entries
  const recent = entry.filter(ts => now - ts < RATE_WINDOW);
  rateLimitMap.set(ip, recent);

  if (recent.length >= RATE_LIMIT) {
    return false;
  }
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

// ─── Security headers ──────────────────────────────────────────────────────────
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'";

// ─── Compress if Accept-Encoding includes gzip ───────────────────────────────────
function maybeCompress(data, acceptEncoding) {
  if (!acceptEncoding) return { data, encoding: null };
  if (acceptEncoding.includes('gzip')) {
    return { data: zlib.gzipSync(data), encoding: 'gzip' };
  }
  if (acceptEncoding.includes('deflate')) {
    return { data: zlib.deflateSync(data), encoding: 'deflate' };
  }
  return { data, encoding: null };
}

// ─── Static file cache config ──────────────────────────────────────────────────
const STATIC_EXTENSIONS = ['.css', '.js', '.png', '.svg', '.ico', '.woff2', '.woff'];
function isStaticAsset(urlPath) {
  return STATIC_EXTENSIONS.includes(path.extname(urlPath));
}

// ─── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const ip = req.socket.remoteAddress || 'unknown';
  const url = new URL(req.url, 'http://localhost');
  const method = req.method.toUpperCase();
  const acceptEncoding = req.headers['accept-encoding'] || '';

  // Apply CORS
  const origin = req.headers.origin || '';
  const allowedOrigin = config.allowedOrigin === '*'
    ? origin || '*'
    : (origin === config.allowedOrigin ? origin : config.allowedOrigin);
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Pre-flight
  if (method === 'OPTIONS') {
    Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.writeHead(204);
    res.end();
    return;
  }

  // Security headers for all responses
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Content-Security-Policy', CSP);

  // Health check — no rate limit, no auth
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  // Rate limit API routes
  if (url.pathname.startsWith('/api/')) {
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
  } else {
    // Static assets: long cache
    if (isStaticAsset(url.pathname)) {
      res.setHeader('Cache-Control', 'max-age=3600');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }

  // Route matching
  const route = matchRoute(method, url.pathname);

  if (route) {
    const { handler, params } = route;

    // Build Express-like req/res objects first (needed for auth middleware)
    const fakeReq = {
      method,
      params,
      query: Object.fromEntries(url.searchParams),
      path: url.pathname,
      url: req.url,
      body: {},
    };

    // Parse body for methods that expect it
    if (['POST', 'PATCH', 'PUT'].includes(method)) {
      try {
        fakeReq.body = await parseBody(req);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    } else {
      // Drain any body data for non-body methods
      req.resume();
    }

    const fakeRes = {
      _status: 200,
      _headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowedOrigin },
      _sent: false,
      status(code) { this._status = code; return this; },
      setHeader(name, val) { this._headers[name] = val; return this; },
      json(data) {
        this._sent = true;
        const body = JSON.stringify(data);
        res.writeHead(this._status, this._headers);
        res.end(body);
      }
    };

    // Apply Cloudflare Access JWT middleware when CF_AUD is configured
    // (skip /health — health checks should always be accessible)
    const needsAuth = url.pathname !== '/health' && process.env.CF_AUD;
    if (needsAuth) {
      let authPassed = false;
      const authPromise = new Promise((resolve) => {
        cfAuth(fakeReq, fakeRes, () => {
          authPassed = true;
          resolve();
        });
      });
      // await auth to either call next() (authPassed=true) or send response (fakeRes._sent=true)
      await authPromise;
      if (fakeRes._sent) return; // cfAuth sent a response (401/500) — stop here
      if (!authPassed) return;    // safety fallback
    }

    try {
      const result = handler(fakeReq, fakeRes);
      if (result && typeof result.then === 'function') {
        result.catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }

    const elapsed = Date.now() - startTime;
    console.log(`${method.padEnd(7)} ${url.pathname.padEnd(40)} 200  ${elapsed}ms`);
    return;
  }

  // ─── Static file serving ─────────────────────────────────────────────────────
  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);

  // Serve images from parent directory
  if (url.pathname.startsWith('/images/')) {
    filePath = path.join(__dirname, '..', url.pathname);
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);

    // Compress text-based responses
    if (['.html', '.css', '.js', '.json'].includes(ext)) {
      const { data: compressed, encoding } = maybeCompress(data, acceptEncoding);
      const headers = {
        'Content-Type': contentType,
        'Content-Encoding': encoding,
        'Access-Control-Allow-Origin': allowedOrigin,
      };
      // No caching in local dev — version query strings handle cache busting
      headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      res.end(compressed);
    } else {
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': allowedOrigin });
      res.end(data);
    }
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }

  const elapsed = Date.now() - startTime;
  console.log(`${method.padEnd(7)} ${url.pathname.padEnd(40)} 404  ${elapsed}ms`);
});

const PORT = config.port;
server.listen(PORT, () => {
  console.log(`\n  🦁 Aloomii Command Center`);
  console.log(`  Local: http://localhost:${PORT}`);
  console.log(`  API:   http://localhost:${PORT}/api/command`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  CORS:   ${config.allowedOrigin === '*' ? 'all origins (dev)' : config.allowedOrigin}\n`);
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n  ${signal} received — shutting down gracefully...`);

  server.close(async () => {
    console.log('  HTTP server closed.');

    // Close DB pool if available
    try {
      const { pool } = require('../scripts/dashboard/pg-pool');
      if (pool && typeof pool.end === 'function') {
        await pool.end();
        console.log('  DB pool closed.');
      }
    } catch {
      // pool not available, skip
    }

    console.log('  Goodbye.\n');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('  Forced exit after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
