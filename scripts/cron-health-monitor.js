#!/usr/bin/env node
/**
 * cron-health-monitor.js
 *
 * Runs every 30 minutes. Checks the OpenClaw session store for stuck
 * cron sessions (age > 300s in "processing" state) and alerts Discord.
 *
 * Stuck sessions hold references to large object graphs and block GC,
 * which was a contributing factor in the 2026-04-29 OOM crash.
 *
 * Usage: node scripts/cron-health-monitor.js
 * Cron:  0,30 * * * * (every 30 min)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

const SESSIONS_FILE = path.join(process.env.HOME, '.openclaw/sessions.json');
const GATEWAY_URL   = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const DISCORD_ID    = '824304330340827198';

const STUCK_THRESHOLD_MS = 300000; // 5 minutes
const HEALTHY_THRESHOLD_MS = 60000; // 1 minute — warn if approaching

/* ── helpers ──────────────────────────────────────────────────────────────── */

function loadSessions() {
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load sessions:', err.message);
    return [];
  }
}

function formatAge(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s%60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m%60}m`;
}

function sendDiscord(message) {
  // If running inside OpenClaw cron, the announce mechanism handles this.
  // Also try direct message tool via local gateway.
  const payload = JSON.stringify({
    action: 'send',
    channel: 'discord',
    target: DISCORD_ID,
    message,
  });

  const url = new URL('/message', GATEWAY_URL);
  const req = https.request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('Discord alert sent');
      } else {
        console.error('Discord alert failed:', data);
      }
    });
  });

  req.on('error', err => console.error('Discord send error:', err.message));
  req.write(payload);
  req.end();
}

/* ── main ──────────────────────────────────────────────────────────────────── */

async function main() {
  const now = Date.now();
  const sessions = loadSessions();

  // sessions.json is an array of session objects with: key, state, createdAt, updatedAt
  const stuck = [];
  const warning = [];
  const healthy = [];

  for (const sess of sessions) {
    if (!sess.key || !sess.key.includes('cron')) continue;

    const state = sess.state || 'unknown';
    const updatedAt = sess.updatedAt ? new Date(sess.updatedAt).getTime() : (sess.createdAt ? new Date(sess.createdAt).getTime() : now);
    const ageMs = now - updatedAt;

    if (state === 'processing') {
      if (ageMs > STUCK_THRESHOLD_MS) {
        stuck.push({ key: sess.key, ageMs, state });
      } else if (ageMs > HEALTHY_THRESHOLD_MS) {
        warning.push({ key: sess.key, ageMs, state });
      } else {
        healthy.push({ key: sess.key, ageMs, state });
      }
    }
  }

  const totalCron = stuck.length + warning.length + healthy.length;
  if (totalCron === 0) {
    console.log(`${new Date().toISOString()} | No cron sessions found in session store.`);
    return;
  }

  console.log(`${new Date().toISOString()} | Cron health check: ${totalCron} cron sessions`);
  console.log(`  Stuck (>5m): ${stuck.length}`);
  console.log(`  Warning (>1m): ${warning.length}`);
  console.log(`  Healthy (<1m): ${healthy.length}`);

  stuck.forEach(s => console.log(`  🚨 STUCK: ${s.key} (${formatAge(s.ageMs)})`));
  warning.forEach(w => console.log(`  ⚠️  WARNING: ${w.key} (${formatAge(w.ageMs)})`));

  // Alert if stuck sessions found
  if (stuck.length > 0) {
    const alert = [
      `[CoS] 🚨 Stuck Cron Session Alert`,
      ``,
      ...stuck.map(s => `- **${s.key}** — ${formatAge(s.ageMs)} in processing state`),
      ``,
      `These sessions may hold large object graphs and block GC.`,
      `Consider restarting the gateway if multiple sessions are stuck.`,
      `Threshold: >${STUCK_THRESHOLD_MS/1000}s`,
    ].join('\n');

    // Log locally
    const logFile = path.join(process.env.HOME, '.openclaw/workspace/logs/cron-health-monitor.log');
    if (!fs.existsSync(path.dirname(logFile))) fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toISOString()} | STUCK: ${stuck.map(s=>s.key).join(', ')}\n`);

    // Try gateway message send
    sendDiscord(alert);
  }

  // Also write a lightweight status for health dashboards
  const statusFile = path.join(process.env.HOME, '.openclaw/workspace/logs/cron-health-status.json');
  fs.writeFileSync(statusFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalCronSessions: totalCron,
    stuck: stuck.length,
    warning: warning.length,
    healthy: healthy.length,
    stuckSessions: stuck.map(s => ({ key: s.key, ageSec: Math.floor(s.ageMs/1000) })),
  }, null, 2));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
