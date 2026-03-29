#!/usr/bin/env node
/**
 * build-static.js — Pre-render Vibrnt dashboard with embedded data
 * Reads VibrntVault, embeds all data into dashboard HTML as JS variables.
 * Run at build time (GitHub Actions) so dashboard is fully static.
 */

const fs = require('fs');
const path = require('path');

const VAULT = path.join(__dirname, '..', 'vibrntvault');
const TRENDS_DIR = path.join(VAULT, 'Trends');
const SCRIPTS_DIR = path.join(VAULT, 'Scripts');
const CATALOG_PATH = path.join(VAULT, 'product-catalog-template.md');
const DEDUP_FILE = '/Users/superhana/.openclaw/workspace/vibrnt-seen-trends.json';
const INPUT_HTML = path.join(__dirname, 'index.html');
const OUTPUT_HTML = path.join(__dirname, 'dist', 'index.html');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };

function readDir(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => !ext || f.endsWith(ext))
    .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
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
  const body = raw.replace(/^---[\s\S]*?\n---\n/, '').trim();
  return { meta, body };
}

function escJson(s) {
  if (s === null || s === undefined) return '';
  return JSON.stringify(String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${'));
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function build() {
  // -- Load trends (POD Fit ≥ 6 only) --------------------------------------------------------------
  const trendFiles = readDir(TRENDS_DIR, '.md');
  const trends = trendFiles.slice(0, 30).map(f => {
    const raw = fs.readFileSync(f.path, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const podFit = parseInt(meta.podFit || meta['pod-fit'] || 0, 10);
    if (podFit < 6) return null; // filter out < 6

    return {
      date: f.name.replace('.md', ''),
      file: f.name,
      title: meta.title || meta.name || 'Trend Report',
      podFit: podFit,
      tags: meta.tags ? meta.tags.split(',').map(t => t.trim()) : [],
      body: body.slice(0, 2000),
      mtime: f.mtime.toISOString(),
    };
  }).filter(Boolean); // remove nulls

  // -- Load scripts -----------------------------------------------------------
  const scriptFiles = readDir(SCRIPTS_DIR, '.md');
  const scripts = scriptFiles.slice(0, 30).map(f => {
    const raw = fs.readFileSync(f.path, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    const name = f.name.replace('.md', '');
    const type = name.includes('selffilm') || name.includes('self-film') ? 'self-film'
      : name.includes('ugc') ? 'ugc' : 'slideshow';
    const date = name.replace(/-selffilm$/, '').replace(/-ugc$/, '').replace(/-slideshow$/, '').replace(/-[^-]+$/, '');
    return {
      date,
      file: f.name,
      type,
      title: meta.title || meta.name || name,
      mood: meta.mood || '',
      body,
      mtime: f.mtime.toISOString(),
    };
  });

  // -- Load catalog -----------------------------------------------------------
  let catalog = { products: [], updated: null };
  if (fs.existsSync(CATALOG_PATH)) {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    catalog.updated = meta.updated || null;

    // Parse products from markdown
    const lines = body.split('\n');
    let current = {};
    const products = [];
    for (const line of lines) {
      if (line.startsWith('## Product ')) {
        if (current.name) products.push(current);
        current = { name: line.replace('## Product ', '').trim() };
      } else if (line.includes('**Collection:**')) {
        current.collection = line.match(/\*\*Collection:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Type:**')) {
        current.type = line.match(/\*\*Type:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Style:**')) {
        current.style = line.match(/\*\*Style:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Moods:**')) {
        current.moods = (line.match(/\*\*Moods:\*\* (.*)/)?.[1] || '').split(',').map(t => t.trim()).filter(Boolean);
      } else if (line.includes('**Target audience:**')) {
        current.audience = line.match(/\*\*Target audience:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Colors:**')) {
        current.colors = line.match(/\*\*Colors:\*\* (.*)/)?.[1] || '';
      }
    }
    if (current.name) products.push(current);
    catalog.products = products;

    // Link products to trends
    catalog.products.forEach(product => {
      const relatedTrend = trends.find(t => 
        t.title.toLowerCase().includes(product.name.toLowerCase().slice(0,8)) ||
        (product.moods && product.moods.some(m => t.tags && t.tags.some(tag => tag.toLowerCase().includes(m.toLowerCase()))))
      );
      if (relatedTrend) {
        product.relatedTrend = relatedTrend.title;
        product.relatedReason = `Matches trend due to mood overlap and POD Fit ${relatedTrend.podFit}`;
      }
    });
  }

  // -- Build summary -----------------------------------------------------------
  const summary = {
    latestTrend: trends[0]?.date || null,
    latestScripts: scripts.slice(0, 3).map(s => s.file),
    trendCount: trends.length,
    scriptCount: scripts.length,
    lastBuilt: new Date().toISOString(),
    filter: "POD Fit ≥ 6 only"
  };

  // -- Load seen trends (dedup) -----------------------------------------------
  let seenTrends = [];
  try {
    if (fs.existsSync(DEDUP_FILE)) {
      const dedupData = JSON.parse(fs.readFileSync(DEDUP_FILE, 'utf-8'));
      seenTrends = Object.values(dedupData).map(v => v.name);
    }
  } catch (e) {}

  // -- Inject into HTML -------------------------------------------------------
  let html = fs.readFileSync(INPUT_HTML, 'utf-8');

  // Inject embedded data + fetchJSON override (single </head> replacement)
  const embeddedScript = `<script>
window.__VIBRNT_DATA__ = ${JSON.stringify({ trends, scripts, catalog, summary, seenTrends })};
window.__VIBRNT_BUILT__ = '<!-- DASHBOARD_HTML_REPLACED_AT_BUILD -->\${new Date().toISOString()}';
(function() {
  var _d = window.__VIBRNT_DATA__ || { trends: [], scripts: [], catalog: { products: [] }, summary: {}, seenTrends: [] };
  var _realFetch = window.fetchJSON; // undefined at this point
  var _routes = {
    '/api/summary': _d.summary,
    '/api/trends': { trends: _d.trends },
    '/api/scripts': { scripts: _d.scripts },
    '/api/catalog': _d.catalog,
  };
  // Expose embedded data lookup - fetchJSON will check this first
  window.__embed = function(url) {
    if (_routes[url]) return Promise.resolve(_routes[url]);
    return undefined;
  };
})();
</script>`;

  html = html.replace('</head>', embeddedScript + '\n</head>');

  // Patch the real fetchJSON to prefer embedded data
  const oldFetchCall = 'const r = await fetch(API + url);';
  const newFetchCall = "const _embed = window.__embed && window.__embed(url); if (_embed) return _embed; const r = await fetch(API + url);";
  html = html.replace(oldFetchCall, newFetchCall);

  // -- Write output -----------------------------------------------------------
  fs.mkdirSync(path.dirname(OUTPUT_HTML), { recursive: true });
  fs.writeFileSync(OUTPUT_HTML, html, 'utf-8');

  // Also copy _middleware.js and login.html to dist/
  const distDir = path.dirname(OUTPUT_HTML);
  ['_middleware.js', 'login.html'].forEach(file => {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(distDir, file));
    }
  });

  console.log('✅ Built static dashboard');
  console.log(`   Trends: ${trends.length} reports`);
  console.log(`   Scripts: ${scripts.length} scripts`);
  console.log(`   Products: ${catalog.products.length}`);
  console.log(`   Output: ${OUTPUT_HTML}`);
}

build().catch(e => { console.error('Build failed:', e.message); process.exit(1); });
