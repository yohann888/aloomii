#!/usr/bin/env node
/**
 * Lexi Shadow Demand → B2B Signal Connector
 * CR-J06 — jenny100x Phase 2 ITIL Rollout
 *
 * Applies Lexi's "Shadow Demand" pattern to B2B intent signals.
 * Finds buying intent in non-traditional channels:
 *   1. GitHub Distress Signals
 *   2. Reddit Intent Signals (r/sales, r/entrepreneur, r/startups, r/smallbusiness)
 *   3. Job Board Distress Signals (SDR/BDR postings = hot Aloomii prospects)
 *
 * Cron: 2x/day — 6AM + 2PM ET
 * Limit: max 20 signals per run
 * Log: logs/lexi-b2b-signals.log
 */

const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const WORKSPACE = path.resolve(__dirname, '../../..'); // workspace root: scripts/signal-api/ingest → scripts/signal-api → scripts → workspace
const LOG_FILE = path.join(WORKSPACE, 'logs/lexi-b2b-signals.log');
const GEMINI_SCRIPT = path.join(WORKSPACE, 'scripts/gemini-search.sh');
const MAX_SIGNALS_PER_RUN = 20;
const DB_URL = process.env.DATABASE_URL || 'postgresql://superhana@localhost:5432/aloomii';

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(msg, level = 'INFO') {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (err) {
    console.error(`[${ts}] [WARN] Failed to write log file: ${err.message}`);
  }
}

// ─── Gemini Search ────────────────────────────────────────────────────────────
function geminiSearch(query, timeoutMs = 30000) {
  try {
    log(`Gemini search: "${query.slice(0, 80)}..."`);
    const result = execFileSync('bash', [GEMINI_SCRIPT, query], {
      timeout: timeoutMs,
      encoding: 'utf8',
      cwd: WORKSPACE
    });
    return result.trim();
  } catch (err) {
    const stderr = err.stderr?.toString?.().trim();
    const stdout = err.stdout?.toString?.().trim();
    log(`Gemini search failed: ${err.message}${stderr ? ` | stderr=${stderr}` : ''}${stdout ? ` | stdout=${stdout}` : ''}`, 'WARN');
    return null;
  }
}

// ─── Score Buying Intent ──────────────────────────────────────────────────────
function scoreIntent(text) {
  if (!text) return { score: 2.0, confidence: 0.3 };

  const lowerText = text.toLowerCase();
  let score = 2.0;
  let confidence = 0.5;

  // High-value intent signals
  const highValueTerms = [
    'looking for alternative', 'replace our', 'replacing our', 'switching from',
    'evaluating', 'rfp', 'request for proposal', 'budget approved', 'need to find',
    'anyone recommend', 'best tool for', 'compare', 'demo request',
    'pricing', 'how much does', 'free trial'
  ];

  // Medium-value signals
  const medValueTerms = [
    'frustrated with', 'tired of', 'problem with', 'issue with',
    'doesn\'t work', 'painful', 'looking for', 'recommend',
    'sdr', 'bdr', 'sales development', 'outbound sales', 'sales automation',
    'ai sales', 'sales ai', 'crm pain', 'prospecting'
  ];

  // Low-value / noise (includes AI-generated summary indicators)
  const noiseTerms = [
    'spam', 'test post', '[deleted]', '[removed]',
    'here are some', 'here\'s what i found', 'based on my search',
    'the search results show', 'i found several', 'to summarize',
    'as of march 2026', 'as of 2026', 'when searching for',
  ];

  for (const term of noiseTerms) {
    if (lowerText.includes(term)) return { score: 0.5, confidence: 0.1 };
  }

  const highMatches = highValueTerms.filter(t => lowerText.includes(t)).length;
  const medMatches = medValueTerms.filter(t => lowerText.includes(t)).length;

  score += highMatches * 0.8;
  score += medMatches * 0.3;
  confidence = Math.min(0.3 + (highMatches * 0.15) + (medMatches * 0.08), 0.95);
  score = Math.min(score, 5.0);

  return { score: parseFloat(score.toFixed(2)), confidence: parseFloat(confidence.toFixed(2)) };
}

