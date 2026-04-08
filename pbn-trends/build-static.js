#!/usr/bin/env node
// PBN Content Dashboard — build-static.js v2.1
// Schema v2: adds trendingTopics, captionTemplates, hashtags, platformTrends, breakoutAngle

const fs = require('fs');
const path = require('path');
const os = require('os');

const VAULT_DIR    = path.join(os.homedir(), 'Documents/PBNVault/Briefs');
const WS_BRIEF_DIR = path.join(os.homedir(), '.openclaw/workspace/content/briefs');
const TRENDS_DIR   = path.join(os.homedir(), '.openclaw/workspace/content/trends');
const DIST_DIR     = path.join(__dirname, 'dist');
const TEMPLATE     = path.join(__dirname, 'index.html');

// ── File loading ───────────────────────────────────────────────────────────────

// Primary: PBNVault (core hook data, simpler format)
const briefs = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.md')).sort().reverse();
if (!briefs.length) { console.error('ERROR: No briefs found in', VAULT_DIR); process.exit(1); }

const latestFile = path.join(VAULT_DIR, briefs[0]);
const week = briefs[0].replace('.md', '');
const raw  = fs.readFileSync(latestFile, 'utf-8');
console.log(`Vault brief: ${briefs[0]}`);

// Secondary: workspace brief (richer data — topics, captions, hashtags)
let wsBriefRaw = '';
if (fs.existsSync(WS_BRIEF_DIR)) {
  const wsExact = path.join(WS_BRIEF_DIR, `pbn-brief-${week}.md`);
  if (fs.existsSync(wsExact)) {
    wsBriefRaw = fs.readFileSync(wsExact, 'utf-8');
    console.log(`Workspace brief: pbn-brief-${week}.md`);
  } else {
    const wsFiles = fs.readdirSync(WS_BRIEF_DIR).filter(f => f.startsWith('pbn-brief-') && f.endsWith('.md')).sort().reverse();
    if (wsFiles.length) {
      wsBriefRaw = fs.readFileSync(path.join(WS_BRIEF_DIR, wsFiles[0]), 'utf-8');
      console.log(`Workspace brief (latest): ${wsFiles[0]}`);
    }
  }
}
if (!wsBriefRaw) console.warn('WARNING: No workspace brief found — topics/captions/hashtags will be empty.');

// Trend scout (platform trends)
let trendRaw = '';
const trendExact = path.join(TRENDS_DIR, `trends-${week}.md`);
if (fs.existsSync(trendExact)) {
  trendRaw = fs.readFileSync(trendExact, 'utf-8');
  console.log(`Trend scout: trends-${week}.md`);
} else if (fs.existsSync(TRENDS_DIR)) {
  const tf = fs.readdirSync(TRENDS_DIR).filter(f => f.endsWith('.md')).sort().reverse();
  if (tf.length) {
    trendRaw = fs.readFileSync(path.join(TRENDS_DIR, tf[0]), 'utf-8');
    console.log(`Trend scout (latest): ${tf[0]}`);
  }
}
if (!trendRaw) console.warn('WARNING: No trend scout file found — platform trends will be empty.');

// ── Sanitizers ─────────────────────────────────────────────────────────────────

function sanitize(str) {
  return str
    .replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')
    .replace(/\u201C|\u201D/g, '"').replace(/\u2018|\u2019/g, "'")
    .replace(/[^\x00-\x7F]/g, c => { const n = c.charCodeAt(0); return (n > 0xA0 && n < 0x2000) ? c : ''; });
}

