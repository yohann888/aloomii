const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const configPath = path.join(__dirname, '..', '..', 'config', 'learn-loop-config.json');
let config = {
  min_sample_size: 5,
  confidence_threshold_shorter: 0.6,
  confidence_threshold_longer: 0.6,
  confidence_threshold_personalization: 0.4,
  confidence_threshold_cta: 0.5,
  confidence_threshold_style: 0.4
};

if (fs.existsSync(configPath)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...loaded };
  } catch (e) {
    console.error('Failed to parse config, using defaults:', e.message);
  }
}

async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS learn_loop_results (
      id SERIAL PRIMARY KEY,
      run_at TIMESTAMPTZ DEFAULT NOW(),
      records_processed INT,
      avg_edit_distance DECIMAL(6,2),
      length_shorter_pct DECIMAL(6,2),
      length_longer_pct DECIMAL(6,2),
      personalization_rate DECIMAL(6,2),
      cta_change_rate DECIMAL(6,2),
      newsletter_cta_rate DECIMAL(6,2),
      adapter TEXT,
      pattern_summary TEXT
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS content_engine_hints (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      hint_type TEXT NOT NULL,
      adapter TEXT NOT NULL,
      hint_text TEXT NOT NULL,
      confidence DECIMAL(6,2),
      sample_size INT,
      used BOOLEAN DEFAULT FALSE
    )
  `);
}

async function runLearnLoop(client) {
  await ensureTables(client);

  const res = await client.query(`
    SELECT id, edit_distance, edit_categories, adapter
    FROM content_posts
    WHERE platform = 'linkedin'
      AND status IN ('approved', 'published')
      AND learning_processed = false
      AND edited_text IS NOT NULL
      AND edit_categories IS NOT NULL
  `);

  const records = res.rows;
  if (records.length === 0) {
    console.log('Nothing to process');
    return { success: true, records_processed: 0, hints_generated: 0, run_id: null };
  }

  const processGroup = (groupRecords, adapterName) => {
    let totalDist = 0, personalizations = 0, ctaChanges = 0, newsletterCTAs = 0;
    let shorter = 0, longer = 0;

    for (const rec of groupRecords) {
      totalDist += Number(rec.edit_distance || 0);

      if (rec.edit_categories) {
        if (rec.edit_categories.includes('personalization')) personalizations++;
        if (rec.edit_categories.includes('cta_change')) ctaChanges++;
        if (rec.edit_categories.includes('newsletter_cta')) newsletterCTAs++;
      }

      const origLen = (rec.original_text || '').length;
      const finalLen = (rec.edited_text || '').length;
      if (finalLen < origLen) shorter++;
      else if (finalLen > origLen) longer++;
    }

    const n = groupRecords.length;
    return {
      records_processed: n,
      avg_edit_distance: n > 0 ? (totalDist / n).toFixed(2) : '0',
      length_shorter_pct: n > 0 ? (shorter / n * 100).toFixed(2) : '0',
      length_longer_pct: n > 0 ? (longer / n * 100).toFixed(2) : '0',
      personalization_rate: n > 0 ? (personalizations / n * 100).toFixed(2) : '0',
      cta_change_rate: n > 0 ? (ctaChanges / n * 100).toFixed(2) : '0',
      newsletter_cta_rate: n > 0 ? (newsletterCTAs / n * 100).toFixed(2) : '0',
      adapter: adapterName,
      pattern_summary: `Processed ${n} records. Shorter: ${shorter}, Longer: ${longer}, Personalizations: ${personalizations}, CTA changes: ${ctaChanges}, Newsletter CTAs: ${newsletterCTAs}`
    };
  };

  // Group by adapter + aggregate
  const groups = [];
  const byAdapter = {};

  for (const rec of records) {
    const key = rec.adapter || '__null__';
    if (!byAdapter[key]) {
      byAdapter[key] = { name: rec.adapter || null, records: [] };
      groups.push(byAdapter[key]);
    }
    byAdapter[key].records.push(rec);
  }

  if (records.length > 0) {
    groups.push({ name: null, records: records });
  }

  await client.query('BEGIN');

  let totalHintsGenerated = 0;
  let aggregateRunId = null;

  try {
    for (const group of groups) {
      if (group.records.length === 0) continue;

      const stats = processGroup(group.records, group.name);

      const insertRes = await client.query(`
        INSERT INTO learn_loop_results
          (records_processed, avg_edit_distance, length_shorter_pct, length_longer_pct,
           personalization_rate, cta_change_rate, newsletter_cta_rate, adapter, pattern_summary)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        stats.records_processed, stats.avg_edit_distance, stats.length_shorter_pct, stats.length_longer_pct,
        stats.personalization_rate, stats.cta_change_rate, stats.newsletter_cta_rate,
        stats.adapter, stats.pattern_summary
      ]);

      if (group.name === null) {
        aggregateRunId = insertRes.rows[0].id;
      }

      if (stats.records_processed >= config.min_sample_size) {
        const hintsToInsert = [];
        const adapterVal = group.name || 'general';

        if (parseFloat(stats.length_shorter_pct) >= config.confidence_threshold_shorter) {
          hintsToInsert.push(['length_preference', adapterVal, 'Founder consistently trims drafts. Aim for 10-20% shorter output.', stats.length_shorter_pct, stats.records_processed]);
        } else if (parseFloat(stats.length_longer_pct) >= config.confidence_threshold_longer) {
          hintsToInsert.push(['length_preference', adapterVal, 'Founder consistently expands drafts. Generate 10-15% longer.', stats.length_longer_pct, stats.records_processed]);
        }

        if (parseFloat(stats.personalization_rate) >= config.confidence_threshold_personalization) {
          hintsToInsert.push(['personalization', adapterVal, 'Founder values personal voice. Inject first-person perspective.', stats.personalization_rate, stats.records_processed]);
        }

        if (parseFloat(stats.cta_change_rate) >= config.confidence_threshold_cta) {
          hintsToInsert.push(['cta', adapterVal, 'Founder customizes CTAs. Generate alternatives and let them choose.', stats.cta_change_rate, stats.records_processed]);
        }

        if (parseFloat(stats.newsletter_cta_rate) >= config.confidence_threshold_style) {
          hintsToInsert.push(['style', adapterVal, 'Newsletter CTA performs well with this founder.', stats.newsletter_cta_rate, stats.records_processed]);
        }

        for (const hint of hintsToInsert) {
          await client.query(`
            INSERT INTO content_engine_hints (hint_type, adapter, hint_text, confidence, sample_size)
            VALUES ($1, $2, $3, $4, $5)
          `, hint);
          totalHintsGenerated++;
        }
      }
    }

    const recordIds = records.map(r => r.id);
    await client.query(`
      UPDATE content_posts
      SET learning_processed = true
      WHERE id = ANY($1::int[])
    `, [recordIds]);

    await client.query('COMMIT');
    return { success: true, records_processed: records.length, hints_generated: totalHintsGenerated, run_id: aggregateRunId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

if (require.main === module) {
  const pool = new Pool({ connectionString: 'postgresql://superhana@localhost:5432/aloomii' });
  pool.connect()
    .then(client => {
      return runLearnLoop(client)
        .then(result => {
          console.log('Learn loop complete:', JSON.stringify(result));
          client.release();
          pool.end();
          process.exit(0);
        })
        .catch(err => {
          console.error('Learn loop error:', err.message);
          client.release();
          pool.end();
          process.exit(1);
        });
    })
    .catch(err => {
      console.error('Pool connect error:', err.message);
      pool.end();
      process.exit(1);
    });
}

module.exports = { runLearnLoop };
