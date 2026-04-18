#!/usr/bin/env node
/**
 * build-static.js — Pre-render Vibrnt dashboard with embedded data
 * Reads VibrntVault, embeds all data into dashboard HTML as JS variables.
 * Run at build time (GitHub Actions) so dashboard is fully static.
 */

const fs = require('fs');
const path = require('path');

const VAULT = process.env.VIBRNT_VAULT || '/Users/superhana/Documents/VibrntVault/VIBRNT';
const CMD_API = process.env.CMD_API_URL || 'http://localhost:3200/api';
const TRENDS_DIR = path.join(VAULT, 'Trends');
const SCRIPTS_DIR = path.join(VAULT, 'Scripts');
const PRODUCTS_DIR = path.join(VAULT, 'Products');
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

      const sourceUrl = (trendMeta['source_url'] || '').replace(/^"|"$/g, '');
      allTrends.push({ date: reportDate, file: f.name, title, podFit, composite, platform, keywords, tags: keywords, sourceUrl });

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
      title: (meta.product || meta.title || meta.name || name).replace(/^"|"$/g, ''),
      productName: (meta.product || '').replace(/^"|"$/g, ''),
      trendSource: (meta.trend_source || '').replace(/^"|"$/g, ''),
      mood: meta.mood || '',
      body,
      mtime: f.mtime.toISOString(),
    };
  });

  // -- Load catalog — prefer today's generated products, fall back to static catalog ---
  let catalog = { products: [], updated: null };

  // Find most recent daily products file
  const today = new Date().toISOString().split('T')[0];
  const todayProductFile = path.join(PRODUCTS_DIR, `${today}.md`);
  let catalogRaw = null;

  if (fs.existsSync(PRODUCTS_DIR)) {
    const productFiles = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.md')).sort().reverse();
    const latestProductFile = productFiles.length > 0 ? path.join(PRODUCTS_DIR, productFiles[0]) : null;
    if (latestProductFile) {
      catalogRaw = fs.readFileSync(latestProductFile, 'utf-8');
      catalog.source = latestProductFile;
    }
  }

  if (!catalogRaw && fs.existsSync(CATALOG_PATH)) {
    catalogRaw = fs.readFileSync(CATALOG_PATH, 'utf-8');
    catalog.source = 'static-catalog';
  }

  if (catalogRaw) {
    const raw = catalogRaw;
    const { meta, body } = parseFrontmatter(raw);
    catalog.updated = meta.updated || meta.date || null;

    // Parse products from markdown (supports both static catalog and daily generated format)
    const lines = body.split('\n');
    let current = {};
    const products = [];
    for (const line of lines) {
      if (line.startsWith('## Product ')) {
        if (current.name) products.push(current);
        // Handle both "## Product N: Name" and "## Product N" formats
        current = { name: line.replace(/^## Product \d+:?\s*/, '').trim() };
      } else if (line.includes('**Collection:**')) {
        current.collection = line.match(/\*\*Collection:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Type:**')) {
        current.type = line.match(/\*\*Type:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Style:**')) {
        current.style = line.match(/\*\*Style:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Moods:**') || line.includes('**Mood:**')) {
        current.moods = (line.match(/\*\*Moods?:\*\* (.*)/)?.[1] || '').split(',').map(t => t.trim()).filter(Boolean);
      } else if (line.includes('**Target audience:**')) {
        current.audience = line.match(/\*\*Target audience:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Colors:**')) {
        current.colors = line.match(/\*\*Colors:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Trend Source:**')) {
        current.relatedTrend = line.match(/\*\*Trend Source:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Why This Product:**')) {
        current.relatedReason = line.match(/\*\*Why This Product:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**POD Fit:**')) {
        current.podFit = line.match(/\*\*POD Fit:\*\* (.*)/)?.[1] || '';
      } else if (line.includes('**Trend Date:**')) {
        current.relatedTrendDate = line.match(/\*\*Trend Date:\*\* (.*)/)?.[1] || '';
      }
    }
    if (current.name) products.push(current);
    catalog.products = products;

    // Link products to trends — prefer explicit Trend Source from product file,
    // only fall back to keyword matching if no explicit source was set.
    catalog.products.forEach(product => {
      // If the product file already has a Trend Source, trust it — do NOT override
      if (product.relatedTrend && product.relatedTrend.trim()) {
        // Normalize for fuzzy matching (strip emoji, special chars, extra whitespace)
        const normalize = s => (s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        const productTrendNorm = normalize(product.relatedTrend);
        
        // Try to find the matching trend object for metadata (date, podFit, sourceUrl)
        const matchedTrend = allTrends.find(t => {
          const tNorm = normalize(t.title);
          return tNorm === productTrendNorm || productTrendNorm.includes(tNorm) || tNorm.includes(productTrendNorm);
        });
        if (matchedTrend) {
          product.relatedTrendDate = product.relatedTrendDate || matchedTrend.date;
          product.sourceUrl = matchedTrend.sourceUrl || '';
          if (!product.relatedReason) {
            product.relatedReason = `Directly linked (POD Fit ${matchedTrend.podFit}/10)`;
          }
        }
        return; // Skip keyword matching — explicit source wins
      }

      // Fallback: keyword + mood matching (only when no explicit Trend Source)
      const productMoods = product.moods || [];
      const productName = (product.name || '').toLowerCase();

      let bestTrend = null;
      let bestScore = 0;

      allTrends.forEach(t => {
        let score = 0;
        const trendTitle = t.title.toLowerCase();
        const trendKeywords = t.keywords || [];

        productMoods.forEach(mood => {
          if (trendTitle.includes(mood.toLowerCase())) score += 2;
          if (trendKeywords.some(k => k.toLowerCase().includes(mood.toLowerCase()))) score += 1;
        });

        if (trendTitle.includes(productName.slice(0, 6))) score += 3;
        
        if (score > bestScore) {
          bestScore = score;
          bestTrend = t;
        }
      });

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
        product.sourceUrl = bestTrend.sourceUrl || '';
        product.relatedReason = matchReasons.length > 0
          ? `Matches via ${matchReasons.join(', ')} (POD Fit ${bestTrend.podFit}/10)`
          : `Best trending signal from ${bestTrend.date} (POD Fit ${bestTrend.podFit}/10)`;
      }
    });
  }

  // -- Load influencer pipeline from Command Center API --------------------------
  let influencerPipeline = [];
  try {
    const http = require('http');
    const data = await new Promise((resolve, reject) => {
      const req = http.get(`${CMD_API}/command`, { timeout: 5000 }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
        res.on('error', reject);
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
    if (data && Array.isArray(data.influencer_pipeline)) {
      influencerPipeline = data.influencer_pipeline;
      console.log(`   Influencer pipeline: ${influencerPipeline.length} candidates loaded from Command Center API`);
    }
  } catch (e) {
    console.warn('   Influencer pipeline: could not reach Command Center API (' + e.message + ') — running without it');
  }


  // -- Build summary -----------------------------------------------------------
  const summary = {
    latestTrend: trends[0]?.date || null,
    latestScripts: scripts.slice(0, 3).map(s => s.file),
    trendCount: trends.length,
    scriptCount: scripts.length,
    productCount: catalog.products.length,
    lastBuilt: new Date().toISOString(),
    filter: 'POD Fit ≥ 6 only'
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
  const embeddedData = JSON.stringify({ trends, allTrends, scripts, catalog, summary, seenTrends, influencerPipeline })
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const embeddedScript = `<script>
window.__VIBRNT_DATA__ = ${embeddedData};
window.__VIBRNT_BUILT__ = '<!-- DASHBOARD_HTML_REPLACED_AT_BUILD -->\${new Date().toISOString()}';
(function() {
  var _d = window.__VIBRNT_DATA__ || { trends: [], scripts: [], catalog: { products: [] }, summary: {}, seenTrends: [] };
  // Expose embedded data lookup - fetchJSON will check this first
  window.__embed = function(url) {
    const d = window.__VIBRNT_DATA__ || {};
    const _routes = {
      '/api/summary': d.summary,
      '/api/trends': { trends: d.trends || [] },
      '/api/scripts': { scripts: d.scripts || [] },
      '/api/catalog': d.catalog,
      '/api/influencer_pipeline': { candidates: d.influencerPipeline || [] },
    };
    if (_routes[url]) return Promise.resolve(_routes[url]);
    return undefined;
  };
})();
</script>`;

  html = html.replace('</head>', embeddedScript + '\n</head>');

  // Patch the real fetchJSON to prefer embedded data
  const oldFetchCall = 'const r = await fetch(API + url);';
  const newFetchCall = "const _embed = window.__embed && window.__embed(url); if (_embed) return await _embed; const r = await fetch(API + url);";
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