function stripLinks(str) {
  return str
    .replace(/\[\[?\d+\]?\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function clean(str) { return stripLinks(sanitize(str)); }

function parseNum(digits, context) {
  const n = parseInt(String(digits).replace(/,/g, ''));
  if (/[Mm]/.test(context)) return n * 1_000_000;
  if (/[Kk]/.test(context)) return n * 1_000;
  return n;
}

// ── V1 parser — handles both Vault (simple) and workspace (rich) brief formats ─

function parseV1(content) {
  const s = sanitize(content);

  // Winning hook type — YAML frontmatter or inline bold
  let winningHookType = 'Unknown';
  const yamlM  = s.match(/^winning_hook_type:\s*"([^"]+)"/m);
  const boldM  = s.match(/\*\*Winning Hook Type:\s*([^*\n]+)\*\*/i);
  const typeM  = s.match(/single best-performing hook TYPE[^\n]*:\s*\*?\*?([^\n*\[]+)/i);
  if (yamlM)  winningHookType = yamlM[1].trim();
  else if (boldM) winningHookType = boldM[1].trim();
  else if (typeM) winningHookType = typeM[1].replace(/\*/g,'').trim();

  // Summary — first non-heading paragraph after hook section
  const sumM = s.match(/\*\*Winning Hook Type:[^*]+\*\*\s*\n+([^\n#*]+)/i) ||
               s.match(/Contrast hooks?[^\n]*\n\n([^\n]+)/i);
  const summary = sumM ? sumM[1].trim() : '';

  // Top performing examples
  // Format A (workspace): - "text" (meta, Nk likes, Nk views)
  // Format B (Vault):     1. "text" — meta, N likes, Nk views
  const exSec = s.match(/Top 3 High-Performing Opening Lines?\n([\s\S]*?)(?=\n## |$)/i) ||
                s.match(/3 real examples[^\n]*\n([\s\S]*?)(?=\n## |\n\*\*3\.|$)/i);
  const topPerformingExamples = [];
  if (exSec) {
    exSec[1].split('\n').forEach(line => {
      const cl = stripLinks(line);
      // Numbered: 1. "text" — meta
      let m = cl.match(/^\s*\d+\.\s+"([^"]+)"\s*[—-]+\s*(.+)/);
      // Bulleted: - "text" (meta)
      if (!m) m = cl.match(/^\s*-\s+"([^"]+)"\s*\(([^)]+)\)/) && [null, ...cl.match(/^\s*-\s+"([^"]+)"\s*\(([^)]+)\)/).slice(1)];
      if (!m || !m[1]) return;
      const text = m[1].trim();
      const meta = (m[2] || '').trim();
      // Parse likes/views — handles "3K+ likes", "200K+ views", "fewer than 30"
      const lm = meta.match(/([\d,.]+)[Kk]?\+?\s*likes/i);
      const vm = meta.match(/([\d,.]+)[KMkm+]+\s*views/i);
      topPerformingExamples.push({
        text,
        likes:  lm ? parseNum(lm[1].replace(/,/g,''), lm[0]) : 0,
        views:  vm ? parseNum(vm[1].replace(/,/g,''), vm[0]) : 0,
        source: meta
      });
    });
  }

  const winningHooks = topPerformingExamples.map((e, i) => ({
    text: e.text, metric: e.source, score: topPerformingExamples.length - i
  }));

  // Failing hooks — bullet list under "What is NOT Working"
  const failSec = s.match(/What(?:'s| is) NOT [Ww]orking[^\n]*\n([\s\S]*?)(?=\n## |$)/i);
  const failingHooks = [];
  if (failSec) {
    failSec[1].split('\n').filter(l => /^\s*-/.test(l)).slice(0, 6).forEach(b => {
      const t = clean(b).replace(/^-\s*/, '').trim().substring(0, 140);
      if (t) {
        // Try to pull an engagement qualifier from the text
        const engM = t.match(/(fewer than \d+|<\d+|\d+)\s*likes?/i);
        failingHooks.push({ text: t, reason: engM ? `~${engM[0]} this week` : 'Low engagement this week' });
      }
    });
  }

  return { winningHookType, summary, winningHooks, topPerformingExamples, failingHooks: failingHooks.slice(0, 6) };
}

// ── New v2 parsers ─────────────────────────────────────────────────────────────

// Priority 1 — Trending Topics
function parseTrendingTopics(content) {
  const s   = clean(content);
  const sec = s.match(/##[^\n]*Trending Topics[^\n]*\n([\s\S]*?)(?=\n## |$)/i);
  if (!sec) return [];

  const topics = [];
  sec[1].split(/(?=\n\d+\. \*\*)/).forEach(chunk => {
    const tM = chunk.match(/\d+\.\s*\*\*([^*]+)\*\*/);
    if (!tM) return;

    const topic   = tM[1].trim();
    const whyM    = chunk.match(/\*\*Why it'?s hot\*\*:?\s*([^\n]+)/i);
    const hookM   = chunk.match(/\*\*Clip hook\*\*:?\s*"([^"]+)"/i);
    const whyHot  = whyM  ? whyM[1].replace(/\[\[\d+\]\]/g, '').trim() : '';
    const clipHook= hookM ? hookM[1].trim() : '';

    // Engagement extraction from whyHot
    const lm = whyHot.match(/(\d+)k\s+likes/i);
    const vm = whyHot.match(/(\d+(?:\.\d+)?)(M|K)?\+?\s*views/i);
    const likes = lm ? parseInt(lm[1]) * 1000 : 0;
    let views = 0;
    if (vm) {
      const n = parseFloat(vm[1]);
      views = vm[2] === 'M' ? Math.round(n * 1e6) : vm[2] === 'K' ? Math.round(n * 1e3) : Math.round(n);
    }

    // Heat tier
    const heat = (likes >= 15000 || views >= 5_000_000) ? 'hot' :
                 (likes >= 5000  || views >= 1_000_000) ? 'warm' : 'rising';

    topics.push({ topic, whyHot, clipHook, heat, likes, views });
  });

  return topics.slice(0, 5);
}

// Priority 3 — Caption Templates
function parseCaptionTemplates(content) {
  const s   = sanitize(content);
  const sec = s.match(/##[^\n]*(?:Caption Templates|Ready-to-Use)[^\n]*\n([\s\S]*?)(?=\n## |$)/i);
  if (!sec) return [];

  const templates = [];
  sec[1].split('\n').filter(l => /^\d+\./.test(l.trim())).forEach(line => {
    const m = line.match(/^\d+\.\s+"([^"]+)"/);
    if (!m) return;
    let text = m[1].trim();
    const ccM = text.match(/\((\d+)\s*chars?\)$/i);
    const charCount = ccM ? parseInt(ccM[1]) : text.replace(/\s*\(\d+\s*chars?\)$/i,'').trim().length;
    text = text.replace(/\s*\(\d+\s*chars?\)$/i,'').trim();
    if (text.length > 10) templates.push({ text, charCount });
  });

  return templates;
}

// Priority 3 — Hashtags
function parseHashtags(content) {
  const s = sanitize(content);

  // Avoid tags: from oversaturated paragraph
  const avoidM = s.match(/(?:oversaturated|Broad[^.]*hashtags?)[^.]*?\*\*([^.]+)\*\*/i);
  const avoidTags = [];
  if (avoidM) {
    (avoidM[1].match(/#\w+/g) || []).forEach(t => avoidTags.push({ tag: t, reason: 'Oversaturated' }));
  }

  // Recommended: from ranked list
  const rankedM = s.match(/Top \d+[^\n]*Hashtags?\s*Ranked[^\n]*\n([\s\S]*?)(?=\n## |\n\*\*Pro Tip|$)/i);
  const recommended = [];
  if (rankedM) {
    rankedM[1].split('\n').filter(l => /^\d+\./.test(l.trim())).slice(0, 8).forEach(line => {
      const m = line.match(/\*\*(#\w+)\*\*\s*[-–]\s*([^[.\n]+)/);
      if (m) recommended.push({ tag: m[1], reason: m[2].replace(/\[\d+\]/g,'').trim() });
    });
  }

  return { recommended, avoid: avoidTags.slice(0, 7) };
}

// Priority 4 — Platform Trends (from trend scout)
function parsePlatformTrends(content) {
  if (!content) return { platforms: [], breakoutAngle: null };
  const s = clean(content);
  const platforms = [];
  let breakoutAngle = null;

  // X — B2B/Aloomii section: top bullet
  const xSec = s.match(/##[^\n]*(?:Aloomii|B2B)[^\n]*Trends[^\n]*\n([\s\S]*?)(?=\n## |$)/i);
  if (xSec) {
    const bullet = xSec[1].split('\n').find(l => l.trim().startsWith('-'));
    if (bullet) {
      const text  = bullet.replace(/^-\s*\*\*\[[^\]]*\]\*\*:?\s*/,'').replace(/\*\*/g,'').trim();
      const engM  = text.match(/(\d+[KMk]?\s+(?:likes?|RTs?|posts?))/i);
      platforms.push({ platform: 'X', trend: text.substring(0, 110), proof: engM ? engM[0] : '', thumbnailTip: null });
    }
  }

  // YouTube — AI/SaaS/Startup Founder section
  const ytSec = s.match(/###[^\n]*(?:AI Tools|SaaS|Startup Founder)[^\n]*\n([\s\S]*?)(?=\n### |$)/i);
  if (ytSec) {
    const yt = ytSec[1];

    // Top title format + proof
    const titleBlockM = yt.match(/Top \d+ Video Title[^\n]*\n([\s\S]*?)(?=\n####|$)/i);
    if (titleBlockM) {
      const firstM = titleBlockM[1].match(/1\.\s+\*\*"([^"]+)"\*\*/);
      if (firstM) {
        const proofM = titleBlockM[1].match(/(\d+[MK]?\s*views)/i);
        const ytEntry = { platform: 'YouTube', trend: firstM[1], proof: proofM ? proofM[0] : '', thumbnailTip: null };

        // Best thumbnail
        const thumbBlockM = yt.match(/Thumbnail Styles[^\n]*\n([\s\S]*?)(?=\n####|$)/i);
        if (thumbBlockM) {
          const tbM = thumbBlockM[1].match(/\*\*([^:*]+):\*\*([^\n]+)/);
          if (tbM) {
            const ctrM = tbM[2].match(/(\d+%\s*CTR)/i);
            ytEntry.thumbnailTip = tbM[1].trim() + (ctrM ? ` (${ctrM[1]})` : '');
          }
        }
        platforms.push(ytEntry);
      }
    }

    // Breakout angle
    const boM = yt.match(/Underutilized Angle[^\n]*\n\*\*"([^"]+)"\*\*:?\s*([^\n]{10,})/i);
    if (boM) {
      const proofM = boM[2].match(/(\d+(?:\.\d+)?[MK]?\s*views\s+in\s+\d+\s+days?)/i);
      breakoutAngle = {
        format: boM[1],
        proof:  proofM ? proofM[0] : boM[2].substring(0, 80)
      };
    }

    // Shorts / trending sound
    const soundM = yt.match(/Trending Sounds[^\n]*\n[\s\S]*?\*\*"([^"]+)"[^:]*:\*\*([^\n]+)/i);
    if (soundM) {
      const ytProofM = soundM[2].match(/(\d+[MK]?[+]?\s*YT Shorts[^.]*\d+[MK]?\s*views)/i);
      platforms.push({
        platform: 'Shorts',
        trend: `Sound trending: ${soundM[1].substring(0, 60)}`,
        proof: ytProofM ? ytProofM[0] : '',
        thumbnailTip: null
      });
    }
  }

  return { platforms, breakoutAngle };
}

// ── Main build ─────────────────────────────────────────────────────────────────

// Use workspace brief for rich sections if available, else fall back to vault brief
function build(vaultContent, wsContent, trendContent) {
  const richSrc = wsContent || vaultContent;
  const v1              = parseV1(vaultContent);
  const trendingTopics  = parseTrendingTopics(richSrc);
  const captionTemplates= parseCaptionTemplates(richSrc);
  const hashtags        = parseHashtags(richSrc);
  const { platforms: platformTrends, breakoutAngle } = parsePlatformTrends(trendContent);

  return {
    schemaVersion: 2,
    week,
    generatedAt: new Date().toISOString(),
    winningHookType:      v1.winningHookType,
    summary:              v1.summary,
    winningHooks:         v1.winningHooks,
    topPerformingExamples:v1.topPerformingExamples,
    failingHooks:         v1.failingHooks,
    trendingTopics,
    captionTemplates,
    hashtags,
    platformTrends,
    breakoutAngle,
    archive: []
  };
}

const data = build(raw, wsBriefRaw, trendRaw);

console.log(`Week:            ${data.week}`);
console.log(`Hook type:       ${data.winningHookType}`);
console.log(`Top examples:    ${data.topPerformingExamples.length}`);
console.log(`Failing hooks:   ${data.failingHooks.length}`);
console.log(`Trending topics: ${data.trendingTopics.length}`);
console.log(`Captions:        ${data.captionTemplates.length}`);
console.log(`Hashtags rec/avoid: ${data.hashtags.recommended.length} / ${data.hashtags.avoid.length}`);
console.log(`Platform trends: ${data.platformTrends.length}`);
console.log(`Breakout angle:  ${data.breakoutAngle ? data.breakoutAngle.format : 'none'}`);

if (!data.topPerformingExamples.length) {
  console.warn('WARNING: No examples parsed — check brief format.');
}

const template = fs.readFileSync(TEMPLATE, 'utf-8');
const jsonData  = JSON.stringify(data);

if (jsonData.includes('</script>')) {
  console.error('ERROR: Unsafe </script> in data. Aborting.');
  process.exit(1);
}

const output = template.replace('// __PBN_DATA_INJECT__', `window.__PBN_TRENDS_DATA__ = ${jsonData};`);

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), output, 'utf-8');

console.log(`Built: dist/index.html (${output.length.toLocaleString()} bytes)`);
console.log('SUCCESS');
