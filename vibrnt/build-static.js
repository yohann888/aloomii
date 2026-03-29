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
  // -- Load trends: parse individual blocks AND provide body for dashboard renderer ----
  const trendFiles = readDir(TRENDS_DIR, '.md');
  let allTrends = []; // parsed individual trend objects for product linking

  // trendReports = old format with body — this is what the dashboard JS actually renders
  const trendReports = [];

  for (const f of trendFiles.slice(0, 7)) {
    const raw = fs.readFileSync(f.path, 'utf-8');
    const reportDate = f.name.replace('.md', '');
    const { meta, body } = parseFrontmatter(raw);

    // Check if any trend in this file has POD Fit >= 6
    const sections = raw.split(/\n---\n/);
    let filePasses = false;

    for (const section of sections) {
      if (!section.includes('type: trend') || !section.includes('pod_fit_score')) continue;

      const trendMeta = {};
      section.split('\n').forEach(line => {
        const m = line.match(/^(\w+(?:_\w+)*):\s*(.+)/);
        if (m) trendMeta[m[1]] = m[2].trim().replace(/^["'\[]|["'\]]$/g, '');
      });

      const podFit = parseInt(trendMeta['pod_fit_score'] || 0, 10);
      const title = (trendMeta['trend_name'] || '').replace(/^"|"$/g, '');
      const keywords = (trendMeta['related_keywords'] || '').replace(/[\[\]]/g, '').split(',').map(k => k.trim()).filter(Boolean);
      const platform = (trendMeta['platform'] || '').replace(/[\[\]]/g, '');
      const composite = parseFloat(trendMeta['composite_score'] || 0);

      if (!title) continue;

      allTrends.push({ date: reportDate, file: f.name, title, podFit, composite, platform, keywords, tags: keywords });

      if (podFit >= 6) filePasses = true;
    }

    // Only include this report file in the dashboard if it has ≥ 1 trend with POD Fit >= 6
    if (filePasses) {
      trendReports.push({
        date: reportDate,
        file: f.name,
        title: meta.title || `Trend Report — ${reportDate}`,
        tags: [],
        body: body.slice(0, 5000), // full body for dashboard JS block parsing
        mtime: f.mtime.toISOString(),
      });
    }
  }

  // trends = what gets passed to dashboard (full reports with body, for renderer)
  const trends = trendReports;

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

    // Link products to trends using keyword + mood matching
    catalog.products.forEach(product => {
      const productMoods = product.moods || [];
      const productName = (product.name || '').toLowerCase();

      let bestTrend = null;
      let bestScore = 0;

      allTrends.forEach(t => {
        let score = 0;
        const trendTitle = t.title.toLowerCase();
        const trendKeywords = t.keywords || [];

        // Keyword overlap
        productMoods.forEach(mood => {
          if (trendTitle.includes(mood.toLowerCase())) score += 2;
          if (trendKeywords.some(k => k.toLowerCase().includes(mood.toLowerCase()))) score += 1;
        });

        // Name overlap
        if (trendTitle.includes(productName.slice(0, 6))) score += 3;
        
        if (score > bestScore) {
          bestScore = score;
          bestTrend = t;
        }
      });

      // Fallback: use highest composite score trend
      if (!bestTrend && allTrends.length > 0) {
        bestTrend = allTrends.sort((a, b) => b.composite - a.composite)[0];
      }

      if (bestTrend) {
        const matchReasons = [];
        productMoods.forEach(mood => {
          if (bestTrend.title.toLowerCase().includes(mood.toLowerCase()) ||
              (bestTrend.keywords || []).some(k => k.toLowerCase().includes(mood.toLowerCase()))) {
            matchReasons.push(`"${mood}" mood`);
          }
        });
        product.relatedTrend = bestTrend.title;
        product.relatedTrendDate = bestTrend.date;
        product.relatedReason = matchReasons.length > 0
          ? `Matches via ${matchReasons.join(', ')} (POD Fit ${bestTrend.podFit}/10)`
          : `Best trending signal from ${bestTrend.date} (POD Fit ${bestTrend.podFit}/10)`;
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
window.__VIBRNT_DATA__ = ${JSON.stringify({ trends, allTrends, scripts, catalog, summary, seenTrends })};
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