// ─── Parse Gemini Results into Signal Candidates ──────────────────────────────
function parseGeminiResults(rawText, source, signalType) {
  if (!rawText || rawText.length < 50) return [];

  // Guard: reject error responses
  const trimmed = rawText.trim();
  if (
    trimmed.startsWith('ERR:') ||
    /"code"\s*:\s*(400|401|403|429|500|503)/.test(trimmed) ||
    /"status"\s*:\s*"(INVALID_ARGUMENT|UNAUTHENTICATED|PERMISSION_DENIED|RESOURCE_EXHAUSTED|INTERNAL)"/.test(trimmed)
  ) {
    return [];
  }

  const candidates = [];

  // AI filler prefixes — blocks/titles starting with these are Gemini summaries, not real signals
  const AI_FILLER_PREFIXES = [
    'based on', 'in summary', 'here are', 'here\'s what', 'here is',
    'according to', 'the search results', 'i found', 'overall',
    'to summarize', 'let me', 'it appears', 'from the results',
    'as of', 'when searching', 'if you\'re looking', 'for small businesses',
    'sales development representatives are', 'searching for',
  ];

  // Domains that are not real signal sources (AI search artifacts, internal, etc.)
  const BLOCKED_URL_DOMAINS = [
    'gemini-search', 'localhost', '127.0.0.1', 'example.com', 'test.com',
  ];

  /**
   * Validate a URL: must be real http(s), not a blocked domain, and well-formed.
   * Returns the cleaned URL string or null.
   */
  function validateUrl(raw) {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      const host = u.hostname.toLowerCase();
      for (const blocked of BLOCKED_URL_DOMAINS) {
        if (host === blocked || host.endsWith('.' + blocked)) return null;
      }
      // Reject URLs that are just a bare domain with no path/query (likely not a real page)
      if (u.pathname === '/' && !u.search && !u.hash) return null;
      return u.href;
    } catch {
      return null;
    }
  }

  /**
   * Check if text starts with any AI filler prefix.
   */
  function isAIFiller(text) {
    const lower = text.toLowerCase().trim();
    return AI_FILLER_PREFIXES.some(prefix => lower.startsWith(prefix));
  }

  // Split into chunks (each result block)
  const blocks = rawText.split(/\n{2,}/);

  for (const block of blocks.slice(0, 8)) {
    if (block.trim().length < 30) continue;

    // Extract URL if present
    const urlMatch = block.match(/https?:\/\/[^\s\)]+/);
    const url = validateUrl(urlMatch ? urlMatch[0].trim() : null);

    if (!url) continue; // Must have a validated real URL

    // Filter out AI conversational filler
    if (isAIFiller(block)) continue;

    // Extract title/headline (first non-empty line)
    // Filter out lines that don't look like real content/titles
    const lines = block.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 10 && !isAIFiller(l));
    
    if (lines.length === 0) continue;
    
    const title = lines[0].replace(/^[#*\->\d\.\s]+/, '').trim().slice(0, 200);
    const body = lines.slice(1).join(' ').trim().slice(0, 1000) || block.slice(0, 500);

    if (!title || title.length < 10 || isAIFiller(title)) continue;

    const { score, confidence } = scoreIntent(title + ' ' + body);

    if (score < 1.5) continue; // Skip low-intent noise

    candidates.push({
      signal_type: signalType,
      source_bu: 'lexi',
      title: `[${source}] ${title}`,
      body,
      score,
      confidence,
      raw_data: {
        url,
        source,
        snippet: body.slice(0, 300),
        gemini_block: block.slice(0, 500)
      },
      source_url: url, // Must use real URL, no fallback to gemini-search
      collection_method: 'gemini_search'
    });
  }

  return candidates;
}

