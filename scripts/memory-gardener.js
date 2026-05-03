#!/usr/bin/env node
/**
 * memory-gardener.js
 *
 * Monthly MEMORY.md hygiene. Runs on the 1st of each month at 8:00 AM.
 *
 * What it does:
 *   1. Scans MEMORY.md for completed tasks ([x]), stale entries (>90 days old),
 *      and orphaned decisions (no follow-up context).
 *   2. Routes extracted content to the correct memory/ subdomain:
 *      - Tech/paths/configs    -> memory/tech-stack.md
 *      - Decisions with dates  -> memory/decisions-log.md
 *      - Cron changes/status   -> memory/cron-fleet.md
 *      - Identity ops          -> memory/identity-ops.md
 *      - Everything else       -> memory/archive/YYYY-MM-archive.md
 *   3. Trims MEMORY.md back to ~180 lines (removes completed/stale items,
 *      keeps active pipeline, people, businesses, current pending).
 *   4. Writes a summary to Discord.
 *
 * Usage: node scripts/memory-gardener.js [--dry-run]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const MEMORY_FILE   = path.join(process.env.HOME, '.openclaw/workspace/MEMORY.md');
const MEMORY_DIR    = path.join(process.env.HOME, '.openclaw/workspace/memory');
const ARCHIVE_DIR   = path.join(MEMORY_DIR, 'archive');
const DISCORD_ID    = '824304330340827198';

const now = new Date();
const thisMonth = now.toISOString().slice(0,7); // YYYY-MM

/* ── helpers ──────────────────────────────────────────────────────────────── */

function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return '';
  return fs.readFileSync(MEMORY_FILE, 'utf-8');
}

function extractDateFromHeader(line) {
  const m = line.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return new Date(m[1]);
  return null;
}

function daysSince(date) {
  return Math.floor((now - date) / (1000*60*60*24));
}

function isCompletedBlock(block) {
  return block.includes('[x]') || block.includes('Status: Complete') || block.includes('Status: Done');
}

function isStaleBlock(block, date) {
  if (!date) return false;
  const age = daysSince(date);
  // Pending items older than 90 days are stale
  if (age > 90 && (block.includes('Pending') || block.includes('TODO') || block.includes('Blocked'))) return true;
  // Completed items older than 30 days are stale
  if (age > 30 && isCompletedBlock(block)) return true;
  return false;
}

function classifyTarget(block) {
  const lowered = block.toLowerCase();
  if (lowered.includes('cron') && (lowered.includes('fleet') || lowered.includes('schedule') || lowered.includes('timeout'))) return 'cron-fleet';
  if (lowered.includes('tech stack') || lowered.includes('database') || lowered.includes('postgres') || lowered.includes('infrastructure') || lowered.includes('config') || lowered.includes('path:')) return 'tech-stack';
  if (lowered.includes('decision') || lowered.includes('decided') || lowered.includes('rationale')) return 'decisions-log';
  if (lowered.includes('identity') || lowered.includes('ops') || lowered.includes('review') || lowered.includes('calibration')) return 'identity-ops';
  return 'archive';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeToTarget(block, target) {
  const fileMap = {
    'cron-fleet':      path.join(MEMORY_DIR, 'cron-fleet.md'),
    'tech-stack':      path.join(MEMORY_DIR, 'tech-stack.md'),
    'decisions-log':   path.join(MEMORY_DIR, 'decisions-log.md'),
    'identity-ops':    path.join(MEMORY_DIR, 'identity-ops.md'),
    'archive':         path.join(ARCHIVE_DIR, `${thisMonth}-archive.md`),
  };
  const targetFile = fileMap[target] || fileMap.archive;
  ensureDir(path.dirname(targetFile));

  const header = `\n<!-- Migrated by memory-gardener ${now.toISOString()} -->\n`;
  fs.appendFileSync(targetFile, header + block + '\n');
}

/* ── main ──────────────────────────────────────────────────────────────────── */

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const content = loadMemory();
  const lines = content.split('\n');

  const keep = [];
  const migrate = [];

  let currentBlock = [];
  let currentBlockHasDate = null;

  function flushBlock() {
    if (currentBlock.length === 0) return;
    const block = currentBlock.join('\n');
    const blockDate = extractDateFromHeader(block) || currentBlockHasDate;
    const stale = isStaleBlock(block, blockDate);
    const completed = isCompletedBlock(block);

    if (stale || completed) {
      migrate.push({ block, date: blockDate, target: classifyTarget(block) });
    } else {
      keep.push(block);
    }
    currentBlock = [];
    currentBlockHasDate = null;
  }

  // Parse line by line, detecting section boundaries
  for (const line of lines) {
    const isHeader = line.match(/^#{2,4}\s/);
    const lineDate = extractDateFromHeader(line);

    if (isHeader && currentBlock.length > 0) {
      flushBlock();
    }

    if (lineDate) currentBlockHasDate = lineDate;
    currentBlock.push(line);
  }
  flushBlock();

  const keptContent = keep.join('\n\n');
  const keptLineCount = keptContent.split('\n').length;
  const originalLineCount = lines.length;

  console.log(`MEMORY.md gardener run: ${now.toISOString()}`);
  console.log(`  Original lines: ${originalLineCount}`);
  console.log(`  Kept lines:     ${keptLineCount}`);
  console.log(`  Migrated:       ${migrate.length} blocks`);
  migrate.forEach(m => console.log(`    -> ${m.target}: ${(m.block.split('\n')[0] || '').slice(0,60)}...`));

  if (!dryRun && migrate.length > 0) {
    fs.writeFileSync(MEMORY_FILE, keptContent.trimEnd() + '\n');
    migrate.forEach(m => writeToTarget(m.block, m.target));
  }

  // Discord summary
  const summary = [
    `[CoS] 🦁 MEMORY.md Monthly Trim — ${now.toLocaleDateString()}`,
    ``,
    `- **Before:** ${originalLineCount} lines`,
    `- **After:** ${keptLineCount} lines`,
    `- **Migrated:** ${migrate.length} blocks`,
    `  - cron-fleet: ${migrate.filter(m=>m.target==='cron-fleet').length}`,
    `  - tech-stack: ${migrate.filter(m=>m.target==='tech-stack').length}`,
    `  - decisions-log: ${migrate.filter(m=>m.target==='decisions-log').length}`,
    `  - identity-ops: ${migrate.filter(m=>m.target==='identity-ops').length}`,
    `  - archive: ${migrate.filter(m=>m.target==='archive').length}`,
    dryRun ? '\n_(Dry run — no changes written)_' : '',
  ].join('\n');

  console.log('\n' + summary);

  // If running inside OpenClaw cron, message tool will handle Discord
  if (process.env.OPENCLAW_GATEWAY_PORT && !dryRun) {
    // Handled by cron announce mechanism
  }

  // Write summary to a log
  const logFile = path.join(process.env.HOME, '.openclaw/workspace/logs/memory-gardener.log');
  ensureDir(path.dirname(logFile));
  fs.appendFileSync(logFile, `${now.toISOString()} | lines: ${originalLineCount} → ${keptLineCount} | migrated: ${migrate.length}\n`);

  return summary;
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
