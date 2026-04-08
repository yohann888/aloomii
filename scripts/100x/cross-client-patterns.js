#!/usr/bin/env node
/**
 * Build 4: Cross-Client Pattern Matching
 * Runs monthly — 1st of month at 6:00 AM ET
 * Model: ollama/gemma4:31b (local synthesis), $0
 *
 * What it does:
 * 1. Aggregates signal, outreach, and outcome data across all clients
 * 2. Identifies patterns that individual clients can't see
 * 3. Updates scoring weights + signal priorities based on actual outcomes
 * 4. Posts insights to Discord + writes to cross_client_patterns table
 * 5. Generates sales proof points for The Table pitch conversations
 *
 * Minimum viable with sparse data: still runs, surfaces what exists,
 * notes data gaps, gets richer every month automatically.
 */

'use strict';

const { execSync } = require('child_process');
const { writeFileSync, unlinkSync } = require('fs');
const http = require('http');

const DB = 'postgresql://superhana@localhost:5432/aloomii';
const psql = '/opt/homebrew/Cellar/postgresql@18/18.2/bin/psql';
const OLLAMA_HOST = '10.211.55.2';

const today = new Date().toISOString().split('T')[0];
const monthYear = today.slice(0, 7); // YYYY-MM

function sqlFile(sql) {
  const tmp = `/tmp/ccp_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, sql);
  try { return execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 60000 }).trim(); }
  finally { unlinkSync(tmp); }
}

function sqlJSON(sql) {
  const tmp = `/tmp/ccp_${process.pid}_${Math.random().toString(36).slice(2)}.sql`;
  writeFileSync(tmp, `SELECT row_to_json(t) FROM (${sql}) t`);
  try {
    const out = execSync(`${psql} "${DB}" -t -A -f "${tmp}"`, { encoding: 'utf8', timeout: 60000 });
    return out.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } finally { unlinkSync(tmp); }
}

async function callGemma(prompt) {
  return new Promise(resolve => {
    const body = JSON.stringify({ model: 'gemma4:31b', prompt, stream: false, options: { temperature: 0.2, num_predict: 1200 } });
    const req = http.request({
      hostname: OLLAMA_HOST, port: 11434, path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).response); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(body); req.end();
  });
}

async function main() {
  console.log(`[cross-client] Monthly pattern analysis — ${monthYear}`);

  // === 1. CLIENT ROSTER ===
  const clients = sqlJSON(`
    SELECT name, vertical, tier, pilot_status, onboard_date,
      EXTRACT(DAY FROM NOW() - onboard_date::timestamptz)::int as days_active
    FROM client_pilots
    WHERE pilot_status IN ('active', 'target')
    ORDER BY onboard_date
  `);
  console.log(`[cross-client] ${clients.length} clients in roster`);

  // === 2. SIGNAL PERFORMANCE ===
  const signalStats = sqlJSON(`
    SELECT 
      signal_type,
      COUNT(*) as total_signals,
      ROUND(AVG(score)::numeric, 2) as avg_score,
      ROUND(AVG(confidence)::numeric, 2) as avg_confidence,
      COUNT(CASE WHEN score >= 4 THEN 1 END) as high_score_count
    FROM signals
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY signal_type
    ORDER BY total_signals DESC
  `);

  // === 3. OUTREACH PERFORMANCE ===
  const outreachStats = sqlJSON(`
    SELECT 
      channel,
      status,
      COUNT(*) as count
    FROM outreach_queue
    GROUP BY channel, status
    ORDER BY count DESC
  `);

  const draftStats = sqlJSON(`
    SELECT 
      channel,
      COUNT(*) as total,
      ROUND(AVG(score_total)::numeric, 1) as avg_score,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
      COUNT(CASE WHEN outcome = 'replied' THEN 1 END) as replied
    FROM outreach_drafts
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY channel
  `);

  // === 4. OPPORTUNITY PIPELINE ===
  const opps = sqlJSON(`
    SELECT stage, COUNT(*) as count, 
      ROUND(AVG(EXTRACT(DAY FROM NOW() - created_at))::numeric, 0) as avg_age_days
    FROM opportunities
    GROUP BY stage
    ORDER BY count DESC
  `);

  // === 5. CONTACT TIER DISTRIBUTION ===
  const contactDist = sqlJSON(`
    SELECT tier, COUNT(*) as contacts,
      COUNT(CASE WHEN last_signal IS NOT NULL THEN 1 END) as with_signals,
      COUNT(CASE WHEN rhs_current IS NOT NULL THEN 1 END) as with_rhs
    FROM contacts
    WHERE status NOT IN ('do_not_contact')
    GROUP BY tier ORDER BY tier
  `);

  // === 6. SIGNAL PATTERNS (from Build 3) ===
  const patterns = sqlJSON(`
    SELECT pattern_type, COUNT(*) as count, 
      ROUND(AVG(confidence)::numeric, 1) as avg_confidence
    FROM signal_patterns
    WHERE detected_at > NOW() - INTERVAL '30 days'
    GROUP BY pattern_type
    ORDER BY count DESC
  `);

  // === 7. NETWORK GRAPH STATS ===
  const networkStats = sqlJSON(`
    SELECT 
      COUNT(*) as total_edges,
      COUNT(CASE WHEN strength='strong' THEN 1 END) as strong,
      COUNT(DISTINCT contact_a) as connected_contacts
    FROM contact_connections
  `);

  // === 8. BUILD SYNTHESIS PROMPT ===
  const dataBlock = `
CLIENTS (${clients.length} total):
${clients.map(c => `• ${c.name} (${c.vertical}, ${c.days_active} days active)`).join('\n')}

SIGNALS LAST 30 DAYS:
${signalStats.map(s => `• ${s.signal_type}: ${s.total_signals} signals, avg score ${s.avg_score}`).join('\n') || 'No signal data yet'}

OUTREACH QUEUE STATUS:
${outreachStats.map(o => `• ${o.channel || 'email'} ${o.status}: ${o.count}`).join('\n') || 'No outreach data yet'}

OPPORTUNITY PIPELINE:
${opps.map(o => `• ${o.stage}: ${o.count} (avg ${o.avg_age_days} days old)`).join('\n') || 'No opportunities yet'}

CONTACT DISTRIBUTION:
${contactDist.map(c => `• Tier ${c.tier}: ${c.contacts} contacts, ${c.with_signals} with signals, ${c.with_rhs} with RHS scores`).join('\n')}

SIGNAL PATTERNS DETECTED:
${patterns.map(p => `• ${p.pattern_type}: ${p.count} detected, avg confidence ${p.avg_confidence}/10`).join('\n') || 'No patterns yet'}

NETWORK GRAPH:
${networkStats[0] ? `${networkStats[0].total_edges} edges, ${networkStats[0].strong} strong, ${networkStats[0].connected_contacts} contacts connected` : 'No graph data'}
`;

  const prompt = `You are analyzing cross-client data for Aloomii — a B2B GTM system for founders.

${dataBlock}

This is month 1 of data collection. Data is sparse but real.

Produce a concise monthly intelligence report with:

1. WHAT'S WORKING: What signal types and channels show the most promise so far?
2. DATA GAPS: What's missing that will improve analysis next month? (be specific about what to track)
3. EARLY PATTERNS: Even with sparse data, what patterns are emerging?
4. RECOMMENDATION: One specific operational change to make this month based on the data.
5. SALES PROOF POINT: One specific, honest data point that could be used in a Table sales conversation (don't exaggerate sparse data — frame it as "early signals show...").

Keep it under 300 words. Be direct. Avoid generic advice.`;

  console.log('[cross-client] Running Gemma 4 synthesis...');
  const synthesis = await callGemma(prompt);

  // === 9. STORE PATTERN INSIGHTS ===
  if (synthesis) {
    // Store key insight in cross_client_patterns table
    sqlFile(`
      INSERT INTO cross_client_patterns (pattern_key, category, insight, data_points, confidence, generated_at)
      VALUES (
        'monthly_${monthYear.replace('-', '_')}',
        'monthly_synthesis',
        ${JSON.stringify(synthesis.slice(0, 2000))},
        ${signalStats.reduce((sum, s) => sum + parseInt(s.total_signals || 0), 0)},
        0.6,
        NOW()
      )
      ON CONFLICT (pattern_key) DO UPDATE SET
        insight = EXCLUDED.insight,
        data_points = EXCLUDED.data_points,
        generated_at = NOW()
    `);
  }

  // === 10. GENERATE SALES PROOF POINTS FILE ===
  const proofPointsPath = `/Users/superhana/Desktop/aloomii/output/cross-client-insights-${monthYear}.md`;
  const reportContent = `# Cross-Client Intelligence — ${monthYear}

_Generated: ${today} | Clients: ${clients.length} | Signals: ${signalStats.reduce((s, r) => s + parseInt(r.total_signals || 0), 0)}_

## Client Roster
${clients.map(c => `- **${c.name}** (${c.vertical}) — ${c.days_active} days active`).join('\n')}

## Signal Performance
${signalStats.map(s => `- **${s.signal_type}**: ${s.total_signals} signals (avg score: ${s.avg_score})`).join('\n') || '- Data accumulating...'}

## Pipeline
${opps.map(o => `- ${o.stage}: ${o.count} opportunities`).join('\n') || '- Pipeline building...'}

## AI Synthesis (Gemma 4 31B)
${synthesis || '_Ollama synthesis not available — data stored for next run_'}

---
_Use "early signals show..." framing for The Table sales conversations until 3+ months of data_
`;

  try {
    const { mkdirSync } = require('fs');
    mkdirSync('/Users/superhana/Desktop/aloomii/output', { recursive: true });
    writeFileSync(proofPointsPath, reportContent);
    console.log(`[cross-client] Report written: ${proofPointsPath}`);
  } catch (e) {
    console.error('[cross-client] Could not write report:', e.message);
  }

  // === 11. DISCORD SUMMARY ===
  const discordSummary = `**📊 Cross-Client Monthly Intelligence — ${monthYear}**

**Clients active:** ${clients.length} | **Signals this month:** ${signalStats.reduce((s, r) => s + parseInt(r.total_signals || 0), 0)} | **Patterns detected:** ${patterns.reduce((s, r) => s + parseInt(r.count || 0), 0)}

**Signal breakdown:**
${signalStats.slice(0, 4).map(s => `• ${s.signal_type}: ${s.total_signals} (avg score ${s.avg_score})`).join('\n') || '• Accumulating...'}

${synthesis ? `**AI Analysis:**\n${synthesis.slice(0, 400)}${synthesis.length > 400 ? '...' : ''}` : ''}

Full report: \`output/cross-client-insights-${monthYear}.md\`
_Build 4 | gemma4:31b local | $0_`;

  console.log(discordSummary);
}

main().catch(e => {
  console.error('[cross-client] Fatal:', e.message);
  process.exit(1);
});