// ─── Insert Signal into DB ────────────────────────────────────────────────────
async function insertSignal(pool, signal) {
  // Guard: skip any signal with an error title
  if (signal.title && signal.title.includes('ERR:')) {
    log(`Skipped error signal: "${signal.title.slice(0, 60)}"`, 'WARN');
    return null;
  }

  try {
    const result = await pool.query(
      `INSERT INTO signals
         (signal_type, source_bu, title, body, score, confidence,
          raw_data, source_url, collection_method, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '7 days')
       ON CONFLICT (source_url) WHERE source_url IS NOT NULL AND source_url <> ''
       DO NOTHING
       RETURNING id`,
      [
        signal.signal_type,
        signal.source_bu,
        signal.title,
        signal.body,
        signal.score,
        signal.confidence,
        JSON.stringify(signal.raw_data),
        signal.source_url,
        signal.collection_method
      ]
    );

    if (result.rows.length > 0) {
      log(`Inserted signal: ${result.rows[0].id} | score=${signal.score} | "${signal.title.slice(0, 60)}"`);
      return result.rows[0].id;
    } else {
      log(`Skipped duplicate: "${signal.title.slice(0, 60)}"`, 'DEBUG');
      return null;
    }
  } catch (err) {
    log(`Insert error: ${err.message}`, 'ERROR');
    return null;
  }
}

// ─── Source 1: GitHub Distress Signals ───────────────────────────────────────
async function collectGithubDistressSignals() {
  log('=== Source 1: GitHub Distress Signals ===');

  const queries = [
    '"looking for alternative" sales automation site:github.com',
    '"evaluating" CRM OR "sales tool" site:github.com/issues',
    '"sales automation frustration" OR "SDR replacement" site:github.com'
  ];

  const signals = [];
  for (const query of queries) {
    const raw = geminiSearch(query);
    if (raw) {
      const found = parseGeminiResults(raw, 'github', 'distress');
      signals.push(...found);
      log(`GitHub query found ${found.length} candidates`);
    }
  }

  return signals;
}

// ─── Source 2: Reddit Intent Signals ─────────────────────────────────────────
async function collectRedditIntentSignals() {
  log('=== Source 2: Reddit Intent Signals ===');

  const queries = [
    'site:reddit.com/r/sales "ai sales" OR "sales automation" OR "replace SDR" 2024 OR 2025',
    'site:reddit.com/r/entrepreneur "looking for" CRM OR "sales tool" recommendation',
    'site:reddit.com/r/startups "outbound sales" OR "SDR" pain frustration alternative',
    'site:reddit.com/r/smallbusiness "sales automation" OR "prospecting tool" recommend'
  ];

  const signals = [];
  for (const query of queries) {
    const raw = geminiSearch(query);
    if (raw) {
      const found = parseGeminiResults(raw, 'reddit', 'buying');
      signals.push(...found);
      log(`Reddit query found ${found.length} candidates`);
    }
  }

  return signals;
}

// ─── Source 3: Job Board Distress Signals ────────────────────────────────────
async function collectJobBoardDistressSignals() {
  log('=== Source 3: Job Board Distress Signals (SDR/BDR = Hot Prospects) ===');

  const queries = [
    'site:linkedin.com/jobs "sales development representative" OR "SDR" startup 2025',
    'site:lever.co OR site:greenhouse.io "BDR" OR "SDR" startup "first sales hire" 2025',
    '"hiring SDR" OR "hiring BDR" startup founder site:reddit.com OR site:news.ycombinator.com'
  ];

  const signals = [];
  for (const query of queries) {
    const raw = geminiSearch(query);
    if (raw) {
      const found = parseGeminiResults(raw, 'job_board', 'buying');
      // Boost score for job board signals (company actively hiring SDR = hot prospect)
      for (const s of found) {
        s.score = Math.min(s.score + 0.5, 5.0);
        s.signal_type = 'buying'; // Active hiring = strong buying intent
        s.title = `[SDR Hire Intent] ${s.title}`;
      }
      signals.push(...found);
      log(`Job board query found ${found.length} candidates`);
    }
  }

  return signals;
}

// ─── Guildwood Pool Cross-Reference ──────────────────────────────────────────

