const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: 'postgresql://superhana@localhost:5432/aloomii' });

app.use(express.static(path.join(__dirname, 'static')));

let snipeCache = { alerts: [] };
let snipeLastFetch = 0;
const SNIPE_TTL = 8 * 60 * 60 * 1000;

function getSnipeAlerts() {
  const now = Date.now();
  if (now - snipeLastFetch > SNIPE_TTL) {
    try {
      snipeCache = JSON.parse(fs.readFileSync(path.join(__dirname, '../../memory/ticket-snipe-alerts.json')));
      snipeLastFetch = now;
    } catch(e) {}
  }
  return snipeCache;
}

function getBlogDrafts() {
  const draftsDir = path.join(__dirname, '../../content/blog/drafts');
  const backlogPath = path.join(__dirname, '../../content/blog/backlog.md');
  let drafts = [];
  let backlog = [];
  try {
    const files = fs.readdirSync(draftsDir);
    drafts = files.filter(f => f.endsWith('.md')).map(f => {
      const content = fs.readFileSync(path.join(draftsDir, f), 'utf8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      const words = content.split(/\s+/).length;
      return { file: f, title: titleMatch ? titleMatch[1] : f.replace('.md','').replace(/-/g,' '), words };
    });
  } catch(e) {}
  try {
    const raw = fs.readFileSync(backlogPath, 'utf8');
    const lines = raw.split('\n');
    lines.forEach(l => {
      const m = l.match(/^\d+\.\s+\*\*(.+?)\*\*/);
      if (m) {
        const status = l.includes('🟡') ? '🟡 In Progress' : l.includes('🟢') ? '🟢 Published' : '⚪ Backlog';
        backlog.push({ title: m[1], status });
      }
    });
  } catch(e) {}
  return { drafts, backlog };
}

function getLatestTrends() {
  const trendsDir = path.join(__dirname, '../../content/trends');
  let vibrnt = [];
  let aloomii = [];
  try {
    const files = fs.readdirSync(trendsDir).filter(f => f.endsWith('.md')).sort().reverse();
    if (files.length > 0) {
      const content = fs.readFileSync(path.join(trendsDir, files[0]), 'utf8');
      
      const vibrntSection = content.match(/## 👗 VIBRNT AI[\s\S]*?(?=\n## |$)/);
      if (vibrntSection) {
        const matches = [...vibrntSection[0].matchAll(/-\s+\*\*(.*?)\*\*([\s\S]*?)(?=\n- |\n### |\n## |$)/g)];
        vibrnt = matches.slice(0, 10).map(m => ({ title: m[1], desc: m[2].replace(/^:?\s*/, '').trim().substring(0, 80) + '...' }));
      }
      
      const aloomiiSection = content.match(/## 🤖 Aloomii[\s\S]*?(?=\n## |$)/);
      if (aloomiiSection) {
        const matches = [...aloomiiSection[0].matchAll(/-\s+\*\*(.*?)\*\*([\s\S]*?)(?=\n- |\n### |\n## |$)/g)];
        aloomii = matches.slice(0, 10).map(m => ({ title: m[1], desc: m[2].replace(/^:?\s*/, '').trim().substring(0, 80) + '...' }));
      }
    }
  } catch(e) { console.error('Trend parse error', e); }
  return { vibrnt, aloomii };
}

const renderTags = (tagsObj) => {
  let tags = [];
  try {
    if (Array.isArray(tagsObj)) {
      if (tagsObj.length === 1 && typeof tagsObj[0] === 'string' && tagsObj[0].startsWith('[')) {
        tags = JSON.parse(tagsObj[0]);
      } else {
        tags = tagsObj;
      }
    } else if (typeof tagsObj === 'string') {
      tags = JSON.parse(tagsObj);
    }
  } catch(e) {}
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return '<div style="margin-top:4px;">' + tags.map(t => '<span style="background:#444; color:#ccc; padding:2px 5px; border-radius:4px; font-size:0.7em; margin-right:4px;">#' + t.replace(/"/g, '') + '</span>').join('') + '</div>';
};

app.get('/', async (req, res) => {
  const mode = req.query.mode || 'dark';
  const isDark = mode === 'dark';

  let dashboard = { health: { fleet: 'Unknown' }, security: { ports: 'Unknown' }, privacy: { pii: 100 } };
  let opsMetrics = { cron_fleet: { jobs: [], health_pct: 0, healthy: 0, total: 0 } };
  try { dashboard = JSON.parse(fs.readFileSync(path.join(__dirname, 'internal-dashboard.json'))); } catch(e) {}
  try { opsMetrics = JSON.parse(fs.readFileSync(path.join(__dirname, '../../output/ops_metrics.json'))); } catch(e) {}

  const snipeAlerts = getSnipeAlerts();
  const { drafts, backlog } = getBlogDrafts();
  const latestTrends = getLatestTrends();
  const nextRefresh = new Date(snipeLastFetch + SNIPE_TTL).toLocaleString('en-CA', { timeZone: 'America/Toronto', hour12: false });

  const [signalsCount, upcomingEvents, reconnectContacts, warmContacts, pbnClips, activityFeeds, recentSignals, pillarPerf7d, snipeQueue, learnLoopRecs, pillarHealth8w] = await Promise.all([
    pool.query("SELECT COUNT(*) FROM signals WHERE score >= 4 AND planning IN ('active', NULL)"),
    pool.query('SELECT name, date, city, notes FROM events WHERE date >= CURRENT_DATE ORDER BY date ASC LIMIT 8'),
    pool.query("SELECT name, role, tier, last_signal, tags FROM contacts WHERE tier IN (1,2) AND (last_signal < NOW() - INTERVAL '14 days' OR last_signal IS NULL) ORDER BY tier ASC, last_signal ASC NULLS LAST LIMIT 8"),
    pool.query("SELECT name, role, lead_status, tier, mutual_connection, tags FROM contacts WHERE lead_status = 'hot' ORDER BY tier ASC LIMIT 10"),
    pool.query("SELECT clip_id, episode_id, guest_name, proposed_caption, predicted_score, youtube_url FROM pbn_clips WHERE predicted_score >= 3.5 ORDER BY predicted_score DESC LIMIT 6"),
    pool.query("SELECT time, type, source, score, COALESCE(payload->>'context', payload->>'note', payload->>'notes', payload->>'signal_text', substring(payload::text from 1 for 150)) as details, payload->>'source_url' as url FROM activity_log ORDER BY time DESC LIMIT 20"),
    pool.query("SELECT title, score, source_bu, created_at, SUBSTRING(body FROM 1 FOR 120) as snippet FROM signals WHERE planning IN ('active', NULL) ORDER BY created_at DESC LIMIT 15"),
    pool.query("SELECT pillar, pillar_name, post_origin, posts, avg_impressions, avg_likes, avg_comments, total_impressions FROM v_pillar_performance_7d").catch(() => ({ rows: [] })),
    pool.query("SELECT id, topic, platform, status, published_at, impressions, likes FROM content_posts WHERE post_origin = 'snipe' ORDER BY published_at DESC LIMIT 8").catch(() => ({ rows: [] })),
    pool.query("SELECT category, subcategory, proposed_value, impact, status, created_at FROM learn_loop_recommendations WHERE status = 'pending' ORDER BY CASE impact WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 8").catch(() => ({ rows: [] })),
    pool.query("SELECT pillar, pillar_name, week, posts, avg_impressions, avg_likes FROM v_pillar_health_8w ORDER BY pillar, week").catch(() => ({ rows: [] })),
  ]);

  const formatTime = (ts) => ts ? new Date(ts).toLocaleString('en-US', { timeZone: 'America/Toronto', hour12: false }) : '—';
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' }) : '—';

  const bg = isDark ? '#1a1a1a' : '#f0f0f0';
  const fg = isDark ? '#fff' : '#333';
  const tableBg = isDark ? '#2a2a2a' : '#fff';
  const border = isDark ? '#444' : '#ddd';
  const cardBg = isDark ? '#222' : '#fff';
  const accent = '#3b82f6';

  const css = `
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: ${bg}; color: ${fg}; padding: 20px; margin: 0; }
    h1 { color: ${accent}; margin-bottom: 4px; }
    h2 { color: ${accent}; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid ${border}; padding-bottom: 6px; }
    .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 28px; }
    .card { background: ${cardBg}; border: 1px solid ${border}; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; }
    .span-2 { grid-column: span 2; }
    .span-3 { grid-column: span 3; }
    .card h3 { margin: 0 0 10px 0; color: ${accent}; font-size: 1em; }
    table { border-collapse: collapse; width: 100%; background: ${tableBg}; flex-grow: 1; }
    th, td { border: 1px solid ${border}; padding: 7px 9px; text-align: left; font-size: 0.88em; vertical-align: top; }
    th { background: ${accent}; color: #fff; }
    .ok { color: #4ade80; } .error { color: #f87171; } .disabled { color: #9ca3af; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 0.78em; font-weight: bold; margin-bottom: 4px;}
    .badge-hot { background: #f87171; color: #fff; }
    .badge-t1 { background: ${accent}; color: #fff; }
    .badge-t2 { background: #9ca3af; color: #fff; }
    a { color: ${accent}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .meta { font-size: 0.78em; color: #9ca3af; }
    .section-full { margin-bottom: 28px; }
    .cache-note { font-size: 0.75em; color: #9ca3af; margin-top: 8px; }
  `;

  const mtgAlerts = snipeAlerts.alerts.filter(a => /mtg|lotus/i.test(a.target));
  const btsAlerts = snipeAlerts.alerts.filter(a => /bts/i.test(a.target));
  const wcAlerts = snipeAlerts.alerts.filter(a => /world cup/i.test(a.target));

  const buildRows = (alerts) => {
    return alerts.length > 0
      ? alerts.map(a => a.findings.map(f => '<tr><td>' + f.item + '</td><td style="white-space:nowrap">' + f.ask_price + '</td><td class="meta">' + (f.notes || '—') + '</td></tr>').join('')).join('')
      : '<tr><td colspan="3" class="meta">No alerts found.</td></tr>';
  };

  const mtgRows = buildRows(mtgAlerts);
  const btsRows = buildRows(btsAlerts);
  const wcRows = buildRows(wcAlerts);

  const fleetRows = opsMetrics.cron_fleet.jobs.map(job => {
    const cls = job.status === 'ok' ? 'ok' : job.status === 'error' ? 'error' : 'disabled';
    return '<tr><td>' + job.icon + ' ' + job.display_name + '</td><td class="' + cls + '"><b>' + job.status.toUpperCase() + '</b></td><td>' + job.last_run + '</td><td>' + job.next_run + '</td><td class="meta">' + job.schedule + '</td><td class="meta">' + job.model + '</td></tr>';
  }).join('');

  const pbnRows = pbnClips.rows.map(c => {
    const context = c.guest_name || c.episode_id || 'Clip';
    const hook = c.proposed_caption ? c.proposed_caption.substring(0,85) + '…' : '—';
    return '<tr><td><b>' + c.predicted_score + '</b></td><td>' + context + '</td><td class="meta">' + hook + '</td><td><a href="' + c.youtube_url + '" target="_blank">▶</a></td></tr>';
  }).join('');

  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Aloomii C&C</title>
  <meta http-equiv="refresh" content="30">
  <style>${css}</style>
</head>
<body>
<h1>🛡️ Aloomii Command & Control</h1>
<p style="margin:0 0 6px 0">Powered by <b style="color:${accent}">Aloomii AI Workforce</b> &nbsp;·&nbsp; <a href="?mode=${isDark ? 'light' : 'dark'}">Toggle ${isDark ? 'Light' : 'Dark'} Mode</a></p>

<h2>System Status</h2>
<table style="max-width:600px">
  <tr><th>Metric</th><th>Value</th></tr>
  <tr><td>Hot Signals (4+)</td><td>${signalsCount.rows[0].count}</td></tr>
  <tr><td>Fleet Health</td><td>${opsMetrics.cron_fleet.health_pct}% &nbsp;(${opsMetrics.cron_fleet.healthy}/${opsMetrics.cron_fleet.total} healthy)</td></tr>
  <tr><td>Security</td><td>${dashboard.security.ports}</td></tr>
  <tr><td>Privacy</td><td>${dashboard.privacy.pii}% Anon</td></tr>
</table>

<h2>📋 Daily Briefing</h2>
<div class="grid">

  <!-- ROW 1: Events | Reconnect | Hot Leads (span 2 each = 6 cols) -->
  <div class="card span-2">
    <h3>📅 Events Coming Up</h3>
    <table>
      <tr><th>Date</th><th>Event</th><th>Location</th></tr>
      ${upcomingEvents.rows.map(e => '<tr><td style="white-space:nowrap"><b>' + formatDate(e.date) + '</b></td><td>' + e.name + '</td><td class="meta">' + (e.city || '—') + '</td></tr>').join('') || '<tr><td colspan="3">No events.</td></tr>'}
    </table>
  </div>

  <div class="card span-2">
    <h3>🔄 Reconnect With</h3>
    <table>
      <tr><th>Name/Tags</th><th>Role</th><th>Last Touch</th></tr>
      ${reconnectContacts.rows.map(c => '<tr><td><span class="badge badge-t' + c.tier + '">T' + c.tier + '</span> <b>' + c.name + '</b>' + renderTags(c.tags) + '</td><td class="meta">' + (c.role || '—') + '</td><td class="meta">' + (c.last_signal ? formatDate(c.last_signal) : '<span style="color:#f87171">Never</span>') + '</td></tr>').join('') || '<tr><td colspan="3">All caught up.</td></tr>'}
    </table>
  </div>

  <div class="card span-2">
    <h3>🔥 Talk To Now (Hot)</h3>
    <table>
      <tr><th>Name/Tags</th><th>Role</th><th>Via</th></tr>
      ${warmContacts.rows.map(c => '<tr><td><span class="badge badge-hot">HOT</span> <b>' + c.name + '</b>' + renderTags(c.tags) + '</td><td class="meta">' + (c.role || '—') + '</td><td class="meta">' + (c.mutual_connection || '—') + '</td></tr>').join('') || '<tr><td colspan="3">No hot contacts.</td></tr>'}
    </table>
  </div>

  <!-- ROW 2: Aloomii Trends | VIBRNT Trends (span 3 each = 6 cols) -->
  <div class="card span-3">
    <h3>🤖 Aloomii Trends (Last 24h)</h3>
    <table>
      <tr><th>Trend</th><th>Insight</th></tr>
      ${latestTrends.aloomii.map(s => '<tr><td><b>' + s.title + '</b></td><td class="meta">' + s.desc + '</td></tr>').join('') || '<tr><td colspan="2" class="meta">No Aloomii trend signals yet.</td></tr>'}
    </table>
  </div>

  <div class="card span-3">
    <h3>💜 VIBRNT AI Trends (Last 24h)</h3>
    <table>
      <tr><th>Trend</th><th>Insight</th></tr>
      ${latestTrends.vibrnt.map(s => '<tr><td><b>' + s.title + '</b></td><td class="meta">' + s.desc + '</td></tr>').join('') || '<tr><td colspan="2" class="meta">No VIBRNT trend signals yet.</td></tr>'}
    </table>
  </div>

  <!-- ROW 3: MTG | BTS | World Cup (span 2 each = 6 cols) -->
  <div class="card span-2">
    <h3>🃏 MTG Watch</h3>
    <table>
      <tr><th>Listing</th><th>Price</th><th>Notes</th></tr>
      ${mtgRows}
    </table>
    <p class="cache-note">Next refresh: ${nextRefresh}</p>
  </div>

  <div class="card span-2">
    <h3>🎫 BTS Tickets</h3>
    <table>
      <tr><th>Listing</th><th>Price</th><th>Notes</th></tr>
      ${btsRows}
    </table>
    <p class="cache-note">Next refresh: ${nextRefresh}</p>
  </div>

  <div class="card span-2">
    <h3>⚽ World Cup 2026</h3>
    <table>
      <tr><th>Listing</th><th>Price</th><th>Notes</th></tr>
      ${wcRows}
    </table>
    <p class="cache-note">Next refresh: ${nextRefresh}</p>
  </div>

  <!-- ROW 4: Blog | PBN Clips (span 3 each = 6 cols) -->
  <div class="card span-3">
    <h3>✍️ Aloomii Blog Drafts</h3>
    <table>
      <tr><th>Status</th><th>Title</th><th>Words</th></tr>
      ${drafts.map(d => '<tr><td><span style="color:#4ade80">🟡 Draft</span></td><td>' + d.title + '</td><td class="meta">' + d.words.toLocaleString() + ' words</td></tr>').join('')}
      ${backlog.filter(b => !b.status.includes('Published')).map(b => '<tr><td class="meta">' + b.status + '</td><td>' + b.title + '</td><td class="meta">—</td></tr>').join('')}
      ${(drafts.length + backlog.length) === 0 ? '<tr><td colspan="3">No blog drafts found.</td></tr>' : ''}
    </table>
  </div>

  <div class="card span-3">
    <h3>🎬 PBN Clips Ready to Ship</h3>
    <table>
      <tr><th>Score</th><th>Context</th><th>Caption / Hook</th><th>Link</th></tr>
      ${pbnRows || '<tr><td colspan="4" class="meta">No clips ready.</td></tr>'}
    </table>
  </div>

</div>

<div class="section-full">
  <h2>📝 Content Operations</h2>
  <div class="grid">

    <div class="card span-3">
      <h3>📊 Pillar Performance — Last 7 Days</h3>
      <table>
        <tr><th>#</th><th>Pillar</th><th>Posts</th><th>Avg Impressions</th><th>Avg Likes</th><th>Avg Comments</th></tr>
        ${pillarPerf7d.rows.length > 0
          ? pillarPerf7d.rows.map(r => '<tr><td><b>' + r.pillar + '</b></td><td>' + (r.pillar_name || '—') + '</td><td>' + (r.posts || 0) + '</td><td>' + (r.avg_impressions || '—') + '</td><td>' + (r.avg_likes || '—') + '</td><td>' + (r.avg_comments || '—') + '</td></tr>').join('')
          : '<tr><td colspan="6" class="meta">No pillar data yet — posts need engagement metrics (72h after publish).</td></tr>'}
      </table>
    </div>

    <div class="card span-3">
      <h3>🎯 Snipe Queue</h3>
      <table>
        <tr><th>Status</th><th>Topic</th><th>Platform</th><th>Published</th><th>Likes</th><th>Impressions</th></tr>
        ${snipeQueue.rows.length > 0
          ? snipeQueue.rows.map(s => '<tr><td><span style="color:' + (s.status==='published'?'#4ade80':s.status==='approved'?'#facc15':'#9ca3af') + '">' + s.status.toUpperCase() + '</span></td><td class="meta">' + (s.topic || '—').slice(0,60) + '</td><td>' + (s.platform || '—') + '</td><td class="meta">' + (s.published_at ? formatDate(s.published_at) : '—') + '</td><td>' + (s.likes || '—') + '</td><td>' + (s.impressions || '—') + '</td></tr>').join('')
          : '<tr><td colspan="6" class="meta">No snipes yet. Snipe monitor runs every 2 hours 6AM-10PM.</td></tr>'}
      </table>
    </div>

    <div class="card span-3">
      <h3>🔁 Learn Loop — Pending Recommendations</h3>
      <table>
        <tr><th>Impact</th><th>Category</th><th>What to Change</th><th>Date</th></tr>
        ${learnLoopRecs.rows.length > 0
          ? learnLoopRecs.rows.map(r => '<tr><td><span style="color:' + (r.impact==='high'?'#f87171':r.impact==='medium'?'#facc15':'#9ca3af') + '"><b>' + r.impact.toUpperCase() + '</b></span></td><td class="meta">' + r.category + (r.subcategory ? ' / ' + r.subcategory : '') + '</td><td class="meta">' + (r.proposed_value || '—').slice(0,80) + '</td><td class="meta">' + formatDate(r.created_at) + '</td></tr>').join('')
          : '<tr><td colspan="4" class="meta">No pending recommendations.</td></tr>'}
      </table>
    </div>

    <div class="card span-3">
      <h3>📈 Pillar Health — 8-Week Trend</h3>
      <table>
        <tr><th>Pillar</th><th>Week</th><th>Posts</th><th>Avg Impressions</th><th>Avg Likes</th></tr>
        ${(() => {
          if (pillarHealth8w.rows.length === 0) return '<tr><td colspan="5" class="meta">No 8-week data yet. Accumulates as posts are published and engagement is scraped.</td></tr>';
          // Compute overall avg impressions for kill rule flagging
          const totalImp = pillarHealth8w.rows.reduce((s,r) => s + (parseFloat(r.avg_impressions)||0), 0);
          const overallAvg = pillarHealth8w.rows.length > 0 ? totalImp / pillarHealth8w.rows.length : 0;
          return pillarHealth8w.rows.map(r => {
            const imp = parseFloat(r.avg_impressions) || 0;
            const isLow = overallAvg > 0 && imp < overallAvg * 0.5;
            const rowStyle = isLow ? ' style="background:#3f1a1a"' : '';
            const killFlag = isLow ? ' ⚠️' : '';
            return '<tr' + rowStyle + '><td><b>' + r.pillar + '</b> ' + (r.pillar_name || '') + killFlag + '</td><td class="meta">' + (r.week ? new Date(r.week).toLocaleDateString('en-CA') : '—') + '</td><td>' + (r.posts||0) + '</td><td>' + (imp||'—') + '</td><td>' + (r.avg_likes||'—') + '</td></tr>';
          }).join('');
        })()}
      </table>
    </div>

  </div>
</div>

<div class="section-full">
  <h2>🚀 Cron Fleet Status</h2>
  <table>
    <tr><th>Agent</th><th>Status</th><th>Last Run</th><th>Next Run</th><th>Schedule</th><th>Model</th></tr>
    ${fleetRows || '<tr><td colspan="6">No fleet data.</td></tr>'}
  </table>
</div>

<div class="section-full">
  <h2>🔥 Activity Feeds</h2>
  <table>
    <tr><th>Time</th><th>Type</th><th>Score</th><th>Details</th></tr>
    ${activityFeeds.rows.map(f => '<tr><td style="white-space:nowrap"><small>' + formatTime(f.time) + '</small></td><td>' + f.type + '</td><td><b>' + (f.score || '—') + '</b></td><td>' + (f.details || '—') + (f.url ? ' <a href="' + f.url + '" target="_blank">[→]</a>' : '') + '</td></tr>').join('')}
  </table>
</div>

<div class="section-full">
  <h2>📡 Recent Signals</h2>
  <table>
    <tr><th>Time</th><th>Source</th><th>Score</th><th>Title</th><th>Snippet</th></tr>
    ${recentSignals.rows.map(s => '<tr><td style="white-space:nowrap"><small>' + formatTime(s.created_at) + '</small></td><td>' + s.source_bu + '</td><td><b>' + s.score + '</b></td><td>' + s.title + '</td><td class="meta">' + (s.snippet ? s.snippet + '…' : '') + '</td></tr>').join('') || '<tr><td colspan="5">No signals found.</td></tr>'}
  </table>
</div>

</body>
</html>`);
});

app.listen(3002, () => console.log('Aloomii C&C: http://localhost:3002'));
