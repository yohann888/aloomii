const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: 'postgresql://superhana@localhost:5432/aloomii' });

app.use(express.static(path.join(__dirname, 'static')));

// ─── Ticket Watch: cached, refreshes 3x/day (every 8h) ───
let snipeCache = { alerts: [] };
let snipeLastFetch = 0;
const SNIPE_TTL = 8 * 60 * 60 * 1000; // 8 hours in ms

function getSnipeAlerts() {
  const now = Date.now();
  if (now - snipeLastFetch > SNIPE_TTL) {
    try {
      snipeCache = JSON.parse(fs.readFileSync(path.join(__dirname, '../../memory/ticket-snipe-alerts.json')));
      snipeLastFetch = now;
      console.log('[Ticket Watch] Cache refreshed at', new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' }));
    } catch(e) { console.error('[Ticket Watch] Failed to load:', e.message); }
  }
  return snipeCache;
}

// Blog: read drafts from filesystem
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

app.get('/', async (req, res) => {
  const mode = req.query.mode || 'dark';
  const isDark = mode === 'dark';

  let dashboard = { health: { fleet: 'Unknown' }, security: { ports: 'Unknown' }, privacy: { pii: 100 } };
  let opsMetrics = { cron_fleet: { jobs: [], health_pct: 0, healthy: 0, total: 0 } };
  try { dashboard = JSON.parse(fs.readFileSync(path.join(__dirname, 'internal-dashboard.json'))); } catch(e) {}
  try { opsMetrics = JSON.parse(fs.readFileSync(path.join(__dirname, '../../output/ops_metrics.json'))); } catch(e) {}

  const snipeAlerts = getSnipeAlerts();
  const { drafts, backlog } = getBlogDrafts();
  const nextRefresh = new Date(snipeLastFetch + SNIPE_TTL).toLocaleString('en-CA', { timeZone: 'America/Toronto', hour12: false });

  const [signalsCount, upcomingEvents, reconnectContacts, warmContacts, vibrntTrends, aloomiiTrends, pbnClips, activityFeeds, recentSignals] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM signals WHERE score >= 4'),
    pool.query('SELECT name, date, city, notes FROM events WHERE date >= CURRENT_DATE ORDER BY date ASC LIMIT 8'),
    pool.query("SELECT name, role, tier, last_signal FROM contacts WHERE tier IN (1,2) AND (last_signal < NOW() - INTERVAL '14 days' OR last_signal IS NULL) ORDER BY tier ASC, last_signal ASC NULLS LAST LIMIT 8"),
    pool.query("SELECT name, role, lead_status, tier, mutual_connection FROM contacts WHERE lead_status = 'hot' ORDER BY tier ASC LIMIT 10"),
    pool.query("SELECT title, score, created_at FROM signals WHERE title ILIKE '%fashion%' OR title ILIKE '%tiktok%' OR title ILIKE '%vibrnt%' OR title ILIKE '%clothing%' ORDER BY created_at DESC LIMIT 5"),
    pool.query("SELECT title, score, created_at FROM signals WHERE title ILIKE '%sales intelligence%' OR title ILIKE '%SDR%' OR title ILIKE '%AI sales%' OR title ILIKE '%aloomii%' OR source_bu = 'lexi' ORDER BY created_at DESC LIMIT 5"),
    pool.query("SELECT clip_id, guest_name, proposed_caption, predicted_score, youtube_url FROM pbn_clips WHERE predicted_score >= 3.5 ORDER BY predicted_score DESC LIMIT 6"),
    pool.query("SELECT time, type, source, score, COALESCE(payload->>'context', payload->>'note', payload->>'notes', payload->>'signal_text', substring(payload::text from 1 for 150)) as details, payload->>'source_url' as url FROM activity_log ORDER BY time DESC LIMIT 20"),
    pool.query("SELECT title, score, source_bu, created_at, SUBSTRING(body FROM 1 FOR 120) as snippet FROM signals ORDER BY created_at DESC LIMIT 15"),
  ]);

  const formatTime = (ts) => ts ? new Date(ts).toLocaleString('en-US', { timeZone: 'America/Toronto', hour12: false }) : '—';
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' }) : '—';

  const bg = isDark ? '#1a1a1a' : '#f0f0f0';
  const fg = isDark ? '#fff' : '#333';
  const tableBg = isDark ? '#2a2a2a' : '#fff';
  const border = isDark ? '#444' : '#ddd';
  const cardBg = isDark ? '#222' : '#fff';

  const css = `
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: ${bg}; color: ${fg}; padding: 20px; margin: 0; }
    h1 { color: #ffd700; margin-bottom: 4px; }
    h2 { color: #ffd700; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid ${border}; padding-bottom: 6px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .card { background: ${cardBg}; border: 1px solid ${border}; border-radius: 8px; padding: 14px; }
    .card h3 { margin: 0 0 10px 0; color: #ffd700; font-size: 1em; }
    table { border-collapse: collapse; width: 100%; background: ${tableBg}; }
    th, td { border: 1px solid ${border}; padding: 7px 9px; text-align: left; font-size: 0.88em; }
    th { background: #ffd700; color: #000; }
    .ok { color: #4ade80; } .error { color: #f87171; } .disabled { color: #9ca3af; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 0.78em; font-weight: bold; }
    .badge-hot { background: #f87171; color: #fff; }
    .badge-t1 { background: #ffd700; color: #000; }
    .badge-t2 { background: #9ca3af; color: #000; }
    a { color: #ffd700; }
    .meta { font-size: 0.78em; color: #9ca3af; }
    .section-full { margin-bottom: 28px; }
    .cache-note { font-size: 0.75em; color: #9ca3af; margin-top: 4px; }
  `;

  const btsAlerts = snipeAlerts.alerts.filter(a => /bts|concert|guns|world cup/i.test(a.target));
  const mtgAlerts = snipeAlerts.alerts.filter(a => /lotus|mtg|pokemon|charizard|psa/i.test(a.target));

  const btsRows = btsAlerts.length > 0
    ? btsAlerts.map(a => a.findings.map(f => `<tr><td>${a.target}</td><td>${f.item}</td><td>${f.ask_price}</td><td class="meta">${f.notes || '—'}</td></tr>`).join('')).join('')
    : '<tr><td colspan="4" class="meta">No ticket alerts found.</td></tr>';

  const mtgRows = mtgAlerts.length > 0
    ? mtgAlerts.map(a => a.findings.map(f => `<tr><td>${a.target}</td><td>${f.item}</td><td>${f.ask_price}</td><td class="meta">${f.notes || '—'}</td></tr>`).join('')).join('')
    : '<tr><td colspan="4" class="meta">No MTG alerts found.</td></tr>';

  const fleetRows = opsMetrics.cron_fleet.jobs.map(job => {
    const cls = job.status === 'ok' ? 'ok' : job.status === 'error' ? 'error' : 'disabled';
    return `<tr><td>${job.icon} ${job.display_name}</td><td class="${cls}"><b>${job.status.toUpperCase()}</b></td><td>${job.last_run}</td><td>${job.next_run}</td><td class="meta">${job.schedule}</td><td class="meta">${job.model}</td></tr>`;
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
<p style="margin:0 0 6px 0">Powered by <b style="color:#ffd700">Aloomii AI Workforce</b> &nbsp;·&nbsp; <a href="?mode=${isDark ? 'light' : 'dark'}">Toggle ${isDark ? 'Light' : 'Dark'} Mode</a></p>

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

  <div class="card">
    <h3>📅 Events Coming Up</h3>
    <table>
      <tr><th>Date</th><th>Event</th><th>Location</th></tr>
      ${upcomingEvents.rows.map(e => `<tr><td style="white-space:nowrap"><b>${formatDate(e.date)}</b></td><td>${e.name}</td><td class="meta">${e.city || '—'}</td></tr>`).join('') || '<tr><td colspan="3">No events.</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h3>🔄 Reconnect With</h3>
    <table>
      <tr><th>Name</th><th>Role</th><th>Last Touch</th></tr>
      ${reconnectContacts.rows.map(c => `<tr><td><span class="badge badge-t${c.tier}">T${c.tier}</span> ${c.name}</td><td class="meta">${c.role || '—'}</td><td class="meta">${c.last_signal ? formatDate(c.last_signal) : '<span style="color:#f87171">Never</span>'}</td></tr>`).join('') || '<tr><td colspan="3">All caught up.</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h3>🔥 Talk To Now (Hot)</h3>
    <table>
      <tr><th>Name</th><th>Role</th><th>Via</th></tr>
      ${warmContacts.rows.map(c => `<tr><td><span class="badge badge-hot">HOT</span> ${c.name}</td><td class="meta">${c.role || '—'}</td><td class="meta">${c.mutual_connection || '—'}</td></tr>`).join('') || '<tr><td colspan="3">No hot contacts.</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h3>💜 Vibrnt AI Trends</h3>
    <table>
      <tr><th>Score</th><th>Signal</th><th>Date</th></tr>
      ${vibrntTrends.rows.map(s => `<tr><td><b>${s.score}</b></td><td>${s.title}</td><td class="meta">${formatDate(s.created_at)}</td></tr>`).join('') || '<tr><td colspan="3" class="meta">No Vibrnt trend signals yet.</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h3>🤖 Aloomii Trends</h3>
    <table>
      <tr><th>Score</th><th>Signal</th><th>Date</th></tr>
      ${aloomiiTrends.rows.map(s => `<tr><td><b>${s.score}</b></td><td>${s.title}</td><td class="meta">${formatDate(s.created_at)}</td></tr>`).join('') || '<tr><td colspan="3" class="meta">No Aloomii trend signals yet.</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h3>🎫 Ticket Watch (Pairs Only)</h3>
    <table>
      <tr><th>Target</th><th>Listing</th><th>Price</th><th>Notes</th></tr>
      ${btsRows}
    </table>
    <p class="cache-note">🕐 Refreshes 3×/day · Next refresh: ${nextRefresh}</p>
  </div>

  <div class="card">
    <h3>🃏 MTG / Pokémon Watch</h3>
    <table>
      <tr><th>Target</th><th>Listing</th><th>Price</th><th>Notes</th></tr>
      ${mtgRows}
    </table>
    <p class="cache-note">🕐 Refreshes 3×/day · Next refresh: ${nextRefresh}</p>
  </div>

  <div class="card">
    <h3>🎬 PBN Clips Ready to Ship</h3>
    <table>
      <tr><th>Score</th><th>Guest</th><th>Caption</th><th>Link</th></tr>
      ${pbnClips.rows.map(c => `<tr><td><b>${c.predicted_score}</b></td><td>${c.guest_name || '—'}</td><td class="meta">${c.proposed_caption ? c.proposed_caption.substring(0,60)+'…' : '—'}</td><td><a href="${c.youtube_url}" target="_blank">▶</a></td></tr>`).join('') || '<tr><td colspan="4" class="meta">No clips ready.</td></tr>'}
    </table>
  </div>

  <div class="card" style="grid-column: span 2;">
    <h3>✍️ Aloomii Blog Drafts</h3>
    <table>
      <tr><th>Status</th><th>Title</th><th>Words</th></tr>
      ${drafts.map(d => `<tr><td><span style="color:#4ade80">🟡 Draft</span></td><td>${d.title}</td><td class="meta">${d.words.toLocaleString()} words</td></tr>`).join('')}
      ${backlog.filter(b => !b.status.includes('Published')).map(b => `<tr><td class="meta">${b.status}</td><td>${b.title}</td><td class="meta">—</td></tr>`).join('')}
      ${(drafts.length + backlog.length) === 0 ? '<tr><td colspan="3">No blog drafts found.</td></tr>' : ''}
    </table>
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
    ${activityFeeds.rows.map(f => `<tr>
      <td style="white-space:nowrap"><small>${formatTime(f.time)}</small></td>
      <td>${f.type}</td>
      <td><b>${f.score || '—'}</b></td>
      <td>${f.details || '—'}${f.url ? ` <a href="${f.url}" target="_blank">[→]</a>` : ''}</td>
    </tr>`).join('')}
  </table>
</div>

<div class="section-full">
  <h2>📡 Recent Signals</h2>
  <table>
    <tr><th>Time</th><th>Source</th><th>Score</th><th>Title</th><th>Snippet</th></tr>
    ${recentSignals.rows.map(s => `<tr>
      <td style="white-space:nowrap"><small>${formatTime(s.created_at)}</small></td>
      <td>${s.source_bu}</td>
      <td><b>${s.score}</b></td>
      <td>${s.title}</td>
      <td class="meta">${s.snippet ? s.snippet + '…' : ''}</td>
    </tr>`).join('') || '<tr><td colspan="5">No signals found.</td></tr>'}
  </table>
</div>

</body>
</html>`);
});

app.listen(3002, () => console.log('Aloomii C&C: http://localhost:3002'));
