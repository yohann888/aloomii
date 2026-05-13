#!/usr/bin/env node
/**
 * cron-health-monitor.js
 *
 * Runs every 30 minutes. Checks for stuck cron sessions by looking at
 * session metadata + .jsonl file modification times.
 *
 * Stuck = session .jsonl still being written to (>5 min since start).
 *
 * Usage: node scripts/cron-health-monitor.js
 * Cron:  0,30 * * * * (every 30 min)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SESSIONS_FILE = path.join(process.env.HOME, '.openclaw/agents/main/sessions/sessions.json');
const SESSIONS_DIR  = path.join(process.env.HOME, '.openclaw/agents/main/sessions');
const LOG_DIR       = path.join(process.env.HOME, '.openclaw/workspace/logs');

const STUCK_THRESHOLD_MS = 300000; // 5 minutes
const WARN_THRESHOLD_MS  = 120000; // 2 minutes

/* ── helpers ──────────────────────────────────────────────────────────────── */

function formatAge(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s%60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m%60}m`;
}

function loadSessions() {
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load sessions:', err.message);
    return {};
  }
}

function getJsonlMtime(sessionFile) {
  try {
    if (!sessionFile) return 0;
    const fullPath = sessionFile.startsWith('/')
      ? sessionFile
      : path.join(SESSIONS_DIR, path.basename(sessionFile));
    const stat = fs.statSync(fullPath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main() {
  const now = Date.now();
  const sessions = loadSessions();
  const stuck = [];
  const warning = [];

  for (const [key, sess] of Object.entries(sessions)) {
    if (!key.includes('cron')) continue;

    const started = sess.sessionStartedAt || 0;
    const updated = sess.updatedAt || 0;
    const jsonlMtime = getJsonlMtime(sess.sessionFile);

    // A cron session is "active" if its .jsonl was touched recently
    const isActive = jsonlMtime > (now - 60000); // modified in last 60s
    const runtime = now - started;

    if (isActive && runtime > STUCK_THRESHOLD_MS) {
      stuck.push({
        key,
        label: sess.label || 'unknown',
        runtimeMs: runtime,
        model: sess.model || 'unknown',
      });
    } else if (isActive && runtime > WARN_THRESHOLD_MS) {
      warning.push({
        key,
        label: sess.label || 'unknown',
        runtimeMs: runtime,
        model: sess.model || 'unknown',
      });
    }
  }

  const total = stuck.length + warning.length;
  console.log(`${new Date().toISOString()} | Cron health check`);
  console.log(`  Stuck (>5m): ${stuck.length}`);
  console.log(`  Warning (>2m): ${warning.length}`);

  stuck.forEach(s => console.log(`  🚨 STUCK: ${s.label} (${formatAge(s.runtimeMs)}) [${s.model}]`));
  warning.forEach(w => console.log(`  ⚠️  WARN: ${w.label} (${formatAge(w.runtimeMs)}) [${w.model}]`));

  // Write status for dashboards
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  const statusFile = path.join(LOG_DIR, 'cron-health-status.json');
  fs.writeFileSync(statusFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    stuck: stuck.length,
    warning: warning.length,
    stuckSessions: stuck.map(s => ({ label: s.label, runtimeSec: Math.floor(s.runtimeMs/1000), model: s.model })),
  }, null, 2));

  if (stuck.length > 0) {
    const alert = [
      `[CoS] 🚨 Stuck Cron Session Alert`,
      ``,
      ...stuck.map(s => `- **${s.label}** — ${formatAge(s.runtimeMs)} [${s.model}]`),
      ``,
      `These sessions may hold large object graphs and block GC.`,
    ].join('\n');

    const logFile = path.join(LOG_DIR, 'cron-health-monitor.log');
    fs.appendFileSync(logFile, `${new Date().toISOString()} | STUCK: ${stuck.map(s=>s.label).join(', ')}\n`);

    // When running inside OpenClaw cron, announce handles Discord delivery.
    // Also echo to stdout so it appears in cron logs.
    console.log('\n' + alert);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
