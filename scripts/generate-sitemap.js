#!/usr/bin/env node
/**
 * generate-sitemap.js
 * Auto-generates sitemap.xml from the blog directory + known static pages.
 * Run: node scripts/generate-sitemap.js
 * Or hook into git pre-push: add to .git/hooks/pre-push
 */

const fs = require('fs');
const path = require('path');

const SITE_ROOT = path.join(__dirname, '..');
const BLOG_DIR = path.join(SITE_ROOT, 'blog');
const SITEMAP_PATH = path.join(SITE_ROOT, 'sitemap.xml');
const BASE_URL = 'https://aloomii.com';
const TODAY = new Date().toISOString().split('T')[0];
const EXISTING_SITEMAP = fs.existsSync(SITEMAP_PATH)
  ? fs.readFileSync(SITEMAP_PATH, 'utf8')
  : '';

// Static pages — maintain manually only when a new non-blog page is added
const STATIC_PAGES = [
  { loc: '/',                    changefreq: 'weekly',  priority: '1.0' },
  { loc: '/events',              changefreq: 'weekly',  priority: '0.8' },
  { loc: '/blog/',               changefreq: 'weekly',  priority: '0.9' },
  { loc: '/studio',              changefreq: 'monthly', priority: '0.8' },
  { loc: '/builds',              changefreq: 'monthly', priority: '0.8' },
  { loc: '/jenny/',              changefreq: 'monthly', priority: '0.7' },
  { loc: '/services/',            changefreq: 'monthly', priority: '0.8' },
  { loc: '/aloomii-os.html',     changefreq: 'monthly', priority: '0.8' },
  { loc: '/legal/privacy/',      changefreq: 'yearly',  priority: '0.3' },
  { loc: '/terms.html',          changefreq: 'yearly',  priority: '0.3' },
  { loc: '/client-terms.html',   changefreq: 'yearly',  priority: '0.3' },
  { loc: '/agent-adoption',      changefreq: 'monthly', priority: '0.8' },
  { loc: '/table',               changefreq: 'monthly', priority: '0.8' },
  { loc: '/ai-agency-toronto/',  changefreq: 'monthly', priority: '0.8' },
  { loc: '/agent-adoption/workshop/', changefreq: 'monthly', priority: '0.8' },
  { loc: '/agent-adoption/devin/', changefreq: 'monthly', priority: '0.8' },
  { loc: '/partners/databricks/', changefreq: 'monthly', priority: '0.8' },
  { loc: '/databricks/',          changefreq: 'monthly', priority: '0.8' },
  { loc: '/case-studies/caledonia-chamber/', changefreq: 'monthly', priority: '0.7' },
  { loc: '/devin/',               changefreq: 'monthly', priority: '0.8' },
  { loc: '/playbook/',           changefreq: 'monthly', priority: '0.8' },
  { loc: '/events/toronto/',     changefreq: 'monthly', priority: '0.8' },
  { loc: '/events/waterloo/',    changefreq: 'monthly', priority: '0.8' },
  { loc: '/events/new-york/',    changefreq: 'monthly', priority: '0.8' },
  { loc: '/events/boston/',      changefreq: 'monthly', priority: '0.8' },
];

// Blog directories to skip (not real article slugs)
const SKIP_DIRS = new Set(['_astro', 'images']);

function getBlogSlugs() {
  return fs.readdirSync(BLOG_DIR)
    .filter(name => {
      if (SKIP_DIRS.has(name)) return false;
      const full = path.join(BLOG_DIR, name);
      if (!fs.statSync(full).isDirectory()) return false;
      // Must have an index.html to be a real article
      return fs.existsSync(path.join(full, 'index.html'));
    })
    .sort();
}

function urlEntry({ loc, changefreq, priority, lastmod }) {
  return [
    '  <url>',
    `    <loc>${BASE_URL}${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

function existingLastmod(loc) {
  const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = EXISTING_SITEMAP.match(
    new RegExp(`<loc>${BASE_URL}${escaped}</loc>[\\s\\S]*?<lastmod>([^<]+)</lastmod>`)
  );
  return match ? match[1] : TODAY;
}

function existingBlogDate() {
  const match = EXISTING_SITEMAP.match(
    /<!-- Blog Posts \(\d+ articles — auto-generated ([^ )]+)\) -->/
  );
  return match ? match[1] : TODAY;
}

function generate() {
  const slugs = getBlogSlugs();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '',
    '  <!-- Core Pages -->',
    ...STATIC_PAGES.map(p => urlEntry(p)),
    '',
    `  <!-- Blog Posts (${slugs.length} articles — auto-generated ${existingBlogDate()}) -->`,
    ...slugs.map(slug => urlEntry({
      loc: `/blog/${slug}/`,
      changefreq: 'monthly',
      priority: '0.7',
      lastmod: existingLastmod(`/blog/${slug}/`),
    })),
    '',
    '</urlset>',
  ];

  const xml = lines.join('\n');
  fs.writeFileSync(SITEMAP_PATH, xml, 'utf8');
  console.log(`✅ sitemap.xml updated — ${STATIC_PAGES.length} static + ${slugs.length} blog articles`);
}

generate();
