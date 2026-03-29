/**
 * Vibrnt Dashboard Server
 * Serves the Vibrnt operations dashboard for Jenny.
 * Reads from the VibrntVault — trends, scripts, product catalog.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3101;
const VAULT = '/Users/superhana/Documents/VibrntVault/VIBRNT';
const TRENDS_DIR = path.join(VAULT, 'Trends');
const SCRIPTS_DIR = path.join(VAULT, 'Scripts');

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function readDir(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => !ext || f.endsWith(ext))
    .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
}

function readFileJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    // Strip frontmatter
    const stripped = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
    return stripped.trim();
  } catch { return ''; }
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  if (match) {
    match[1].split('\n').forEach(line => {
      const [k, ...v] = line.split(':');
      if (k && v.length) meta[k.trim()] = v.join(':').trim();
    });
  }
  const body = raw.replace(/^---[\s\S]*?\n---\n/, '');
  return { meta, body: body.trim() };
}

// ── Static files ─────────────────────────────────────────────────────────────
function serveStatic(req, res) {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  fs.createReadStream(filePath).pipe(res);
}

// ── API: GET /api/trends ──────────────────────────────────────────────────────
function apiTrends(req, res) {
  const files = readDir(TRENDS_DIR, '.md').slice(0, 30); // last 30 days
  const trends = files.map(f => {
    const raw = fs.readFileSync(f.path, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const date = f.name.replace('.md', '');
    return { date, file: f.name, meta, body: body.slice(0, 500), mtime: f.mtime };
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ trends }));
}

// ── API: GET /api/scripts ────────────────────────────────────────────────────
function apiScripts(req, res) {
  const files = readDir(SCRIPTS_DIR, '.md').slice(0, 30);
  const scripts = files.map(f => {
    const raw = fs.readFileSync(f.path, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const date = f.name.replace('.md', '').replace(/-selffilm$/, '').replace(/-ugc$/, '').replace(/-slideshow$/, '');
    const type = f.name.includes('selffilm') || f.name.includes('self-film') ? 'self-film' : f.name.includes('ugc') ? 'ugc' : 'slideshow';
    return { date, file: f.name, type, meta, body, mtime: f.mtime };
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ scripts }));
}

// ── API: GET /api/catalog ────────────────────────────────────────────────────
function apiCatalog(req, res) {
  const catalogPath = path.join(VAULT, 'product-catalog-template.md');
  if (!fs.existsSync(catalogPath)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ catalog: null }));
    return;
  }
  const raw = fs.readFileSync(catalogPath, 'utf-8');
  const { meta, body } = parseFrontmatter(raw);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ meta, body }));
}

// ── API: GET /api/summary ────────────────────────────────────────────────────
function apiSummary(req, res) {
  const trendFiles = readDir(TRENDS_DIR, '.md');
  const scriptFiles = readDir(SCRIPTS_DIR, '.md');
  const latestTrend = trendFiles[0] ? trendFiles[0].name.replace('.md', '') : null;
  const latestScripts = scriptFiles.slice(0, 3).map(f => f.name);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    latestTrend,
    latestScripts,
    trendCount: trendFiles.length,
    scriptCount: scriptFiles.length,
  }));
}

// ── Router ───────────────────────────────────────────────────────────────────
const routes = {
  'GET /api/trends': apiTrends,
  'GET /api/scripts': apiScripts,
  'GET /api/catalog': apiCatalog,
  'GET /api/summary': apiSummary,
};

function route(req, res) {
  const key = `${req.method} ${req.url.split('?')[0]}`;
  if (routes[key]) { routes[key](req, res); return; }
  if (req.url.startsWith('/public/') || req.url === '/' || req.url.endsWith('.css') || req.url.endsWith('.js')) {
    serveStatic(req, res); return;
  }
  res.writeHead(404); res.end('Not found');
}

// ── Start ────────────────────────────────────────────────────────────────────
http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  route(req, res);
}).listen(PORT, () => {
  console.log(`Vibrnt Dashboard running at http://localhost:${PORT}`);
});