/**
 * Cross-reference a signal against the Guildwood Pool.
 * Matches on domain extracted from signal.source_url.
 * If a match is found: boost icp_score by 2, mark as 'promoted', return the row.
 */
async function checkGuildwoodPool(pool, signal, dryRun = false) {
  if (!signal.source_url && !signal.title) return null;

  // Extract domain from source_url
  let domain = null;
  try {
    const url = new URL(signal.source_url || '');
    domain = url.hostname.replace(/^www\./, '');
  } catch (e) { /* not a valid URL */ }

  if (!domain) return null;

  // Fuzzy match against guildwood_pool (monitoring rows only)
  const result = await pool.query(`
    SELECT id, company_name, domain, icp_score,
           contact_first_name, contact_last_name,
           contact_email, contact_linkedin,
           enriched_data
    FROM guildwood_pool
    WHERE status = 'monitoring'
      AND (
        domain = $1
        OR domain ILIKE $2
      )
    LIMIT 1
  `, [domain, `%${domain.split('.')[0]}%`]);

  if (result.rows.length === 0) return null;

  const match = result.rows[0];
  const newScore = Math.min(match.icp_score + 2, 10);

  if (!dryRun) {
    // Boost icp_score by 2 (live signal = confirmed buying intent), promote
    await pool.query(`
      UPDATE guildwood_pool
      SET icp_score = LEAST(icp_score + 2, 10),
          status = 'promoted',
          last_checked_at = NOW()
      WHERE id = $1
    `, [match.id]);
    log(`[GUILDWOOD HIT] ${match.company_name} (${match.domain}) — icp_score boosted to ${newScore} → PROMOTED`);
  } else {
    log(`[GUILDWOOD HIT DRY] ${match.company_name} (${match.domain}) — would boost to ${newScore} → PROMOTED`);
  }

  return match;
}

/**
 * Promote a Guildwood match to the live CRM (accounts + contacts).
 * Skips gracefully if the company/contact already exists.
 */
async function promoteTocrm(pool, guildwoodRow, signal) {
  // ── 1. Upsert into accounts ──────────────────────────────────────────────
  // Unique index is on lower(domain) WHERE domain IS NOT NULL AND domain <> ''
  await pool.query(`
    INSERT INTO accounts (name, domain, metadata, created_at)
    VALUES ($1, $2, $3::jsonb, NOW())
    ON CONFLICT (lower(domain))
    WHERE domain IS NOT NULL AND domain <> ''
    DO UPDATE SET
      name       = EXCLUDED.name,
      updated_at = NOW()
  `, [
    guildwoodRow.company_name,
    guildwoodRow.domain,
    JSON.stringify({ source: 'guildwood_pool', guildwood_id: guildwoodRow.id })
  ]);

  // ── 2. Upsert into contacts (if email present) ───────────────────────────
  if (guildwoodRow.contact_email) {
    // Use direct name columns; fall back to enriched_data for legacy rows
    const firstName = guildwoodRow.contact_first_name
      || guildwoodRow.enriched_data?.['First Name'] || '';
    const lastName  = guildwoodRow.contact_last_name
      || guildwoodRow.enriched_data?.['Last Name']  || '';
    const fullName  = `${firstName} ${lastName}`.trim() || guildwoodRow.company_name;

    const linkedinUrl = guildwoodRow.contact_linkedin || null;

    if (linkedinUrl) {
      // Unique index exists on lower(handle) — safe to use ON CONFLICT
      await pool.query(`
        INSERT INTO contacts (name, email, handle, source, lead_status, metadata, created_at)
        VALUES ($1, $2, $3, 'guildwood_pool', 'new',
                $4::jsonb, NOW())
        ON CONFLICT (lower(handle))
        WHERE handle IS NOT NULL AND handle <> ''
        DO NOTHING
      `, [
        fullName,
        guildwoodRow.contact_email,
        linkedinUrl,
        JSON.stringify({ company: guildwoodRow.company_name, guildwood_id: guildwoodRow.id })
      ]);
    } else {
      // No linkedin URL — guard against email dupes with a SELECT first
      const exists = await pool.query(
        `SELECT 1 FROM contacts WHERE email = $1 LIMIT 1`,
        [guildwoodRow.contact_email]
      );
      if (exists.rows.length === 0) {
        await pool.query(`
          INSERT INTO contacts (name, email, source, lead_status, metadata, created_at)
          VALUES ($1, $2, 'guildwood_pool', 'new', $3::jsonb, NOW())
        `, [
          fullName,
          guildwoodRow.contact_email,
          JSON.stringify({ company: guildwoodRow.company_name, guildwood_id: guildwoodRow.id })
        ]);
      }
    }
  }

  log(`[CRM PROMOTED] ${guildwoodRow.company_name} → accounts + contacts`);
}

