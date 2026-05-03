#!/usr/bin/env node
/**
 * budget-tracker.js — Simple file-based budget tracker for EnsembleData pipelines
 * Tracks daily spend per budget key, resets at midnight ET
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.env.HOME || '/tmp', '.ensembledata-budget-state.json');

// Default budget allocations (units per day)
const DEFAULT_BUDGETS = {
  reddit: 900,
  vibrnt_ig: 200,
  vibrnt_tiktok: 150,
  vibrnt_youtube: 100,
  ebook_youtube: 300,
  ebook_twitter: 50,
  ebook_tiktok: 400,
  aloomii_icp: 50,
  email_backfill: 500
};

function getState() {
  try {
    const data = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    // Reset if day changed
    const today = new Date().toISOString().split('T')[0];
    if (parsed.date !== today) {
      return { date: today, usage: {} };
    }
    return parsed;
  } catch {
    return { date: new Date().toISOString().split('T')[0], usage: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function checkBudget(key, requestedUnits) {
  const state = getState();
  const limit = DEFAULT_BUDGETS[key] || 100;
  const used = state.usage[key] || 0;
  const remaining = limit - used;
  return {
    allowed: requestedUnits <= remaining,
    remaining,
    requested: requestedUnits,
    limit,
    used
  };
}

function recordUsage(key, units) {
  const state = getState();
  state.usage[key] = (state.usage[key] || 0) + units;
  saveState(state);
  return state.usage[key];
}

function getBudgetStatus() {
  const state = getState();
  const result = {};
  for (const [key, limit] of Object.entries(DEFAULT_BUDGETS)) {
    const used = state.usage[key] || 0;
    result[key] = { limit, used, remaining: limit - used, pct: Math.round(used / limit * 100) };
  }
  return result;
}

module.exports = { checkBudget, recordUsage, getBudgetStatus, DEFAULT_BUDGETS };

// CLI: node budget-tracker.js status
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'status') {
    console.log(JSON.stringify(getBudgetStatus(), null, 2));
  } else if (cmd === 'reset') {
    saveState({ date: new Date().toISOString().split('T')[0], usage: {} });
    console.log('Budgets reset');
  } else {
    console.log('Usage: node budget-tracker.js [status|reset]');
  }
}
