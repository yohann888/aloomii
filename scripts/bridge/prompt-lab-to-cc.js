#!/usr/bin/env node
/**
 * Prompt Lab → Command Center Bridge
 * Reads aggregated analytics from portal Neon DB
 * Writes to main Aloomii DB (prompt_lab_insights table)
 *
 * Env:
 *   PORTAL_DATABASE_URL — Neon portal DB (prompt_lab_edits)
 *   DATABASE_URL — Main Aloomii DB (prompt_lab_insights)
 *   DAYS — analysis window (default: 7)
 */

const { Pool } = require('pg');

const PORTAL_URL = process.env.PORTAL_DATABASE_URL;
const MAIN_URL = process.env.DATABASE_URL;
const DAYS = parseInt(process.env.DAYS || '7', 10);

if (!PORTAL_URL || !MAIN_URL) {
  console.error('Both PORTAL_DATABASE_URL and DATABASE_URL required');
  process.exit(1);
}

async function main() {
  const portalPool = new Pool({ connectionString: PORTAL_URL });
  const mainPool = new Pool({ connectionString: MAIN_URL });

  try {
    // 1. Pull aggregated data from portal
    const portalResult = await portalPool.query(
      `SELECT
        ci.content_slug,
        ci.title,
        ci.content_type,
        COUNT(*) AS total_edits,
        COUNT(*) FILTER (WHERE ple.reverted_at IS NULL) AS active_edits,
        COUNT(*) FILTER (WHERE ple.reverted_at IS NOT NULL) AS reverted_edits,
        ROUND(AVG(ple.edit_distance)::numeric, 4) AS avg_edit_distance,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND((COUNT(*) FILTER (WHERE ple.reverted_at IS NOT NULL)::numeric / COUNT(*)) * 100, 2)
        END AS reversion_rate
      FROM prompt_lab_edits ple
      JOIN content_items ci ON ci.content_slug = ple.content_slug
      WHERE ple.created_at > NOW() - INTERVAL '${DAYS} days'
      GROUP BY ci.content_slug, ci.title, ci.content_type
      HAVING COUNT(*) >= 2
      ORDER BY total_edits DESC`
    );

    if (portalResult.rows.length === 0) {
      console.log('No prompt lab data for this period.');
      return;
    }

    const periodEnd = new Date().toISOString().split('T')[0];
    const periodStart = new Date(Date.now() - DAYS * 86400000).toISOString().split('T')[0];

    // 2. Insert into main DB
    let inserted = 0;
    for (const row of portalResult.rows) {
      const avgDist = parseFloat(row.avg_edit_distance);
      const revRate = parseFloat(row.reversion_rate);
      const priority =
        row.total_edits >= 10 && avgDist >= 0.35 && revRate <= 15
          ? 'high'
          : row.total_edits >= 5 && avgDist >= 0.25
          ? 'medium'
          : 'watch';

      const signal =
        revRate <= 10 && avgDist >= 0.4
          ? 'Strong candidate for variant'
          : revRate <= 15 && avgDist >= 0.3
          ? 'Consider softening CTA'
          : revRate > 25
          ? 'Original is good — leave it'
          : 'Monitor';

      await mainPool.query(
        `INSERT INTO prompt_lab_insights (
           content_slug, title, content_type,
           period_start, period_end,
           total_edits, active_edits, reverted_edits,
           avg_edit_distance, reversion_rate,
           priority, signal
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (content_slug, period_start, period_end) DO UPDATE SET
           total_edits = EXCLUDED.total_edits,
           active_edits = EXCLUDED.active_edits,
           reverted_edits = EXCLUDED.reverted_edits,
           avg_edit_distance = EXCLUDED.avg_edit_distance,
           reversion_rate = EXCLUDED.reversion_rate,
           priority = EXCLUDED.priority,
           signal = EXCLUDED.signal,
           created_at = NOW()`,
        [
          row.content_slug, row.title, row.content_type,
          periodStart, periodEnd,
          row.total_edits, row.active_edits, row.reverted_edits,
          avgDist, revRate,
          priority, signal,
        ]
      );
      inserted++;
    }

    console.log(`✅ Bridged ${inserted} prompts to Command Center`);
    console.log(`📊 Period: ${periodStart} → ${periodEnd}`);

    // 3. Return summary for Discord announcement
    const highCount = portalResult.rows.filter(
      (r) => parseFloat(r.avg_edit_distance) >= 0.35 && parseFloat(r.reversion_rate) <= 15
    ).length;

    return {
      inserted,
      period: `${periodStart} → ${periodEnd}`,
      highPriority: highCount,
    };
  } catch (err) {
    console.error('Bridge failed:', err.message);
    process.exit(1);
  } finally {
    await portalPool.end();
    await mainPool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main().then((summary) => {
    if (summary) {
      console.log('\n📋 Summary:');
      console.log(`  • Inserted: ${summary.inserted}`);
      console.log(`  • High priority: ${summary.highPriority}`);
    }
  });
}

module.exports = { main };