// ─── Main Run ─────────────────────────────────────────────────────────────────
async function run(dryRun = false) {
  const pool = new Pool({ connectionString: DB_URL });
  const runStart = Date.now();
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Lexi Shadow Demand B2B Signal Connector — RUN START');
  log(`Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE'}`);

  let allSignals = [];

  try {
    const [githubSignals, redditSignals, jobBoardSignals] = await Promise.all([
      collectGithubDistressSignals(),
      collectRedditIntentSignals(),
      collectJobBoardDistressSignals()
    ]);

    allSignals = [...githubSignals, ...redditSignals, ...jobBoardSignals];

    // Sort by score descending, take top MAX_SIGNALS_PER_RUN
    allSignals.sort((a, b) => b.score - a.score);
    const toInsert = allSignals.slice(0, MAX_SIGNALS_PER_RUN);

    log(`Total candidates: ${allSignals.length} | Inserting top: ${toInsert.length}`);

    let inserted = 0;
    let guildwoodHits = 0;
    if (!dryRun) {
      for (const signal of toInsert) {
        const id = await insertSignal(pool, signal);
        if (id) {
          inserted++;
          // Cross-reference against Guildwood Pool — boost + promote on match
          const guildwoodMatch = await checkGuildwoodPool(pool, signal, false);
          if (guildwoodMatch) {
            guildwoodHits++;
            await promoteTocrm(pool, guildwoodMatch, signal);
          }
        }
      }
    } else {
      log('DRY RUN — sample signals:');
      toInsert.slice(0, 3).forEach(s => {
        log(`  score=${s.score} | ${s.title.slice(0, 80)}`);
      });
      log('DRY RUN — Guildwood Pool cross-reference (read-only check):');
      for (const signal of toInsert) {
        const guildwoodMatch = await checkGuildwoodPool(pool, signal, true);
        if (guildwoodMatch) {
          guildwoodHits++;
          log(`  [DRY HIT] ${guildwoodMatch.company_name} (${guildwoodMatch.domain}) — would promote`);
        }
      }
      inserted = toInsert.length;
    }

    const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    log(`RUN COMPLETE — inserted: ${inserted} | guildwood_hits: ${guildwoodHits} | elapsed: ${elapsed}s`);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return { inserted, guildwood_hits: guildwoodHits, total_candidates: allSignals.length, elapsed_s: parseFloat(elapsed) };
  } catch (err) {
    log(`FATAL ERROR: ${err.message}`, 'ERROR');
    log(err.stack, 'ERROR');
    throw err;
  } finally {
    await pool.end();
  }
}

// ─── Cron Schedule Info (for reference) ──────────────────────────────────────
// Add to crontab:
//   0 6,14 * * * cd /Users/superhana/.openclaw/workspace && node scripts/signal-api/ingest/lexi-b2b-signals.js >> logs/lexi-b2b-signals.log 2>&1

// ─── CLI Entry Point ──────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  run(dryRun)
    .then(result => {
      console.log('\n[lexi-b2b-signals] Result:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('[lexi-b2b-signals] Fatal:', err.message);
      process.exit(1);
    });
}

module.exports = { run, scoreIntent, parseGeminiResults };
