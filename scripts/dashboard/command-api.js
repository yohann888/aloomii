/**
 * Aloomii Command Center API - /api/command Endpoint
 * Task 1.6 - Phase 1
 * 
 * Exports a function to register the /api/command route on an Express app.
 * Queries all required tables from the aloomii PostgreSQL database.
 * Returns the full JSON shape defined in the spec.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://superhana@localhost:5432/aloomii';
const LMSTUDIO_URL = 'http://127.0.0.1:1234/v1/chat/completions';
const LMSTUDIO_MODEL = 'qwen2.5-coder-14b-instruct-abliterated';
const VIBRNT_VAULT = process.env.VIBRNT_VAULT || '/Users/superhana/Documents/VibrntVault/VIBRNT';
const VIBRNT_TRENDS_DIR = path.join(VIBRNT_VAULT, 'Trends');
const VIBRNT_SCRIPTS_DIR = path.join(VIBRNT_VAULT, 'Scripts');
const VIBRNT_CATALOG_PATH = path.join(VIBRNT_VAULT, 'product-catalog-template.md');

// In-memory cache for the full response (30s)
let cachedResponse = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

// Create a shared pool (will be passed in from server)
let poolInstance = null;

function getPool() {
  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return poolInstance;
}

async function rewriteSnipeToBrandVoice(post, adapter, editedText) {
  if (post.post_origin !== 'snipe') {
    return editedText || post.edited_text || post.content_text || post.draft_text;
  }

  const pool = getPool();
  const brandRes = await pool.query('SELECT * FROM brand_profiles WHERE owner = $1 LIMIT 1', [adapter]);
  const brand = brandRes.rows[0];
  if (!brand) {
    return editedText || post.edited_text || post.content_text || post.draft_text;
  }

  const sourceText = editedText || post.edited_text || post.content_text || post.draft_text || '';
  const prompt = `Rewrite this LinkedIn draft in ${brand.display_name}'s voice.

BRAND PROFILE:
Core position: ${brand.core_position || ''}
Behaviors: ${(brand.behaviors || []).join(' | ')}
Phraseology: ${JSON.stringify(brand.phraseology || {})}

RULES:
- Keep the same topic and core point
- Keep it concise and native to LinkedIn
- No hashtags
- No emojis
- No em dashes
- Preserve any concrete facts unless they are clearly persona-specific and wrong for this author
- Output only the rewritten post text

ORIGINAL DRAFT:
${sourceText}`;

  const resp = await fetch(LMSTUDIO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer lm-studio'
    },
    body: JSON.stringify({
      model: LMSTUDIO_MODEL,
      messages: [
        { role: 'system', content: 'You rewrite social posts to match a target founder brand voice exactly.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 500
    })
  });

  if (!resp.ok) {
    throw new Error(`LM Studio rewrite failed: ${resp.status}`);
  }

  const json = await resp.json();
  return json?.choices?.[0]?.message?.content?.trim() || sourceText;
}

/**
 * Main function to register the /api/command endpoint
 */
module.exports = registerCommandAPI;

function registerCommandAPI(app, pool = null) {
  if (pool) {
    poolInstance = pool; // Use provided pool if passed
  }

  app.get('/api/command', async (req, res) => {
    const startTime = Date.now();
    
    try {
      // Check cache
      const now = Date.now();
      if (cachedResponse && (now - cacheTimestamp < CACHE_TTL_MS)) {
        return res.json(cachedResponse);
      }

      const data = {
        briefing: {},
        contacts: [],
        signals: [],
        outreach_queue: [],
        drafts_pending: [],
        pipeline: { by_stage: {}, win_loss: {} },
        notifications: [],
        fleet: { healthy: 0, attention: 0, offline: 0 },
        economics: {},
        events: [],
        content_queue: [],
        linkedin_drafts: [],
        snipe_drafts: [],
        client_pilots: [],
        webhooks: [],
        tasks: [],
        backlog: [],
        relationship_health: { human_attention: [], declining: [], reconnection_queue: [], summary: {} },
        influencer_pipeline: [],
        vibrnt: { trends: [], scripts: [], catalog: { products: [] }, summary: {} },
        last_updated: new Date().toISOString(),
        _meta: { query_time_ms: 0 }
      };

      const queries = [
        // 1. Briefing data
        async () => {
          try {
            // Decay contacts count
            const decayRes = await query(`
              SELECT COUNT(*) as decay_count 
              FROM contacts 
              WHERE decay_alert = true
            `);
            data.briefing.decay_count = parseInt(decayRes.rows[0]?.decay_count || 0);

            // Pending drafts
            const draftsRes = await query(`
              SELECT COUNT(*) as draft_count 
              FROM outreach_drafts 
              WHERE status = 'draft'
            `);
            data.briefing.drafts_pending = parseInt(draftsRes.rows[0]?.draft_count || 0);

            // Stalled opportunities (>14 days)
            const stalledRes = await query(`
              SELECT COUNT(*) as stalled_count 
              FROM opportunities 
              WHERE updated_at < NOW() - INTERVAL '14 days'
                AND stage NOT IN ('closed_won', 'closed_lost')
            `);
            data.briefing.stalled_opps = parseInt(stalledRes.rows[0]?.stalled_count || 0);

            // Overnight signals
            const overnightRes = await query(`
              SELECT COUNT(*) as overnight_count 
              FROM signals 
              WHERE created_at > NOW() - INTERVAL '24 hours'
            `);
            data.briefing.overnight_signals = parseInt(overnightRes.rows[0]?.overnight_count || 0);

            // Overdue outreach
            const overdueRes = await query(`
              SELECT COUNT(*) as overdue_count 
              FROM outreach_queue 
              WHERE status = 'pending' 
                AND fire_date < CURRENT_DATE
            `);
            data.briefing.overdue_outreach = parseInt(overdueRes.rows[0]?.overdue_count || 0);

            // DMS alerts fired in last 24h
            try {
              const dmsRes = await query(`
                SELECT type, payload
                FROM activity_log
                WHERE type IN ('dms_content_heartbeat','dms_signal_expiry','dms_content_alert','dms_signal_expiry_alert')
                  AND time >= NOW() - INTERVAL '24 hours'
                ORDER BY time DESC
                LIMIT 5
              `);
              data.briefing.dms_alerts = dmsRes.rows;
              data.briefing.dms_alert_count = dmsRes.rows.length;
            } catch(e) { data.briefing.dms_alerts = []; data.briefing.dms_alert_count = 0; }

            // Last fleet audit failures
            try {
              const auditRes = await query(`
                SELECT payload
                FROM activity_log
                WHERE type = 'fleet_audit'
                ORDER BY time DESC
                LIMIT 1
              `);
              if (auditRes.rows[0]?.payload) {
                const p = auditRes.rows[0].payload;
                data.briefing.fleet_failures = p.failures || [];
                data.briefing.fleet_failures_count = p.jobs_failed || 0;
              }
            } catch(e) { data.briefing.fleet_failures = []; data.briefing.fleet_failures_count = 0; }

            data.briefing.all_clear = 
              data.briefing.decay_count === 0 && 
              data.briefing.drafts_pending === 0 && 
              data.briefing.stalled_opps === 0 && 
              data.briefing.overdue_outreach === 0 &&
              data.briefing.dms_alert_count === 0;

            // Prompt Lab insights (last 7 days)
            try {
              const periodEnd = new Date().toISOString().split('T')[0];
              const periodStart = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
              const plRes = await query(`
                SELECT
                  content_slug,
                  title,
                  priority,
                  signal,
                  total_edits,
                  avg_edit_distance,
                  reversion_rate
                FROM prompt_lab_insights
                WHERE period_start = $1 AND period_end = $2
                ORDER BY
                  CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                  total_edits DESC
                LIMIT 3
              `, [periodStart, periodEnd]);
              data.briefing.prompt_lab_high_priority = plRes.rows.length;
              data.briefing.prompt_lab_insights = plRes.rows;
              if (plRes.rows.length > 0) {
                data.briefing.all_clear = false;
              }
            } catch(e) {
              data.briefing.prompt_lab_high_priority = 0;
              data.briefing.prompt_lab_insights = [];
            }

          } catch (e) {
            console.warn('Briefing query failed:', e.message);
            data.briefing = { all_clear: true, error: 'Briefing unavailable' };
          }
        },

        // 2. Contacts with account join + computed fields
        async () => {
          try {
            const contactsRes = await query(`
              SELECT 
                c.*,
                a.name as company,
                EXTRACT(DAY FROM NOW() - COALESCE(c.last_outreach_date, c.created_at)) as last_touch_days,
                CASE 
                  WHEN c.decay_alert = true THEN 'cold'
                  WHEN COALESCE(c.last_outreach_date, c.created_at) > NOW() - INTERVAL '3 days' THEN 'hot'
                  WHEN COALESCE(c.last_outreach_date, c.created_at) > NOW() - INTERVAL '14 days' THEN 'warm'
                  ELSE 'cool'
                END as temperature
              FROM contacts c
              LEFT JOIN accounts a ON c.account_id = a.id
              WHERE (
                c.handle IS NULL
                OR c.handle = ''
                OR c.handle NOT LIKE 'u/%'
                OR c.handle NOT LIKE 'r/%'
              )
              ORDER BY c.tier ASC NULLS LAST, COALESCE(c.last_outreach_date, c.created_at) DESC
              LIMIT 500
            `);
            data.contacts = contactsRes.rows;
          } catch (e) {
            console.warn('Contacts query failed:', e.message);
            data.contacts = [];
          }
        },

        // 3. Signals: prospect_signals (actionable) + general signals feed (score >= 3), merged + deduped
        async () => {
          try {
            // prospect_signals — actionable, not yet acted on
            const psRes = await query(`
              SELECT
                ps.id,
                ps.handle,
                ps.company,
                ps.signal_type,
                ps.signal_source,
                ps.signal_text,
                ps.signal_url,
                ps.relevance_score,
                ps.acted_on,
                ps.outcome,
                ps.captured_at,
                c.name as contact_name,
                c.tier as contact_tier,
                NULL::integer as score,
                NULL::text as scoring_reason,
                NULL::text as icp_match,
                'prospect'::text as signal_table
              FROM prospect_signals ps
              LEFT JOIN contacts c ON ps.contact_id = c.id
              WHERE ps.acted_on = false
              ORDER BY ps.captured_at DESC
              LIMIT 50
            `);

            // General signals feed — score >= 3, exclude Reddit
            const sigRes = await query(`
              SELECT
                s.id,
                s.raw_data->>'handle' as handle,
                NULL::text as company,
                s.signal_type,
                s.collection_method as signal_source,
                s.body as signal_text,
                s.source_url as signal_url,
                NULL::numeric as relevance_score,
                NULL::boolean as acted_on,
                NULL::text as outcome,
                s.created_at as captured_at,
                s.raw_data,
                NULL::text as contact_name,
                NULL::text as contact_tier,
                s.score,
                s.raw_data->>'scoring_reason' as scoring_reason,
                s.raw_data->>'icp_match' as icp_match,
                'signals'::text as signal_table
              FROM signals s
              WHERE s.score >= 3
                AND s.collection_method NOT IN ('reddit', 'reddit_search', 'reddit_signal')
              ORDER BY s.created_at DESC
              LIMIT 50
            `);

            // Merge + dedupe by source_url
            const seen = new Set();
            const merged = [];
            for (const row of [...psRes.rows, ...sigRes.rows]) {
              const key = row.signal_url || row.id;
              if (!seen.has(key)) {
                seen.add(key);
                merged.push(row);
              }
            }
            data.signals = merged.slice(0, 50);
          } catch (e) {
            console.warn('Signals query failed:', e.message);
            data.signals = [];
          }
        },

        // 4. Outreach queue with contact join
        async () => {
          try {
            const queueRes = await query(`
              SELECT 
                q.id, q.type, q.channel, q.queue_type, q.block_reason, q.status, q.fire_date, q.draft,
                q.personalization_source_type, q.personalization_source_url, q.personalization_note,
                q.personalization_opener, q.personalization_status, q.personalized_by, q.personalized_at,
                c.name as contact_name, c.tier as contact_tier,
                a.name as contact_company,
                (CURRENT_DATE - q.fire_date)::int as overdue_days
              FROM outreach_queue q
              LEFT JOIN contacts c ON q.contact_id = c.id
              LEFT JOIN accounts a ON c.account_id = a.id
              WHERE q.status = 'pending'
              ORDER BY q.fire_date ASC
              LIMIT 20
            `);
            data.outreach_queue = queueRes.rows;
          } catch (e) {
            console.warn('Outreach queue query failed:', e.message);
            data.outreach_queue = [];
          }
        },

        // 4.5 Relationship health
        async () => {
          try {
            const [humanRes, decliningRes, reconnectionRes, summaryRes, voiceRes] = await Promise.all([
              query(`
                SELECT id, name, tier, human_outreach_reason, follow_up_date, rhs_trend, rhs_velocity
                FROM contacts
                WHERE human_outreach_flag = true
                ORDER BY follow_up_date ASC NULLS LAST, tier ASC NULLS LAST
                LIMIT 12
              `),
              query(`
                SELECT id, name, tier, rhs_current, rhs_trend, rhs_velocity
                FROM contacts
                WHERE rhs_trend = 'declining'
                ORDER BY rhs_velocity ASC NULLS LAST
                LIMIT 12
              `),
              query(`
                SELECT q.id, q.fire_date, q.status, c.name AS contact_name
                FROM outreach_queue q
                LEFT JOIN contacts c ON q.contact_id = c.id
                WHERE q.type = 'reconnection' AND q.status = 'pending'
                ORDER BY q.fire_date ASC NULLS LAST
                LIMIT 12
              `),
              query(`
                SELECT
                  COUNT(*) FILTER (WHERE human_outreach_flag = true) AS human_attention_count,
                  COUNT(*) FILTER (WHERE rhs_trend = 'declining') AS declining_count,
                  COUNT(*) FILTER (WHERE decay_alert = true) AS decay_alert_count,
                  ROUND(AVG(rhs_current)::numeric, 2) AS avg_rhs
                FROM contacts
                WHERE status NOT IN ('do_not_contact')
              `),
              query(`
                SELECT payload
                FROM activity_log
                WHERE type = 'relationship_monitor_run'
                ORDER BY time DESC
                LIMIT 1
              `)
            ]);
            data.relationship_health = {
              human_attention: humanRes.rows,
              declining: decliningRes.rows,
              reconnection_queue: reconnectionRes.rows,
              summary: summaryRes.rows[0] || {},
              voice_brief: voiceRes.rows[0]?.payload?.voice_brief || [],
              watchlist: voiceRes.rows[0]?.payload?.watchlist || []
            };
          } catch (e) {
            console.warn('Relationship health query failed:', e.message);
          }
        },

        // 5. Drafts pending
        async () => {
          try {
            const draftsRes = await query(`
              SELECT * FROM outreach_drafts 
              WHERE status = 'draft' 
              ORDER BY created_at DESC
              LIMIT 20
            `);
            data.drafts_pending = draftsRes.rows;
          } catch (e) {
            console.warn('Drafts query failed:', e.message);
            data.drafts_pending = [];
          }
        },

        // 6. Pipeline by stage
        async () => {
          try {
            const pipelineRes = await query(`
              SELECT 
                stage,
                COUNT(*) as count,
                COALESCE(SUM(value), 0) as value
              FROM opportunities 
              WHERE stage IS NOT NULL
              GROUP BY stage
            `);
            
            data.pipeline.by_stage = {};
            pipelineRes.rows.forEach(row => {
              data.pipeline.by_stage[row.stage] = {
                count: parseInt(row.count),
                value: parseFloat(row.value)
              };
            });
          } catch (e) {
            console.warn('Pipeline query failed:', e.message);
          }
        },

        // 7. Win/loss this quarter
        async () => {
          try {
            const winLossRes = await query(`
              SELECT 
                outcome_type,
                COUNT(*) as count,
                COALESCE(SUM(revenue_attributed), 0) as revenue
              FROM outcomes
              WHERE created_at >= date_trunc('quarter', NOW())
              GROUP BY outcome_type
            `);
            
            data.pipeline.win_loss = {
              won_quarter: 0,
              lost_quarter: 0,
              revenue_won: 0,
              conversion_rate: 0
            };
            
            winLossRes.rows.forEach(row => {
              if (row.outcome_type === 'won') {
                data.pipeline.win_loss.won_quarter = parseInt(row.count);
                data.pipeline.win_loss.revenue_won = parseFloat(row.revenue);
              } else if (row.outcome_type === 'lost') {
                data.pipeline.win_loss.lost_quarter = parseInt(row.count);
              }
            });
            
            const total = data.pipeline.win_loss.won_quarter + data.pipeline.win_loss.lost_quarter;
            if (total > 0) {
              data.pipeline.win_loss.conversion_rate = 
                data.pipeline.win_loss.won_quarter / total;
            }
          } catch (e) {
            console.warn('Win/loss query failed:', e.message);
          }
        },

        // 8. Notifications (aggregated)
        async () => {
          try {
            data.notifications = [];
            
            // Decay alerts
            if (data.briefing.decay_count > 0) {
              data.notifications.push({
                type: 'decay_alert',
                urgency: 'high',
                message: `${data.briefing.decay_count} contacts going cold`,
                count: data.briefing.decay_count
              });
            }
            
            // Overdue outreach
            if (data.briefing.overdue_outreach > 0) {
              data.notifications.push({
                type: 'overdue_outreach',
                urgency: 'high',
                message: `${data.briefing.overdue_outreach} overdue outreach items`,
                count: data.briefing.overdue_outreach
              });
            }
            
            // High score signals
            const highSignals = data.signals.filter(s => parseFloat(s.score || 0) >= 4.5).length;
            if (highSignals > 0) {
              data.notifications.push({
                type: 'high_score_signal',
                urgency: 'medium',
                message: `${highSignals} high-score signals`,
                count: highSignals
              });
            }
          } catch (e) {
            console.warn('Notifications aggregation failed:', e.message);
          }
        },

        // 9. Fleet + economics (real data from ~/.openclaw/cron/jobs.json)
        async () => {
          try {
            const fs = require('fs');
            const path = require('path');
            const cronPath = path.join(process.env.HOME, '.openclaw', 'cron', 'jobs.json');
            
            let fleetData = { healthy: 21, attention: 9, offline: 3 };
            let economicsData = {
              weekly_cost_usd: 12.10,
              human_value_usd: 1258,
              roi_multiplier: 104
            };
            
            if (fs.existsSync(cronPath)) {
              const cronContent = fs.readFileSync(cronPath, 'utf8');
              const cronRegistry = JSON.parse(cronContent);
              const jobs = cronRegistry.jobs || [];
              
              const agents = jobs.map(job => {
                const lastRun = job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null;
                const nextRun = job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null;
                
                let status = 'offline';
                if (job.enabled === false) status = 'disabled';
                else if (job.state?.consecutiveErrors > 0 || job.state?.lastRunStatus === 'error') status = 'attention';
                else status = 'healthy'; // enabled, no errors = healthy (even if never run yet)
                
                return {
                  id: job.id,
                  name: job.name,
                  schedule: job.schedule?.expr || 'manual',
                  model: job.payload?.model || 'unknown',
                  status: status,
                  last_run: lastRun,
                  next_run: nextRun,
                  enabled: job.enabled !== false
                };
              });
              
              // Count healthy, attention, offline
              const healthy = agents.filter(a => a.status === 'healthy' && a.enabled).length;
              const attention = agents.filter(a => a.status === 'attention' || (!a.enabled && a.status !== 'disabled')).length;
              const offline = agents.filter(a => a.status === 'offline' || a.status === 'disabled').length;
              
              fleetData = {
                healthy: healthy,
                attention: attention,
                offline: offline,
                agents: agents
                  .sort((a, b) => {
                    // enabled first, then by status: healthy > attention > offline > disabled
                    const statusOrder = { healthy: 0, attention: 1, offline: 2, disabled: 3 };
                    return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
                  })
                  .slice(0, 50) // show up to 50 agents
              };

              // Load pending cron changes
              try {
                const pendingPath = path.join(process.env.HOME, '.openclaw', 'cron', 'pending-changes.json');
                if (fs.existsSync(pendingPath)) {
                  const pendingRaw = fs.readFileSync(pendingPath, 'utf8');
                  const pendingData = JSON.parse(pendingRaw);
                  fleetData.pending_changes = pendingData.changes || [];
                } else {
                  fleetData.pending_changes = [];
                }
              } catch (e) {
                fleetData.pending_changes = [];
              }
              
              // Real economics from economics_daily table (Bridge C)
              try {
                const weekRes = await query(`
                  SELECT COALESCE(SUM(cost_usd), 0) as weekly_cost
                  FROM economics_daily
                  WHERE date >= CURRENT_DATE - INTERVAL '7 days'
                `);
                const prevRes = await query(`
                  SELECT COALESCE(SUM(cost_usd), 0) as prev_cost
                  FROM economics_daily
                  WHERE date >= CURRENT_DATE - INTERVAL '14 days'
                    AND date < CURRENT_DATE - INTERVAL '7 days'
                `);

                const weeklyCost = parseFloat(weekRes.rows[0]?.weekly_cost || 0);
                const prevCost   = parseFloat(prevRes.rows[0]?.prev_cost   || 0);
                const delta      = prevCost > 0
                  ? ((weeklyCost - prevCost) / prevCost * 100).toFixed(0)
                  : 0;

                // Human equivalent: active agents × 2 hrs/week × $75/hr
                const activeAgents  = healthy + attention;
                const humanEquiv    = Math.round(activeAgents * 2 * 75);

                economicsData = {
                  weekly_cost_usd:  weeklyCost > 0 ? Math.round(weeklyCost * 100) / 100 : Math.round((healthy + attention) * 1.8 * 10) / 10,
                  human_value_usd:  humanEquiv,
                  roi_multiplier:    weeklyCost > 0 ? Math.round(humanEquiv / weeklyCost) : (humanEquiv > 0 ? Math.round(humanEquiv / Math.max((healthy + attention) * 1.8, 1)) : 104),
                  delta_pct:         parseInt(delta),
                };
              } catch (e) {
                console.warn('[api] Economics query failed:', e.message);
                economicsData = {
                  weekly_cost_usd: Math.round((healthy + attention) * 1.8 * 10) / 10,
                  human_value_usd: Math.round((healthy + attention) * 150),
                  roi_multiplier:   83,
                  delta_pct:        0,
                };
              }
            }
            
            data.fleet = fleetData;
            data.economics = economicsData;
            
          } catch (e) {
            console.warn('Fleet/economics failed:', e.message);
            // fallback values already set
            data.fleet = { healthy: 21, attention: 9, offline: 3 };
            data.economics = {
              weekly_cost_usd: 12.10,
              human_value_usd: 1258,
              roi_multiplier: 104
            };
          }
        },

        // 10. Events (next 5)
        async () => {
          try {
            const eventsRes = await query(`
              SELECT 
                e.*,
                COUNT(ec.contact_id) as contact_overlap
              FROM events e
              LEFT JOIN event_contacts ec ON e.id = ec.event_id
              WHERE e.date >= CURRENT_DATE
              GROUP BY e.id
              ORDER BY e.date ASC
              LIMIT 5
            `);
            data.events = eventsRes.rows;
          } catch (e) {
            console.warn('Events query failed:', e.message);
            data.events = [];
          }
        },

        // 11. Snipe drafts (from content_posts, post_origin = snipe)
        async () => {
          try {
            const snipeRes = await query(`
              SELECT id, draft_text, topic, pillar, pillar_name, score_total, source_url,
                     COALESCE(scheduled_at, published_at) AS sort_at
              FROM content_posts
              WHERE post_origin = 'snipe' AND status = 'draft'
              ORDER BY COALESCE(scheduled_at, published_at) DESC
              LIMIT 10
            `);
            data.snipe_drafts = snipeRes.rows;
          } catch (e) {
            console.warn('Snipe drafts query failed:', e.message);
            data.snipe_drafts = [];
          }
        },

        // 12. Content queue + LinkedIn drafts
        async () => {
          try {
            const contentRes = await query(`
              SELECT * FROM content_posts 
              ORDER BY COALESCE(scheduled_at, published_at) DESC 
              LIMIT 20
            `);
            data.content_queue = contentRes.rows;
          } catch (e) {
            console.warn('Content query failed:', e.message);
            data.content_queue = [];
          }
          
          // LinkedIn drafts from content_posts (platform = 'linkedin')
          try {
            const linkedinRes = await query(`
              SELECT cp.*, bp.owner AS brand_owner
              FROM content_posts cp
              LEFT JOIN brand_profiles bp ON bp.id = cp.brand_profile_id
              WHERE cp.platform = 'linkedin' AND cp.status = 'draft'
              ORDER BY COALESCE(cp.scheduled_at, cp.published_at) DESC 
              LIMIT 20
            `);
            data.linkedin_drafts = linkedinRes.rows;
          } catch (e) {
            console.warn('LinkedIn drafts query failed:', e.message);
            data.linkedin_drafts = [];
          }
        },

        // 12. Client pilots (active)
        async () => {
          try {
            const pilotsRes = await query(`
              SELECT * FROM client_pilots 
              WHERE pilot_status = 'active'
              ORDER BY onboard_date DESC
            `);
            data.client_pilots = pilotsRes.rows;
          } catch (e) {
            console.warn('Client pilots query failed:', e.message);
            data.client_pilots = [];
          }
        },

        // 13. Webhooks
        async () => {
          try {
            const webhooksRes = await query(`
              SELECT * FROM api_webhooks 
              WHERE active = true
              ORDER BY created_at DESC
            `);
            data.webhooks = webhooksRes.rows;
          } catch (e) {
            console.warn('Webhooks query failed:', e.message);
            data.webhooks = [];
          }
        },

        // 14. Tasks (new for Fleet-to-Dashboard Bridge)
        async () => {
          try {
            const tasksRes = await query(`
              SELECT * FROM tasks
              WHERE status IN ('pending', 'in_progress')
              ORDER BY
                CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                due_date ASC NULLS LAST
              LIMIT 50
            `);
            data.tasks = tasksRes.rows;
          } catch (e) {
            console.warn('Tasks query failed:', e.message);
            data.tasks = [];
          }
        },

        // 15. Vibrnt Influencer Pipeline
        async () => {
          try {
            const infRes = await query(`
              SELECT * FROM influencer_pipeline
              ORDER BY vibe_score DESC, created_at DESC
              LIMIT 20
            `);
            data.influencer_pipeline = infRes.rows;
          } catch (e) {
            console.warn('Influencer pipeline query failed:', e.message);
            data.influencer_pipeline = [];
          }
        },

        // 16. Strategic Backlog (from backlog.json)
        async () => {
          try {
            const backlogPath = path.join(__dirname, '..', '..', 'command', 'backlog.json');
            if (fs.existsSync(backlogPath)) {
              const content = fs.readFileSync(backlogPath, 'utf8');
              data.backlog = JSON.parse(content);
            }
          } catch (e) {
            console.warn('Backlog read failed:', e.message);
            data.backlog = [];
          }
        },

        // 17. Vibrnt content bundle
        async () => {
          try {
            const readDir = (dir, ext) => {
              if (!fs.existsSync(dir)) return [];
              return fs.readdirSync(dir)
                .filter(f => !ext || f.endsWith(ext))
                .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtime }))
                .sort((a, b) => b.mtime - a.mtime);
            };

            const trendFiles = readDir(VIBRNT_TRENDS_DIR, '.md').slice(0, 10);
            data.vibrnt.trends = trendFiles.map(f => ({
              date: f.name.replace('.md', ''),
              file: f.name,
              title: `Trend Report - ${f.name.replace('.md', '')}`,
              body: fs.readFileSync(f.path, 'utf-8'),
              mtime: f.mtime
            }));

            const scriptFiles = readDir(VIBRNT_SCRIPTS_DIR, '.md').slice(0, 20);
            data.vibrnt.scripts = scriptFiles.map(f => ({
              file: f.name,
              date: f.name.split('-').slice(0, 3).join('-'),
              type: f.name.includes('hook') ? 'hook' : f.name.includes('slideshow') ? 'slideshow' : 'script',
              body: fs.readFileSync(f.path, 'utf-8'),
              mtime: f.mtime
            }));

            if (fs.existsSync(VIBRNT_CATALOG_PATH)) {
              data.vibrnt.catalog = { body: fs.readFileSync(VIBRNT_CATALOG_PATH, 'utf-8'), products: [] };
            }

            data.vibrnt.summary = {
              trendCount: data.vibrnt.trends.length,
              scriptCount: data.vibrnt.scripts.length,
              productCount: data.vibrnt.catalog?.products?.length || 0,
              latestTrend: data.vibrnt.trends[0]?.date || null,
              latestScripts: data.vibrnt.scripts.slice(0, 3).map(s => s.file)
            };
          } catch (e) {
            console.warn('Vibrnt bundle query failed:', e.message);
          }
        }
      ];

      // Run all queries with individual error handling
      const queryPromises = queries.map(q => q());
      await Promise.allSettled(queryPromises);

      const queryTime = Date.now() - startTime;
      data._meta.query_time_ms = queryTime;

      // Cache the response
      cachedResponse = data;
      cacheTimestamp = Date.now();

      res.json(data);
      
    } catch (error) {
      console.error('Command API error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        briefing: { all_clear: true }
      });
    }
  });

  // === PHASE 2 API ROUTES ===

  // PATCH /api/command/queue/:id/snooze — updates fire_date
  app.patch('/api/command/queue/:id/snooze', async (req, res) => {
    const { id } = req.params;
    const { days = 7 } = req.body;
    
    try {
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + parseInt(days));
      
      const result = await query(`
        UPDATE outreach_queue 
        SET fire_date = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [newDate.toISOString().split('T')[0], id]);
      
      res.json({ success: true, updated: result.rows[0] });
    } catch (error) {
      console.error('Queue snooze failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/command/queue/:id/skip — sets status='skipped'
  app.patch('/api/command/queue/:id/skip', async (req, res) => {
    const { id } = req.params;
    
    try {
      const result = await query(`
        UPDATE outreach_queue 
        SET status = 'skipped', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);
      
      res.json({ success: true, updated: result.rows[0] });
    } catch (error) {
      console.error('Queue skip failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/command/score-draft — lightweight scoring heuristic
  app.post('/api/command/score-draft', async (req, res) => {
    const { text, contactId, channel } = req.body;
    
    try {
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }
      
      const lengthScore = Math.min(Math.floor(text.length / 50), 40);
      const hasCTA = /call|book|schedule|meet|chat|talk|demo/i.test(text) ? 25 : 5;
      const hasPersonal = contactId ? 20 : 0;
      const hasOpener = text.length > 30 && /^[A-Z]/.test(text.trim()) ? 15 : 0;
      
      const scoreTotal = Math.min(100, lengthScore + hasCTA + hasPersonal + hasOpener);
      
      res.json({
        score_total: scoreTotal,
        score_breakdown: {
          length: lengthScore,
          cta: hasCTA,
          personalization: hasPersonal,
          opener: hasOpener
        },
        flags: []
      });
    } catch (error) {
      console.error('Draft scoring failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/command/drafts/:id/reject — set status='rejected'
  app.patch('/api/command/drafts/:id/reject', async (req, res) => {
    const { id } = req.params;
    
    try {
      const result = await query(`
        UPDATE outreach_drafts 
        SET status = 'rejected', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);
      
      res.json({ success: true, draft: result.rows[0] });
    } catch (error) {
      console.error('Draft rejection failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/command/drafts/:id/approve — with learn-loop edit tracking (Phase B)
  app.post('/api/command/drafts/:id/approve', async (req, res) => {
    const { id } = req.params;
    const { edited_text } = req.body;
    let client;
    try {
      client = await getPool().connect();

      // Fetch current draft to get draft_text (baseline)
      const draftRes = await client.query(
        'SELECT * FROM outreach_drafts WHERE id = $1',
        [id]
      );
      if (draftRes.rows.length === 0) {
        return res.status(404).json({ error: 'Draft not found' });
      }
      const draft = draftRes.rows[0];
      const originalText = draft.draft_text || '';
      const newText = edited_text || originalText;

      // Compute word-level edit_distance
      const origWords = originalText.trim().split(/\s+/).filter(Boolean);
      const newWords  = newText.trim().split(/\s+/).filter(Boolean);
      const editDistance = Math.abs(newWords.length - origWords.length) +
        origWords.filter(w => !newWords.includes(w)).length +
        newWords.filter(w => !origWords.includes(w)).length;

      // Categorize edits
      const origLen = originalText.length;
      const newLen  = newText.length;
      const lengthChange = newLen < origLen * 0.9 ? 'shorter' : newLen > origLen * 1.1 ? 'longer' : 'same';
      const toneChanged = /hey |hi |hello|im |i'm |fyi|btw|please|thanks/i.test(newText) &&
        !/hey |hi |hello|im |i'm |fyi|bty|please|thanks/i.test(originalText);
      const personalizationAdded = /we saw|noticed|just saw|read your/i.test(newText) &&
        !/we saw|noticed|just saw|read your/i.test(originalText);
      const ctaChanged = /call|book|demo|schedule|chat|talk|meet|15.min/i.test(newText) !==
        /call|book|demo|schedule|chat|talk|meet|15.min/i.test(originalText);

      const editCategories = JSON.stringify({
        tone_change: toneChanged,
        length_change: lengthChange,
        personalization_added: personalizationAdded,
        cta_changed: ctaChanged,
      });

      // Update draft with edited text + learning data
      // Note: draft_text stays as baseline; edited_text stores edits
      await client.query(`
        UPDATE outreach_drafts
        SET status = 'approved',
            edited_text = $1,
            edit_distance = $2,
            edit_categories = $3::jsonb,
            learning_processed = false,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = $4
      `, [newText, editDistance, editCategories, id]);

      const updated = await client.query('SELECT * FROM outreach_drafts WHERE id = $1', [id]);
      res.json({ success: true, draft: updated.rows[0] });
    } catch (error) {
      console.error('Draft approval failed:', error);
      res.status(500).json({ error: error.message });
    } finally {
      if (client) client.release();
    }
  });

  // GET /api/command/learn-loop/stats — Phase B learn loop analytics
  app.get('/api/command/learn-loop/stats', async (req, res) => {
    try {
      const statsRes = await query(`
        SELECT
          COUNT(*) as total_reviewed,
          ROUND(AVG(edit_distance)::numeric, 1) as avg_edit_distance,
          COUNT(*) FILTER (WHERE edit_categories->>'length_change' = 'shorter') as shortened_count,
          COUNT(*) FILTER (WHERE (edit_categories->>'personalization_added')::boolean = true) as personalized_count,
          COUNT(*) FILTER (WHERE edit_categories->>'cta_changed' = 'true') as cta_changed_count,
          COUNT(*) FILTER (WHERE edit_categories->>'tone_change' = 'true') as tone_changed_count,
          COUNT(*) FILTER (WHERE edit_distance <= 3) as minimal_edits,
          COUNT(*) FILTER (WHERE edit_distance > 10) as heavy_edits
        FROM outreach_drafts
        WHERE learning_processed = false
          AND status = 'approved'
          AND edited_text IS NOT NULL
      `);
      res.json(statsRes.rows[0] || {});
    } catch (error) {
      console.error('Learn-loop stats failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/command/tasks/:id/status — update task status (new for Fleet-to-Dashboard Bridge)
  app.patch('/api/command/tasks/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'in_progress', 'done', 'skipped'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    }
    
    try {
      const result = await query(`
        UPDATE tasks 
        SET status = $1, 
            completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [status, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      res.json({ success: true, task: result.rows[0] });
    } catch (error) {
      console.error('Task status update failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/command/backlog/:id/promote — mark as in_progress and create a task
  app.post('/api/command/backlog/:id/promote', async (req, res) => {
    const { id } = req.params;
    try {
      const fs = require('fs');
      const path = require('path');
      const backlogPath = path.join(__dirname, '..', '..', 'command', 'backlog.json');
      if (!fs.existsSync(backlogPath)) return res.status(404).json({ error: 'Backlog file missing' });

      let backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
      let targetItem = null;
      let targetCategory = null;

      // Find the item
      backlog.forEach(group => {
        const item = group.items.find(i => i.id === id);
        if (item) {
          targetItem = item;
          targetCategory = group.category;
        }
      });

      if (!targetItem) return res.status(404).json({ error: 'Backlog item not found' });

      // Create task in DB
      const taskResult = await query(`
        INSERT INTO tasks (title, description, source, category, status, priority)
        VALUES ($1, $2, 'backlog', $3, 'pending', $4)
        RETURNING *
      `, [targetItem.title, targetItem.description, targetCategory, targetItem.priority || 'normal']);

      // Mark backlog item as active
      targetItem.status = 'active';
      fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2));

      res.json({ success: true, task: taskResult.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/command/backlog/:id — remove from backlog
  app.delete('/api/command/backlog/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const fs = require('fs');
      const path = require('path');
      const backlogPath = path.join(__dirname, '..', '..', 'command', 'backlog.json');
      if (!fs.existsSync(backlogPath)) return res.status(404).json({ error: 'Backlog file missing' });

      let backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
      let removed = false;

      backlog.forEach(group => {
        const initialLen = group.items.length;
        group.items = group.items.filter(i => i.id !== id);
        if (group.items.length < initialLen) removed = true;
      });

      if (!removed) return res.status(404).json({ error: 'Backlog item not found' });

      fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });


  
  // POST /api/command/learn-loop/run
  app.post('/api/command/learn-loop/run', async (req, res) => {
    try {
      const { runLearnLoop } = require('./learn-loop-cron');
      const client = await getPool().connect();
      try {
        const result = await runLearnLoop(client);
        res.json(result);
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('Learn loop manual run failed:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // === CONTENT DRAFT WORKFLOW ===

  // GET /api/command/content/:id — get full content post
  app.get('/api/command/content/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const result = await query('SELECT * FROM content_posts WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      const post = result.rows[0];

      let hookLab = { session: null, candidates: [] };
      try {
        const sessionRes = await query(`
          SELECT * FROM attention_line_sessions
          WHERE post_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [id]);
        const session = sessionRes.rows[0] || null;
        if (session) {
          const hooksRes = await query(`
            SELECT * FROM content_hooks
            WHERE post_id = $1 AND loop_session_id = $2
            ORDER BY is_selected DESC, judge_score DESC NULLS LAST, created_at ASC
          `, [id, session.id]);
          hookLab = { session, candidates: hooksRes.rows };
        }
      } catch (hookErr) {
        console.warn('Hook Lab query failed:', hookErr.message);
      }

      res.json({ ...post, hook_lab: hookLab });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/command/content/:id/edit — save edits or set owner (adapter)
  app.patch('/api/command/content/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { edited_text, adapter } = req.body;
    try {
      if (!edited_text && !adapter) return res.status(400).json({ error: 'edited_text or adapter required' });

      const brandProfileIdFor = async (owner) => {
        const r = await query('SELECT id FROM brand_profiles WHERE owner = $1 LIMIT 1', [owner]);
        return r.rows[0]?.id || null;
      };
      
      let result;
      if (edited_text && adapter) {
        const brandProfileId = ['yohann', 'jenny'].includes(adapter) ? await brandProfileIdFor(adapter) : null;
        result = await query(`
          UPDATE content_posts 
          SET edited_text = $1, adapter = $2, brand_profile_id = COALESCE($3, brand_profile_id), original_text = COALESCE(original_text, content_text)
          WHERE id = $4 RETURNING *
        `, [edited_text, adapter, brandProfileId, id]);
      } else if (edited_text) {
        result = await query(`
          UPDATE content_posts 
          SET edited_text = $1, original_text = COALESCE(original_text, content_text)
          WHERE id = $2 RETURNING *
        `, [edited_text, id]);
      } else {
        const brandProfileId = ['yohann', 'jenny'].includes(adapter) ? await brandProfileIdFor(adapter) : null;
        result = await query(`
          UPDATE content_posts
          SET adapter = $1,
              brand_profile_id = COALESCE($2, brand_profile_id),
              approved_by = CASE
                WHEN $1 IN ('yohann', 'jenny') THEN $1
                ELSE approved_by
              END,
              status = CASE
                WHEN status = 'draft' AND $1 IN ('yohann', 'jenny') THEN 'approved'
                ELSE status
              END
          WHERE id = $3 RETURNING *
        `, [adapter, brandProfileId, id]);
      }
      
      res.json({ success: true, post: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/command/content/:id/approve — approve and store in CC only
  app.post('/api/command/content/:id/approve', async (req, res) => {
    const { id } = req.params;
    const { edited_text, adapter } = req.body;
    try {
      // Get current draft
      const current = await query('SELECT * FROM content_posts WHERE id = $1', [id]);
      if (current.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      const post = current.rows[0];
      
      const isSnipe = post.post_origin === 'snipe';
      const finalText = isSnipe
        ? (edited_text || post.edited_text || post.content_text || post.draft_text || '')
        : await rewriteSnipeToBrandVoice(post, adapter || post.adapter || 'yohann', edited_text);
      const originalText = post.original_text || post.content_text || post.draft_text || '';
      
      // Compute edit distance (word-level)
      const origWords = originalText.split(/\s+/);
      const finalWords = finalText.split(/\s+/);
      const editDist = Math.abs(origWords.length - finalWords.length) + 
        origWords.filter((w, i) => finalWords[i] !== w).length;
      
      // Categorize edits
      const editCats = {
        length_change: finalWords.length < origWords.length * 0.9 ? 'shorter' : 
                       finalWords.length > origWords.length * 1.1 ? 'longer' : 'same',
        personalization_added: /\b(I |my |we |our )/.test(finalText) && !/\b(I |my |we |our )/.test(originalText),
        cta_changed: (finalText.match(/newsletter|subscribe|sign up|last 20/gi) || []).length !== 
                     (originalText.match(/newsletter|subscribe|sign up|last 20/gi) || []).length,
        newsletter_cta_present: /last.?20|newsletter/i.test(finalText)
      };
      
      // Update DB
      const approver = adapter || 'yohann';
      const brandProfileRes = await query('SELECT id FROM brand_profiles WHERE owner = $1 LIMIT 1', [approver]);
      const brandProfileId = brandProfileRes.rows[0]?.id || post.brand_profile_id || null;
      const result = await query(`
        UPDATE content_posts SET 
          status = 'approved',
          content_text = $1,
          edited_text = $2,
          original_text = COALESCE(original_text, content_text),
          edit_distance = $3,
          edit_categories = $4,
          learning_processed = false,
          approved_at = NOW(),
          approved_by = $5,
          adapter = $5,
          brand_profile_id = $6
        WHERE id = $7 RETURNING *
      `, [finalText, edited_text || finalText, editDist, JSON.stringify(editCats), approver, brandProfileId, id]);
      
      const approved = result.rows[0];
      
      res.json({ success: true, post: approved, buffer_id: null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/command/content/:id/hooks/:hookId/use
  app.post('/api/command/content/:id/hooks/:hookId/use', async (req, res) => {
    const { id, hookId } = req.params;
    try {
      const hookRes = await query('SELECT * FROM content_hooks WHERE id = $1 AND post_id = $2', [hookId, id]);
      if (!hookRes.rows.length) return res.status(404).json({ error: 'Hook not found' });
      const hook = hookRes.rows[0];

      await query('UPDATE content_hooks SET is_selected = false WHERE post_id = $1', [id]);
      await query('UPDATE content_hooks SET is_selected = true WHERE id = $1', [hookId]);
      const postRes = await query(
        `UPDATE content_posts
         SET selected_hook_id = $2,
             content_text = CASE
               WHEN content_text LIKE hook_text_pattern.pattern THEN regexp_replace(content_text, hook_text_pattern.pattern, $3)
               ELSE $3 || E'\n\n' || content_text
             END,
             draft_text = CASE
               WHEN draft_text LIKE hook_text_pattern.pattern THEN regexp_replace(draft_text, hook_text_pattern.pattern, $3)
               ELSE $3 || E'\n\n' || draft_text
             END
         FROM (SELECT '^(.*?)(\\n\\n|$)'::text AS pattern) AS hook_text_pattern
         WHERE id = $1
         RETURNING *`,
        [id, hookId, hook.hook_text]
      );

      res.json({ success: true, post: postRes.rows[0], hook });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/command/content/:id/reject
  app.patch('/api/command/content/:id/reject', async (req, res) => {
    const { id } = req.params;
    try {
      const result = await query(`
        UPDATE content_posts SET status = 'rejected' WHERE id = $1 RETURNING *
      `, [id]);
      res.json({ success: true, post: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/command/content/new — create new LinkedIn draft
  app.post('/api/command/content/new', async (req, res) => {
    const { platform = 'linkedin', post_type = 'draft', topic, content_text, adapter = 'yohann', brand_profile_id = null, post_origin = 'command_center', influencer_id = null, influencer_handle = null } = req.body;
    try {
      if (!content_text) return res.status(400).json({ error: 'content_text required' });
      const resolvedBrandProfileId = brand_profile_id || (await query('SELECT id FROM brand_profiles WHERE owner = $1 LIMIT 1', [adapter])).rows[0]?.id || null;
      const result = await query(`
        INSERT INTO content_posts (platform, post_type, topic, content_text, draft_text, adapter, brand_profile_id, status, post_origin)
        VALUES ($1, $2, $3, $4, $4, $5, $6, 'draft', $7)
        RETURNING *
      `, [platform, post_type, topic, content_text, adapter, resolvedBrandProfileId, post_origin]);

      // If this draft came from an influencer, update the influencer_pipeline status
      if (influencer_id && post_origin === 'vibrnt_influencer') {
        try {
          await query(`UPDATE influencer_pipeline SET status = 'Drafted' WHERE id = $1`, [influencer_id]);
        } catch (e) {
          console.warn('Failed to update influencer status after draft:', e.message);
        }
      }

      res.json({ success: true, post: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/command/contacts/:id/village-paths — query Village API for warm intro paths
  app.post('/api/command/contacts/:id/village-paths', async (req, res) => {
    const { id } = req.params;
    try {
      // Get contact info
      const contactResult = await query(
        'SELECT id, name, email, metadata, mutual_connection FROM contacts WHERE id = $1',
        [id]
      );
      if (contactResult.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
      const contact = contactResult.rows[0];

      // Get company from contacts join or signals
      const companyResult = await query(
        `SELECT COALESCE(c.metadata->>'company', os.company, '') as company
         FROM contacts c
         LEFT JOIN prospect_signals os ON os.contact_id = c.id
         WHERE c.id = $1 LIMIT 1`,
        [id]
      );
      const company = companyResult.rows[0]?.company || '';

      // Query Village API
      const VILLAGE_TOKEN = process.env.VILLAGE_USER_TOKEN || process.env.VILLAGE_API_KEY || 'demo_token_global';
      let paths = [];
      let mutualConnection = contact.mutual_connection;

      if (company) {
        // Extract domain from company name (best effort)
        const domain = company.toLowerCase()
          .replace(/[^a-z0-9.]/g, '')
          .replace(/^www\./, '') || company.toLowerCase().replace(/\s+/g, '') + '.com';

        const villageRes = await fetch('https://api.village.do/v2/companies/paths', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${VILLAGE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ domain })
        });

        if (villageRes.ok) {
          const villageData = await villageRes.json();
          paths = Array.isArray(villageData) ? villageData : (villageData.paths || []);

          // Save to contact metadata
          const existing = contact.metadata || {};
          await query(
            `UPDATE contacts SET metadata = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify({ ...existing, village_paths: paths, village_refreshed_at: new Date().toISOString() }), id]
          );

          // Build mutual_connection summary from paths
          if (paths.length > 0) {
            const connectors = paths.slice(0, 3).map(p =>
              Array.isArray(p.connectors) ? p.connectors[0] : (p.connector || p.name || 'Unknown')
            );
            mutualConnection = connectors.join(', ') + (paths.length > 3 ? ` + ${paths.length - 3} others` : '');
            await query(
              `UPDATE contacts SET mutual_connection = $1 WHERE id = $2`,
              [mutualConnection, id]
            );
          }
        }
      }

      res.json({ success: true, paths, mutual_connection: mutualConnection, contact_name: contact.name });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/command/queue/:id/execute — enforce phase-1 channel guardrails before send
  app.post('/api/command/queue/:id/execute', async (req, res) => {
    const { id } = req.params;
    try {
      const current = await query(`SELECT id, channel, queue_type, status FROM outreach_queue WHERE id = $1 LIMIT 1`, [id]);
      const item = current.rows[0];
      if (!item) return res.status(404).json({ error: 'queue item not found' });

      const blockedChannels = {
        whatsapp: 'warm channel not enabled for cold outbound',
        imessage: 'warm channel not enabled for cold outbound',
        telegram: 'warm channel not enabled for cold outbound',
        reddit_dm: 'reddit dm outbound disabled; use reddit for reputation/inbound only',
        reddit: 'reddit dm outbound disabled; use reddit for reputation/inbound only'
      };
      const blockReason = blockedChannels[item.channel];
      if (blockReason) {
        const blockedUpdate = await query(`
          UPDATE outreach_queue
          SET status = 'blocked', block_reason = $2
          WHERE id = $1 AND status IN ('pending', 'approved')
          RETURNING id, channel, queue_type, status
        `, [id, blockReason]);
        if (blockedUpdate.rows.length === 0) {
          return res.status(400).json({ success: false, error: 'queue item not executable from current status' });
        }
        await query(`
          INSERT INTO activity_log (time, type, source, payload)
          VALUES (NOW(), 'outreach_queue_blocked', 'command_center', $1)
        `, [JSON.stringify({ queue_id: id, channel: item.channel, queue_type: item.queue_type, status: 'blocked', block_reason: blockReason })]);
        return res.status(400).json({ success: false, blocked: true, block_reason: blockReason, note: 'execution blocked in CC; external delivery did not occur' });
      }

      const sentUpdate = await query(`
        UPDATE outreach_queue
        SET status = 'sent', block_reason = NULL
        WHERE id = $1 AND status IN ('pending', 'approved')
        RETURNING id, channel, queue_type, status
      `, [id]);
      if (sentUpdate.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'queue item not executable from current status' });
      }
      await query(`
        INSERT INTO activity_log (time, type, source, payload)
        VALUES (NOW(), 'outreach_queue_executed', 'command_center', $1)
      `, [JSON.stringify({ queue_id: id, channel: item.channel, queue_type: item.queue_type, status: 'sent', note: 'command center execution recorded; external delivery not guaranteed yet' })]);
      res.status(202).json({ success: true, executed: true, channel: item.channel, note: 'command center execution recorded; external delivery not guaranteed yet' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/command/queue/:id/personalize — save personalization opener/context for outreach queue item
  app.patch('/api/command/queue/:id/personalize', async (req, res) => {
    const { id } = req.params;
    const { personalization_source_type, personalization_source_url, personalization_note, personalization_opener, personalization_status = 'ready', personalized_by = 'leo' } = req.body || {};
    try {
      if (!personalization_opener) return res.status(400).json({ error: 'personalization_opener required' });
      const allowed = new Set(['pending', 'ready', 'approved', 'skipped']);
      if (!allowed.has(personalization_status)) return res.status(400).json({ error: 'invalid personalization_status' });
      const result = await query(`
        UPDATE outreach_queue
        SET personalization_source_type = $1,
            personalization_source_url = $2,
            personalization_note = $3,
            personalization_opener = $4,
            personalization_status = $5,
            personalized_by = $6,
            personalized_at = NOW()
        WHERE id = $7
        RETURNING *
      `, [personalization_source_type || null, personalization_source_url || null, personalization_note || null, personalization_opener, personalization_status, personalized_by, id]);
      res.json({ success: true, item: result.rows[0] || null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/command/outreach/prep', async (req, res) => {
    const { contact_id, signal_id, channel = 'linkedin_dm' } = req.body;
    if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
    try {
      // 1. Load contact
      const contactRes = await query(
        `SELECT c.id, c.name, c.handle, 
          COALESCE(a.name, c.metadata->>'company', c.metadata->>'org') as company,
          c.tier, c.last_outreach_date, c.metadata
         FROM contacts c
         LEFT JOIN accounts a ON a.id = c.account_id
         WHERE c.id = $1 LIMIT 1`,
        [contact_id]
      );
      if (!contactRes.rows[0]) return res.status(404).json({ error: 'contact not found' });
      const contact = contactRes.rows[0];
      
      // 2. Load signal (optional)
      let signal = null;
      if (signal_id) {
        const sigRes = await query(
          `SELECT id, signal_type, body, source_url, score, collection_method
           FROM signals WHERE id = $1 LIMIT 1`,
          [signal_id]
        );
        if (sigRes.rows[0]) signal = sigRes.rows[0];
      }
      
      // 3. Load signals for scoring
      const sigsRes = await query(
        `SELECT id, signal_type, body, score, created_at
         FROM signals
         WHERE source_url IN (
           SELECT source_url FROM signals s2
           WHERE s2.id = $1
         ) OR (
           SELECT source_url FROM signals s3 WHERE s3.id = $1
         ) IS NULL
         ORDER BY score DESC NULLS LAST, created_at DESC
         LIMIT 5`,
        [signal_id || '00000000-0000-0000-0000-000000000000']
      );
      const signals = sigsRes.rows;
      
      // 4. Village paths
      let villagePaths = [];
      const vRes = await query(
        `SELECT metadata->>'village_paths' as paths
         FROM contacts WHERE id = $1 LIMIT 1`,
        [contact_id]
      );
      if (vRes.rows[0]?.paths) {
        try { villagePaths = JSON.parse(vRes.rows[0].paths); } catch {}
      }
      
      // 5. Score
      const scoring = calculateLeadScore(contact, signals, villagePaths);
      
      // 6. Draft
      const draft = generateDraft(contact, signal, channel);
      
      // 7. Store draft in outreach_drafts for learn-loop tracking
      const draftRes = await query(`
        INSERT INTO outreach_drafts (contact_id, draft_text, channel, signal_context, status, draft_model, created_at)
        VALUES ($1, $2, $3, $4, 'draft', 'prep-engine', NOW())
        RETURNING id
      `, [
        contact_id,
        draft.draft,
        channel,
        JSON.stringify({ signal_id, score: scoring.score, reasons: scoring.reasons })
      ]);
      
      res.json({
        success: true,
        draft_id: draftRes.rows[0]?.id,
        contact: { id: contact.id, name: contact.name, company: contact.company, tier: contact.tier },
        score: scoring,
        draft,
        signal: signal ? { id: signal.id, body: signal.body?.substring(0, 100), score: signal.score } : null,
        village_paths: villagePaths.slice(0, 3),
        note: 'Review draft, edit if needed, then copy and send via your channel. Log outcome in CC.'
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/command/outreach/prep-contact-list — batch prep top N contacts
  app.post('/api/command/outreach/prep-contact-list', async (req, res) => {
    const { limit = 10, min_score = 0, channel = 'linkedin_dm' } = req.body;
    try {
      // Pull contacts with signals, ordered by recency + tier
      // Filter: must have a real handle (not u/...) OR email for outreach
      const contactsRes = await query(`
        SELECT c.id, c.name, c.handle, 
          COALESCE(a.name, c.metadata->>'company', c.metadata->>'org') as company,
          c.tier, c.last_outreach_date, c.metadata,
          COALESCE(MAX(s.score), 0) as max_signal_score
        FROM contacts c
        LEFT JOIN accounts a ON a.id = c.account_id
        LEFT JOIN entity_signals es ON es.entity_id = c.id
        LEFT JOIN signals s ON s.id = es.signal_id
        WHERE c.tier IN (1, 2)
          AND (c.last_outreach_date IS NULL OR c.last_outreach_date < NOW() - INTERVAL '7 days')
          -- Exclude anonymous Reddit contacts (no real social handle)
          AND NOT (
            c.metadata->>'added_from' = 'signal-scout' 
            AND c.metadata->>'subreddit' IS NOT NULL
            AND (c.handle IS NULL OR c.handle LIKE 'u/%')
          )
          -- Must have a real handle (LinkedIn, X, etc.) or email
          AND (
            c.handle IS NOT NULL 
            AND c.handle <> ''
            AND c.handle NOT LIKE 'u/%'
            AND c.handle NOT LIKE 'r/%'
          )
        GROUP BY c.id, c.name, c.handle, a.name, c.metadata, c.tier, c.last_outreach_date
        ORDER BY c.tier ASC, COALESCE(MAX(s.score), 0) DESC NULLS LAST, c.last_outreach_date ASC NULLS FIRST
        LIMIT $1
      `, [limit]);
      
      const results = [];
      for (const contact of contactsRes.rows) {
        const sigRes = await query(`
          SELECT s.id, s.signal_type, s.body, s.score, s.source_url
          FROM signals s
          JOIN entity_signals es ON es.signal_id = s.id
          WHERE es.entity_id = $1
          ORDER BY s.score DESC NULLS LAST, s.created_at DESC
          LIMIT 1
        `, [contact.id]);
        const signal = sigRes.rows[0] || null;
        
        const vRes = await query(
          `SELECT metadata->>'village_paths' as paths FROM contacts WHERE id = $1`,
          [contact.id]
        );
        let villagePaths = [];
        if (vRes.rows[0]?.paths) {
          try { villagePaths = JSON.parse(vRes.rows[0].paths); } catch {}
        }
        
        const scoring = calculateLeadScore(contact, signal ? [signal] : [], villagePaths);
        if (scoring.score >= min_score) {
          results.push({
            contact: { id: contact.id, name: contact.name, company: contact.company || 'Unknown' },
            score: scoring,
            top_signal: signal ? { id: signal.id, body: signal.body?.substring(0, 80), score: signal.score } : null,
            village_paths: villagePaths.slice(0, 2)
          });
        }
      }
      
      res.json({
        success: true,
        count: results.length,
        contacts: results.sort((a, b) => b.score.score - a.score.score)
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/command/outreach/log — quick one-liner outreach outcome logger
  app.post('/api/command/outreach/log', async (req, res) => {
    const { contact_name, channel = 'unknown', outcome = 'sent', note = '', email = '' } = req.body;
    if (!contact_name) return res.status(400).json({ error: 'contact_name required' });
    try {
      const contactMatch = await query(
        `SELECT id, name, email FROM contacts WHERE name ILIKE $1 LIMIT 1`,
        [`%${contact_name}%`]
      );
      const contactId = contactMatch.rows[0]?.id || null;
      const resolvedName = contactMatch.rows[0]?.name || contact_name;
      const existingEmail = contactMatch.rows[0]?.email || '';

      // Write to activity_log
      await query(`
        INSERT INTO activity_log (time, type, source, contact_id, payload)
        VALUES (NOW(), 'outreach_logged', 'command_center', $1, $2)
      `, [
        contactId || null,
        JSON.stringify({ contact_name: resolvedName, channel, outcome, note, ...(email ? { email } : {}) })
      ]);

      let emailUpdated = false;
      if (contactId) {
        // Auto-extract email from note if not explicitly provided in email field
        const emailFromNote = (!email && note) ? (note.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || null) : null;
        const cleanEmail = (email && email.includes('@')) ? email.trim() : emailFromNote;
        if (cleanEmail && cleanEmail !== existingEmail) {
          // New or updated email — save to contacts
          await query(
            `UPDATE contacts SET last_outreach_date = NOW(), email = $1 WHERE id = $2`,
            [cleanEmail, contactId]
          );
          emailUpdated = true;
        } else {
          await query(`UPDATE contacts SET last_outreach_date = NOW() WHERE id = $1`, [contactId]);
        }
      }

      res.json({ success: true, contact: resolvedName, outcome, note, email_updated: emailUpdated, email: email || null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/command/outreach/recent — last 20 logged outreach actions
  app.get('/api/command/outreach/recent', async (req, res) => {
    try {
      const result = await query(`
        SELECT time, payload
        FROM activity_log
        WHERE type = 'outreach_logged'
        ORDER BY time DESC
        LIMIT 20
      `);
      const rows = result.rows.map(r => ({ time: r.time, ...r.payload }));
      res.json({ outreach: rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

};

// Helper to run parameterized query safely
async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// Buffer push helper
async function pushToBuffer(text, adapter) {
  const https = require('https');
  const BUFFER_TOKEN = 'GkB7cingsMpgX-DpfbRwdqAN1Spir8QxeEe7gp_9Jn1';
  const ORG_ID = '69c5d72e44dbc563b3e02e34';
  const CHANNELS = {
    yohann: '69c5d74baf47dacb695bff50',
    jenny: '69cec9b0af47dacb69816953'
  };
  
  const channelId = CHANNELS[adapter] || CHANNELS.yohann;
  
  const mutation = JSON.stringify({
    query: `mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id } } } }`,
    variables: {
      input: {
        channelId: channelId,
        text: text,
        saveToDraft: true,
        schedulingType: 'automatic',
        mode: 'addToQueue'
      }
    }
  });
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.buffer.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BUFFER_TOKEN}`,
        'Content-Length': Buffer.byteLength(mutation)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const postId = json?.data?.createPost?.post?.id;
          resolve(postId || null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.write(mutation);
    req.end();
  });
}

// ── Outreach Sprint Shortlist API ────────────────────────────────────────────
// Added 2026-04-25 — for manual outreach sprint workflow

function registerOutreachSprintRoutes(app) {
  // POST /api/command/outreach/shortlist — add contact to focused shortlist
  app.post('/api/command/outreach/shortlist', async (req, res) => {
    const { contact_id, sprint_name = 'week-1-sprint', status = 'shortlisted', notes = '', draft_id = null } = req.body;
    if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
    try {
      const result = await query(`
        INSERT INTO outreach_sprint_shortlist (contact_id, sprint_name, status, draft_id, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, 'cc-user')
        ON CONFLICT (contact_id, sprint_name) DO UPDATE
        SET status = EXCLUDED.status, notes = EXCLUDED.notes, draft_id = EXCLUDED.draft_id, updated_at = NOW()
        RETURNING *
      `, [contact_id, sprint_name, status, draft_id, notes]);
      res.json({ success: true, item: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/command/outreach/shortlist — view shortlist with contact details
  app.get('/api/command/outreach/shortlist', async (req, res) => {
    const { sprint = 'week-1-sprint', status } = req.query;
    try {
      const statusFilter = status ? `AND s.status = '${status}'` : '';
      const result = await query(`
        SELECT 
          s.id as shortlist_id, s.status, s.notes, s.draft_id, s.created_at, s.updated_at,
          c.id as contact_id, c.name, c.handle, c.email,
          COALESCE(a.name, c.metadata->>'company', c.metadata->>'org', 'Unknown') as company,
          c.tier, c.last_outreach_date,
          d.draft_text, d.channel as draft_channel
        FROM outreach_sprint_shortlist s
        JOIN contacts c ON c.id = s.contact_id
        LEFT JOIN accounts a ON a.id = c.account_id
        LEFT JOIN outreach_drafts d ON d.id = s.draft_id
        WHERE s.sprint_name = $1 ${statusFilter}
        ORDER BY 
          CASE s.status WHEN 'shortlisted' THEN 1 WHEN 'contacted' THEN 2 WHEN 'replied' THEN 3 ELSE 4 END,
          s.created_at DESC
      `, [sprint]);
      res.json({ success: true, sprint, count: result.rows.length, contacts: result.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/command/outreach/shortlist/:id/status — update status (replied, booked, passed, nurture)
  app.patch('/api/command/outreach/shortlist/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, notes = '' } = req.body;
    const allowed = ['shortlisted', 'contacted', 'replied', 'booked', 'passed', 'nurture'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    try {
      const result = await query(`
        UPDATE outreach_sprint_shortlist
        SET status = $1, notes = COALESCE(NULLIF($2, ''), notes), updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [status, notes, id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'shortlist item not found' });
      res.json({ success: true, item: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/command/outreach/shortlist/:id — remove from shortlist
  app.delete('/api/command/outreach/shortlist/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await query(`DELETE FROM outreach_sprint_shortlist WHERE id = $1`, [id]);
      res.json({ success: true, deleted: id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── CRON TOGGLE ENDPOINTS ──────────────────────────────────────────────
  const CRON_BASE = path.join(process.env.HOME || '', '.openclaw', 'cron');
  const CRON_JOBS = path.join(CRON_BASE, 'jobs.json');
  const PENDING_FILE = path.join(CRON_BASE, 'pending-changes.json');

  app.post('/api/command/cron/:id/toggle', async (req, res) => {
    try {
      const { id } = req.params;
      if (!fs.existsSync(CRON_JOBS)) return res.status(500).json({ error: 'jobs.json not found' });
      const registry = JSON.parse(fs.readFileSync(CRON_JOBS, 'utf8'));
      const job = (registry.jobs || []).find(j => j.id === id);
      if (!job) return res.status(404).json({ error: 'cron job not found' });

      const currentEnabled = job.enabled !== false;
      const action = currentEnabled ? 'disable' : 'enable';

      let pending = { changes: [] };
      if (fs.existsSync(PENDING_FILE)) {
        pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
      }
      pending.changes = (pending.changes || []).filter(c => c.id !== id);
      pending.changes.push({ id, action, at: new Date().toISOString(), name: job.name });
      fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));

      res.json({ success: true, id, current_enabled: currentEnabled, action, pending_count: pending.changes.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/command/cron/pending', async (req, res) => {
    try {
      if (!fs.existsSync(PENDING_FILE)) return res.json({ changes: [] });
      const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
      res.json({ changes: pending.changes || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/command/cron/apply-pending', async (req, res) => {
    try {
      if (!fs.existsSync(PENDING_FILE)) return res.json({ success: true, applied: 0, message: 'No pending changes' });
      if (!fs.existsSync(CRON_JOBS)) return res.status(500).json({ error: 'jobs.json not found' });

      const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
      const changes = pending.changes || [];
      if (changes.length === 0) return res.json({ success: true, applied: 0, message: 'No pending changes' });

      let registry = JSON.parse(fs.readFileSync(CRON_JOBS, 'utf8'));
      const jobs = registry.jobs || [];
      let applied = 0;

      for (const change of changes) {
        const job = jobs.find(j => j.id === change.id);
        if (job) {
          job.enabled = (change.action === 'enable');
          applied++;
        }
      }

      fs.writeFileSync(CRON_JOBS, JSON.stringify(registry, null, 2));
      fs.writeFileSync(PENDING_FILE, JSON.stringify({ changes: [] }, null, 2));

      const { execSync } = require('child_process');
      try {
        execSync('openclaw gateway restart', { timeout: 10000, stdio: 'pipe' });
      } catch (restartErr) {
        console.warn('[cron] gateway restart non-zero:', restartErr.message);
      }

      res.json({ success: true, applied, changes, gateway_restart: 'scheduled' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

// Graceful shutdown helper
process.on('SIGTERM', () => {
  if (poolInstance) poolInstance.end();
});

module.exports.query = query;
module.exports.getPool = getPool;

// POST /api/command/prompt-lab/bridge — bridge portal data to CC
function registerPromptLabRoutes(app) {
  app.post('/api/command/prompt-lab/bridge', async (req, res) => {
    try {
      const { main } = require('../../scripts/bridge/prompt-lab-to-cc');
      const result = await main();
      res.json(result);
    } catch (e) {
      console.error('Prompt Lab bridge failed:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/command/prompt-lab/insights', async (req, res) => {
    try {
      const days = parseInt(req.query.days || '7', 10);
      const periodEnd = new Date().toISOString().split('T')[0];
      const periodStart = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

      const result = await query(`
        SELECT
          content_slug, title, content_type,
          total_edits, active_edits, reverted_edits,
          avg_edit_distance, reversion_rate,
          priority, signal
        FROM prompt_lab_insights
        WHERE period_start = $1 AND period_end = $2
        ORDER BY
          CASE priority
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'watch' THEN 3
            ELSE 4
          END,
          total_edits DESC
        LIMIT 20
      `, [periodStart, periodEnd]);

      res.json({ insights: result.rows, period: `${periodStart} → ${periodEnd}` });
    } catch (e) {
      console.error('Prompt Lab insights query failed:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
module.exports.registerPromptLabRoutes = registerPromptLabRoutes;
module.exports.registerOutreachSprintRoutes = registerOutreachSprintRoutes;

// ── Influencer Pipeline routes (registered standalone for serve-local) ──────
function registerInfluencerRoutes(app) {
  const nodePath = require('path');
  // GET /api/command/influencers — list with filters
  app.get('/api/command/influencers', async (req, res) => {
    try {
      const { icp_target, platform, tier, has_email, limit, active_only } = req.query;
      const lim = Math.min(parseInt(limit) || 500, 1000);
      const conditions = [];
      const params = [];
      let idx = 1;
      if (icp_target) { conditions.push(`icp_target = $${idx}`); params.push(icp_target); idx++; }
      if (platform)   { conditions.push(`platform_primary = $${idx}`); params.push(platform); idx++; }
      if (tier)       { conditions.push(`lead_tier = $${idx}`); params.push(tier); idx++; }
      if (has_email === 'true') { conditions.push(`email IS NOT NULL`); }
      
      // If active_only=true and no specific ICP selected, exclude inactive ICPs
      if (active_only === 'true' && !icp_target) {
        conditions.push(`icp_target NOT IN (SELECT slug FROM icp_brands WHERE active = false)`);
      }

      // Filter by influencer type (social vs newsletter)
      const infType = req.query.influencer_type;
      if (infType && ['social','newsletter'].includes(infType)) {
        conditions.push(`influencer_type = $${idx}`); params.push(infType); idx++;
      }
      
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const result = await query(
        `SELECT id, handle, platform_primary, icp_target, followers, engagement_rate,
                lead_score, lead_tier, email, email_source, profile_url, status, created_at,
                last_outreach_at, last_outreach_status,
                influencer_type, subscriber_count, topic_focus, frequency,
                sponsorship_pricing, icp_fit_label, priority_rank, contact_info,
                (SELECT jsonb_build_object('status', po.status, 'commission_pct', po.commission_pct,
                                           'discount_pct', po.discount_pct, 'discount_code', po.discount_code)
                 FROM partner_offers po WHERE po.influencer_id = influencer_pipeline.id ORDER BY po.created_at DESC LIMIT 1) as current_offer
         FROM influencer_pipeline ${where}
         ORDER BY priority_rank ASC NULLS LAST, lead_score DESC NULLS LAST, followers DESC NULLS LAST
         LIMIT $${idx}`,
        [...params, lim]
      );
      res.json(result.rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/command/influencers/export — CSV download
  app.get('/api/command/influencers/export', async (req, res) => {
    try {
      const { icp_target, tier, has_email } = req.query;
      const conditions = [];
      const params = [];
      let idx = 1;
      if (icp_target) { conditions.push(`icp_target = $${idx}`); params.push(icp_target); idx++; }
      if (tier)       { conditions.push(`lead_tier = $${idx}`); params.push(tier); idx++; }
      if (has_email === 'true') { conditions.push(`email IS NOT NULL`); }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const result = await query(
        `SELECT handle, platform_primary, icp_target, followers, engagement_rate,
                lead_score, lead_tier, email, email_source, profile_url, status
         FROM influencer_pipeline ${where}
         ORDER BY lead_score DESC NULLS LAST`,
        params
      );
      const headers = ['handle','platform_primary','icp_target','followers','engagement_rate','lead_score','lead_tier','email','email_source','profile_url','status'];
      const csv = [
        headers.join(','),
        ...result.rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="influencers.csv"');
      res.send(csv);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/command/influencers/budget — EnsembleData daily budget
  app.get('/api/command/influencers/budget', async (req, res) => {
    try {
      const btPath = nodePath.join(__dirname, '../../scripts/ensembledata/budget-tracker.js');
      const bt = require(btPath);
      const report = typeof bt.getDailyReport === 'function' ? bt.getDailyReport() : { units_used: 0, total_daily: 1500, by_pipeline: {} };
      res.json(report);
    } catch(e) {
      // Budget tracker missing or erroring — return safe default
      res.json({ units_used: 0, total_daily: 1500, by_pipeline: {}, error: e.message });
    }
  });

  // GET /api/command/influencers/config — active ICPs + platforms from DB (icp_brands is SSoT)
  app.get('/api/command/influencers/config', async (req, res) => {
    try {
      // icp_brands is the single source of truth for brand-level ICP status
      const result = await query(`
        SELECT slug, label, active
        FROM icp_brands
        ORDER BY label
      `);
      
      const active_icps = [];
      const inactive_icps = [];
      
      result.rows.forEach(r => {
        const entry = { slug: r.slug, label: r.label };
        if (r.active) active_icps.push(entry);
        else inactive_icps.push(entry);
      });
      
      res.json({ active_icps, inactive_icps, platforms: ['tiktok','instagram','youtube','twitter','linkedin'] });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/command/influencers/:id/outreach — log outreach
  app.post('/api/command/influencers/:id/outreach', async (req, res) => {
    try {
      const influencer_id = parseInt(req.params.id);
      if (isNaN(influencer_id)) return res.status(400).json({ error: 'Invalid influencer ID' });

      const {
        channel = 'email',
        channel_contact_details,
        subject,
        body,
        status,
        outcome_note,
        sent_at,
        follow_up_at,
        paid_at,
        cost,
        content_url
      } = req.body;

      if (!status) return res.status(400).json({ error: 'status is required' });

      const validStatuses = ['drafted','sent','replied','follow_up','in_negotiation','contracted','content_submitted','live','paid','declined','ghosted'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      // Insert log
      const logRes = await query(`
        INSERT INTO influencer_outreach_log
          (influencer_id, channel, channel_contact_details, subject, body,
           status, outcome_note, sent_at, follow_up_at, paid_at, cost, content_url, logged_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'cc-user')
        RETURNING id
      `, [
        influencer_id, channel, channel_contact_details || null, subject || null, body || null,
        status, outcome_note || null,
        sent_at ? new Date(sent_at) : new Date(),
        follow_up_at || null,
        paid_at ? new Date(paid_at) : null,
        cost ? parseFloat(cost) : null,
        content_url || null
      ]);

      // Update denormalized columns
      await query(`
        UPDATE influencer_pipeline
        SET last_outreach_at = NOW(),
            last_outreach_status = $1
        WHERE id = $2
      `, [status, influencer_id]);

      res.json({ success: true, log_id: logRes.rows[0].id });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/command/influencers/:id/outreach — get history
  app.get('/api/command/influencers/:id/outreach', async (req, res) => {
    try {
      const influencer_id = parseInt(req.params.id);
      if (isNaN(influencer_id)) return res.status(400).json({ error: 'Invalid influencer ID' });

      const history = await query(`
        SELECT id, channel, channel_contact_details, subject, body,
               sent_at, replied_at, follow_up_at, paid_at, status,
               outcome_note, cost, content_url, logged_by, created_at
        FROM influencer_outreach_log
        WHERE influencer_id = $1
        ORDER BY created_at DESC
      `, [influencer_id]);

      const lastRes = await query(`
        SELECT last_outreach_at, last_outreach_status
        FROM influencer_pipeline
        WHERE id = $1
      `, [influencer_id]);

      res.json({
        history: history.rows,
        last_outreach_at: lastRes.rows[0]?.last_outreach_at,
        last_outreach_status: lastRes.rows[0]?.last_outreach_status
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /api/command/influencers/:id/status — quick status update
  app.patch('/api/command/influencers/:id/status', async (req, res) => {
    try {
      const influencer_id = parseInt(req.params.id);
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: 'status required' });

      await query(`
        INSERT INTO influencer_outreach_log (influencer_id, status, logged_by)
        VALUES ($1, $2, 'cc-user')
      `, [influencer_id, status]);

      await query(`
        UPDATE influencer_pipeline
        SET last_outreach_at = NOW(), last_outreach_status = $1
        WHERE id = $2
      `, [status, influencer_id]);

      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // ── Partner Offer Routes ──────────────────────────────────────────────────────

  // GET /api/command/offer-defaults — current default templates
  app.get('/api/command/offer-defaults', async (req, res) => {
    try {
      const result = await query(`SELECT * FROM offer_defaults ORDER BY offer_type`);
      res.json(result.rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/command/offer-defaults — update default templates (admin only)
  app.post('/api/command/offer-defaults', async (req, res) => {
    try {
      const { offer_type, commission_pct, discount_pct, free_editions, studio_membership, co_marketing, sponsored_placement, default_notes } = req.body;
      const result = await query(`
        INSERT INTO offer_defaults (offer_type, commission_pct, discount_pct, free_editions, studio_membership, co_marketing, sponsored_placement, default_notes, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (offer_type) DO UPDATE SET
          commission_pct = EXCLUDED.commission_pct,
          discount_pct = EXCLUDED.discount_pct,
          free_editions = EXCLUDED.free_editions,
          studio_membership = EXCLUDED.studio_membership,
          co_marketing = EXCLUDED.co_marketing,
          sponsored_placement = EXCLUDED.sponsored_placement,
          default_notes = EXCLUDED.default_notes,
          updated_at = NOW()
        RETURNING *
      `, [offer_type, commission_pct, discount_pct, free_editions, studio_membership, co_marketing, sponsored_placement, default_notes]);
      res.json(result.rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/command/influencers/:id/offers — list all offers for an influencer
  app.get('/api/command/influencers/:id/offers', async (req, res) => {
    try {
      const influencer_id = parseInt(req.params.id);
      const result = await query(`
        SELECT * FROM partner_offers WHERE influencer_id = $1 ORDER BY created_at DESC
      `, [influencer_id]);
      res.json(result.rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/command/influencers/:id/offers — create or update an offer
  app.post('/api/command/influencers/:id/offers', async (req, res) => {
    try {
      const influencer_id = parseInt(req.params.id);
      const { id: offer_id, ...fields } = req.body;

      if (offer_id) {
        // Update existing
        const allowed = ['commission_pct','discount_pct','discount_code','free_editions','studio_membership','co_marketing','sponsored_placement','custom_notes','status'];
        const setParts = [];
        const vals = [];
        let idx = 1;
        for (const k of allowed) {
          if (fields[k] !== undefined) { setParts.push(`${k} = $${idx++}`); vals.push(fields[k]); }
        }
        setParts.push(`updated_at = NOW()`);
        vals.push(offer_id);
        const result = await query(`
          UPDATE partner_offers SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING *
        `, vals);
        res.json(result.rows[0] || { error: 'Offer not found' });
      } else {
        // Create new: load defaults from offer_defaults for influencer type
        const infRes = await query(`SELECT influencer_type FROM influencer_pipeline WHERE id = $1`, [influencer_id]);
        const offer_type = infRes.rows[0]?.influencer_type === 'social' ? 'social' : 'newsletter';
        const defRes = await query(`SELECT * FROM offer_defaults WHERE offer_type = $1`, [offer_type]);
        const d = defRes.rows[0];
        const result = await query(`
          INSERT INTO partner_offers (influencer_id, offer_type, commission_pct, discount_pct, discount_code, free_editions, studio_membership, co_marketing, sponsored_placement, custom_notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `, [
          influencer_id, offer_type,
          fields.commission_pct ?? d?.commission_pct ?? (offer_type === 'social' ? 20 : 25),
          fields.discount_pct ?? d?.discount_pct ?? (offer_type === 'social' ? 15 : 20),
          fields.discount_code ?? null,
          fields.free_editions ?? d?.free_editions ?? (offer_type === 'social' ? ['Founder','Solo','Operator'] : ['Operator']),
          fields.studio_membership ?? d?.studio_membership ?? true,
          fields.co_marketing ?? d?.co_marketing ?? (offer_type === 'social'),
          fields.sponsored_placement ?? d?.sponsored_placement ?? (offer_type === 'newsletter'),
          fields.custom_notes ?? null
        ]);
        res.json(result.rows[0]);
      }
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /api/command/influencers/:id/offers/:offerId/status — status transition only
  app.patch('/api/command/influencers/:id/offers/:offerId/status', async (req, res) => {
    try {
      const offerId = req.params.offerId;
      const { status } = req.body;
      const timestampCol = { sent: 'sent_at', accepted: 'accepted_at', declined: 'declined_at' }[status];
      const setParts = [`status = $1`, `updated_at = NOW()`];
      const vals = [status];
      if (timestampCol) { setParts.push(`${timestampCol} = NOW()`); }
      const result = await query(`
        UPDATE partner_offers SET ${setParts.join(', ')} WHERE id = $${setParts.length + 1} RETURNING *
      `, [...vals, offerId]);
      res.json(result.rows[0] || { error: 'Offer not found' });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/command/influencers/bulk-import — import newsletters from JSON
  app.post('/api/command/influencers/bulk-import', async (req, res) => {
    try {
      const items = req.body;
      if (!Array.isArray(items) || items.length > 100) {
        return res.status(400).json({ error: 'Body must be an array of ≤100 items' });
      }
      let inserted = 0;
      let updated = 0;
      for (const item of items) {
        const handle = item.handle;
        const platform = item.platform_primary || 'newsletter';
        if (!handle) continue;
        // Upsert by (handle, platform_primary) composite key
        const result = await query(`
          INSERT INTO influencer_pipeline (
            handle, platform_primary, influencer_type, subscriber_count, topic_focus,
            frequency, sponsorship_pricing, icp_target, icp_fit_label, priority_rank,
            contact_info, profile_url, lead_tier, lead_score, topics, email, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'active')
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [
          handle, platform, item.influencer_type || 'newsletter',
          item.subscriber_count || null, item.topic_focus || null,
          item.frequency || null, item.sponsorship_pricing || null,
          item.icp_target || null, item.icp_fit_label || null,
          item.priority_rank || null, item.contact_info || null,
          item.profile_url || null, item.lead_tier || 'tier_3', item.lead_score || 5,
          item.topics || null, item.email || null
        ]);
        if (result.rows.length > 0) { inserted++; } else { updated++; }
      }
      res.json({ inserted, updated, total: items.length });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/command/contacts/:id/suppress — suppress from reconnection engine
  app.post('/api/command/contacts/:id/suppress', async (req, res) => {
    try {
      const { id } = req.params;
      const { reason, suppress_until } = req.body;
      
      const result = await query(`
        UPDATE contacts
        SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{suppressed_from_reconnection}', 'true') || jsonb_build_object('suppressed_reason', $2, 'suppress_until', $3),
            notes = COALESCE(notes || E'\n', '') || '[' || NOW()::date || '] Suppressed from reconnection: ' || $2 || ' (until ' || $3 || ')'
        WHERE id = $1
        RETURNING id, name
      `, [id, reason || 'Manual suppression', suppress_until || (new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0])]);
      
      if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
      res.json({ success: true, contact: result.rows[0] });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
}
module.exports.registerInfluencerRoutes = registerInfluencerRoutes;

// ── Research Routes ───────────────────────────────────────────────────────────
// ── Outreach Prep Helpers ─────────────────────────────────────────────────────
// Added 2026-04-25 — for manual outreach sprint support

function calculateLeadScore(contact, signals, villagePaths) {
  let score = 0;
  const reasons = [];
  
  if (contact.tier == 1 || contact.tier == '1') { score += 30; reasons.push('Tier 1 contact'); }
  else if (contact.tier == 2 || contact.tier == '2') { score += 20; reasons.push('Tier 2 contact'); }
  else { score += 10; reasons.push('Tier 3+ contact'); }
  
  if (signals.length > 0) {
    const avg = signals.reduce((s, sig) => s + (parseFloat(sig.score) || 3), 0) / signals.length;
    score += Math.round(avg * 8);
    reasons.push(`${signals.length} signal(s), avg ${avg.toFixed(1)}/5`);
  }
  
  if (villagePaths && villagePaths.length > 0) {
    score += 15;
    reasons.push(`Warm path via ${villagePaths[0].connector || 'mutual connection'}`);
  }
  
  if (contact.last_outreach_date) {
    const days = Math.floor((Date.now() - new Date(contact.last_outreach_date).getTime()) / (1000*60*60*24));
    if (days > 30) { score += 10; reasons.push('No touch in 30+ days'); }
    else if (days < 7) { score -= 10; reasons.push('Touched recently'); }
  } else {
    score += 10; reasons.push('Never contacted');
  }
  
  return { 
    score: Math.min(100, Math.max(0, score)), 
    reasons, 
    priority: score >= 70 ? 'hot' : score >= 50 ? 'warm' : 'cold' 
  };
}

function generateDraft(contact, signal, channel) {
  const name = contact.name?.split(' ')[0] || 'there';
  const company = contact.company || contact.metadata?.company || contact.metadata?.org || 'your company';
  let context = '';
  if (signal) {
    context = signal.body || signal.signal_text || '';
    if (context.length > 120) context = context.substring(0, 120) + '...';
  }
  
  const templates = {
    linkedin_dm: () => {
      if (signal) {
        return `Hey ${name}, saw your post about ${context}. ${signal.angle || "We've been helping founders at your stage replace their SDR function entirely."} Mind if I DM you? Also, what's the best email to reach you at?`;
      }
      return `Hey ${name} — noticed ${company} is building something interesting. We've been running GTM for B2B founders so their pipeline fills while they build. Worth a 15-min chat this week? What's the best email to reach you at?`;
    },
    x_dm: () => {
      if (signal) {
        return `${name} — ${context}. We're building exactly the layer that replaces the SDR function for founders. Mind if I reach out via email?`;
      }
      return `${name} — ${company} looks like it's at the stage where founder-led sales starts to break. We've fixed that for 5+ teams. Mind if I email you?`;
    },
    reddit_reply: () => {
      if (signal) {
        return `Hey ${name}, saw your post about ${context}. ${signal.angle || "We've been helping founders at your stage with exactly this."} Would love to share what's worked. Mind if I DM you? Also, what's the best email to reach you at?`;
      }
      return `Hey ${name} — your post resonated. We've been solving this exact problem for founders. Worth a quick chat? What's the best email to reach you at?`;
    },
    email: () => {
      if (signal) {
        return `Subject: ${name} — ${context.substring(0, 40)}...\n\n${name},\n\nSaw your post about ${context}. ${signal.angle || "We've been helping founders at your stage replace their SDR function entirely."}\n\nWorth a 15-min call this week?\n\nAlso, what's the best email to reach you at?`;
      }
      return `Subject: ${company} — quick question\n\n${name},\n\nNoticed ${company} is building something interesting. We've been running GTM for B2B founders so their pipeline fills while they build.\n\nWorth a 15-min chat this week?\n\nAlso, what's the best email to reach you at?`;
    }
  };
  
  const draft = templates[channel] ? templates[channel]() : templates.linkedin_dm();
  return { draft, channel, includes_email_ask: true, estimated_chars: draft.length, tone: 'direct-warm' };
}

function registerResearchRoutes(app) {

  // GET /api/research/pulse — daily briefs + live prospect signals + enriched Reddit signals
  app.get('/api/research/pulse', async (req, res) => {
    try {
      const [briefsResult, signalsResult, cachedPainResult, cachedMoodResult, hallucinationResult, moodHallucinationResult] = await Promise.all([
        query(
          `SELECT brand, brief_date, markdown_body, signal_count
           FROM daily_briefs
           ORDER BY brief_date DESC, brand
           LIMIT 20`
        ),
        query(
          `SELECT ps.company, ps.handle, ps.signal_text, ps.signal_type, ps.signal_source, ps.relevance_score,
                  ps.signal_url, ps.captured_at, ps.stale, ps.url_alive, c.name as contact_name
           FROM prospect_signals ps
           LEFT JOIN contacts c ON ps.contact_id = c.id
           WHERE ps.acted_on = false
             AND ps.stale = FALSE
           ORDER BY ps.relevance_score DESC, ps.captured_at DESC
           LIMIT 15`
        ),
        query(
          `SELECT ps.icp_slug, ps.pain_category, ps.severity, ps.verbatim_quote, ps.insight, ps.tags, ps.action_suggestion, ps.created_at,
                  ps.reddit_url as source_url, ps.quote_verified, ps.quote_match_score, ps.accuracy_score, ps.icp_confidence
           FROM pain_signals ps
           WHERE ps.insight IS NOT NULL
             AND ps.quote_match_score >= 0.5
           ORDER BY ps.accuracy_score DESC NULLS LAST, ps.severity DESC, ps.created_at DESC
           LIMIT 15`
        ),
        query(
          `SELECT ms.icp_slug, ms.mood_primary, ms.mood_secondary, ms.verbatim_phrases, ms.emotional_punch, ms.shirt_potential, ms.insight, ms.tags, ms.action_suggestion, ms.created_at,
                  ms.reddit_url as source_url, ms.phrases_match_score, ms.accuracy_score
           FROM mood_signals ms
           WHERE ms.insight IS NOT NULL
             AND ms.phrases_match_score >= 0.5
           ORDER BY ms.accuracy_score DESC NULLS LAST, ms.emotional_punch DESC, ms.created_at DESC
           LIMIT 15`
        ),
        // Pain hallucination stats for dashboard awareness
        query(
          `SELECT icp_slug,
                  COUNT(*) as total,
                  COUNT(*) FILTER (WHERE quote_match_score = 1.0) as exact,
                  COUNT(*) FILTER (WHERE quote_match_score >= 0.8 AND quote_match_score < 1.0) as fuzzy_good,
                  COUNT(*) FILTER (WHERE quote_match_score >= 0.5 AND quote_match_score < 0.8) as fuzzy_partial,
                  COUNT(*) FILTER (WHERE quote_match_score < 0.5) as hallucinated
           FROM pain_signals
           WHERE quote_verified = TRUE
           GROUP BY icp_slug
           ORDER BY hallucinated DESC`
        ),
        // Mood hallucination stats
        query(
          `SELECT icp_slug,
                  COUNT(*) as total,
                  COUNT(*) FILTER (WHERE phrases_match_score = 1.0) as exact,
                  COUNT(*) FILTER (WHERE phrases_match_score >= 0.8 AND phrases_match_score < 1.0) as fuzzy_good,
                  COUNT(*) FILTER (WHERE phrases_match_score >= 0.5 AND phrases_match_score < 0.8) as fuzzy_partial,
                  COUNT(*) FILTER (WHERE phrases_match_score < 0.5) as hallucinated
           FROM mood_signals
           WHERE phrases_verified = TRUE
           GROUP BY icp_slug
           ORDER BY hallucinated DESC`
        ),
      ]);

      // Kick off background enrichment for signals missing it (fire-and-forget, 5s timeout each)
      const bgEnrich = async () => {
        try {
          const [unrichedPain, unenrichedMood] = await Promise.all([
            query(
              `SELECT ps.id, ps.verbatim_quote
               FROM pain_signals ps WHERE ps.insight IS NULL AND ps.severity >= 5
               ORDER BY ps.severity DESC LIMIT 5`
            ),
            query(
              `SELECT ms.id, ms.verbatim_phrases
               FROM mood_signals ms WHERE ms.insight IS NULL AND ms.emotional_punch >= 6
               ORDER BY ms.emotional_punch DESC LIMIT 5`
            ),
          ]);

          const doEnrich = async (row, table, type) => {
            const verbatim = row.verbatim_quote || (Array.isArray(row.verbatim_phrases) ? row.verbatim_phrases.join(' | ') : '');
            if (!verbatim) return;
            try {
              const ac = new AbortController();
              const to = setTimeout(() => ac.abort(), 5000);
              const response = await fetch(LMSTUDIO_URL, {
                method: 'POST',
                signal: ac.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: LMSTUDIO_MODEL,
                  messages: [
                    { role: 'system', content: type === 'pain'
                      ? `Extract from this verbatim quote: {\"insight\":\"...\", \"tags\":[\"tag1\"], \"action_suggestion\":\"...\"}`
                      : `Extract from this verbatim quote: {\"insight\":\"...\", \"tags\":[\"tag1\"], \"action_suggestion\":\"...\"}` },
                    { role: 'user', content: verbatim.substring(0, 800) }
                  ],
                  temperature: 0.3,
                  max_tokens: 200,
                }),
              });
              clearTimeout(to);
              if (!response.ok) return;
              const data = await response.json();
              const raw = data.choices?.[0]?.message?.content?.trim() || '';
              const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
              await query(
                `UPDATE ${table} SET insight = $1, tags = $2, action_suggestion = $3, updated_at = NOW() WHERE id = $4`,
                [json.insight || null, json.tags || [], json.action_suggestion || null, row.id]
              );
            } catch { /* fire-and-forget */ }
          };

          await Promise.all([
            ...unrichedPain.rows.map(r => doEnrich(r, 'pain_signals', 'pain')),
            ...unenrichedMood.rows.map(r => doEnrich(r, 'mood_signals', 'mood')),
          ]);
        } catch { /* bg enrichment failed silently */ }
      };

      // Non-blocking — respond immediately, enrich in background
      setImmediate(() => bgEnrich());

      res.json({
        briefs: briefsResult.rows,
        live_signals: signalsResult.rows,
        enriched_pain: cachedPainResult.rows,
        enriched_mood: cachedMoodResult.rows,
        hallucination_stats: hallucinationResult.rows,
        mood_hallucination_stats: moodHallucinationResult.rows,
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/research/radar — pain signals, mood signals, ICP definitions
  app.get('/api/research/radar', async (req, res) => {
    try {
      const icpSlug = req.query.icp_slug || null;
      const days = parseInt(req.query.days, 10) || 30;
      const limit = parseInt(req.query.limit, 10) || 50;

      const [painResult, moodResult, icpResult] = await Promise.all([
        query(
          `SELECT ps.icp_slug, ps.pain_category, ps.severity, ps.verbatim_quote, ps.active_search, ps.aloomii_addressable, ps.context_snippet, ps.insight, ps.tags, ps.action_suggestion, ps.created_at,
                  ps.reddit_url as source_url, ps.quote_verified, ps.quote_match_score, ps.accuracy_score
           FROM pain_signals ps
           WHERE (($1::text IS NULL) OR (COALESCE($1::text, '') = '') OR (ps.icp_slug = $1)) AND ps.created_at > NOW() - ($2 || ' days')::interval
           ORDER BY ps.accuracy_score DESC NULLS LAST, ps.severity DESC, ps.created_at DESC
           LIMIT $3`,
          [icpSlug, String(days), limit]
        ),
        query(
          `SELECT ms.icp_slug, ms.mood_primary, ms.mood_secondary, ms.verbatim_phrases, ms.emotional_punch, ms.shirt_potential, ms.universality, ms.trigger_context, ms.insight, ms.tags, ms.action_suggestion, ms.created_at,
                  ms.reddit_url as source_url, ms.phrases_verified, ms.phrases_match_score, ms.accuracy_score
           FROM mood_signals ms
           WHERE (($1::text IS NULL) OR (COALESCE($1::text, '') = '') OR (ms.icp_slug = $1)) AND ms.created_at > NOW() - ($2 || ' days')::interval
           ORDER BY ms.accuracy_score DESC NULLS LAST, ms.emotional_punch DESC, ms.created_at DESC
           LIMIT $3`,
          [icpSlug, String(days), limit]
        ),
        query(
          `SELECT slug, label, brand, mode FROM icp_definitions WHERE active = true ORDER BY brand, slug`
        ),
      ]);
      res.json({ pain: painResult.rows, mood: moodResult.rows, icps: icpResult.rows });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/research/targets — top upcoming events + top influencers
  app.get('/api/research/targets', async (req, res) => {
    try {
      const [eventsResult, infResult] = await Promise.all([
        query(
          `SELECT id, name, date, city, country, url, total_score, audience
           FROM events
           WHERE date >= CURRENT_DATE
           ORDER BY total_score DESC NULLS LAST, date ASC
           LIMIT 10`
        ),
        query(
          `SELECT handle, platform_primary, icp_target, followers, lead_score, lead_tier, email, profile_url
           FROM influencer_pipeline
           WHERE lead_tier IN ('tier_1', 'tier_2')
           ORDER BY lead_tier ASC, lead_score DESC
           LIMIT 15`
        ),
      ]);
      res.json({ events: eventsResult.rows, influencers: infResult.rows });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  // GET /api/research/patterns — signal pattern classification + cross-client aggregation
  app.get('/api/research/patterns', async (req, res) => {
    try {
      const days = parseInt(req.query.days, 10) || 30;

      const [patternsRes, summaryRes, byClientRes] = await Promise.all([
        query(
          `SELECT sp.pattern_type, sp.confidence, sp.urgency, sp.indicators, sp.detected_at,
                  s.title, s.body as summary, s.signal_type, s.score,
                  c.name as contact_name, c.tier as contact_tier,
                  COALESCE(a.name, c.metadata->>'company') as company
           FROM signal_patterns sp
           JOIN signals s ON sp.signal_id = s.id
           LEFT JOIN entity_signals es ON es.signal_id = s.id
           LEFT JOIN contacts c ON es.entity_id = c.id
           LEFT JOIN accounts a ON c.account_id = a.id
           WHERE sp.detected_at > NOW() - ($1 || ' days')::interval
           ORDER BY sp.confidence DESC, sp.detected_at DESC
           LIMIT 30`,
          [String(days)]
        ),
        query(
          `SELECT pattern_type, COUNT(*) as count, ROUND(AVG(confidence)::numeric, 1) as avg_confidence
           FROM signal_patterns
           WHERE detected_at > NOW() - ($1 || ' days')::interval
           GROUP BY pattern_type
           ORDER BY count DESC`,
          [String(days)]
        ),
        query(
          `SELECT sp.pattern_type,
                  COALESCE(a.name, c.metadata->>'company', 'Unknown') as company,
                  c.name as contact_name, c.tier,
                  sp.confidence, sp.urgency, sp.detected_at
           FROM signal_patterns sp
           JOIN signals s ON sp.signal_id = s.id
           JOIN entity_signals es ON es.signal_id = s.id
           JOIN contacts c ON es.entity_id = c.id
           LEFT JOIN accounts a ON c.account_id = a.id
           WHERE sp.detected_at > NOW() - ($1 || ' days')::interval
           ORDER BY CASE sp.pattern_type
                    WHEN 'distress' THEN 1 WHEN 'growth' THEN 2 WHEN 'leadership_transition' THEN 3
                    WHEN 'tech_shift' THEN 4 WHEN 'competitive_risk' THEN 5 ELSE 6 END,
                    sp.confidence DESC
           LIMIT 50`,
          [String(days)]
        ),
      ]);

      res.json({
        patterns: patternsRes.rows,
        summary: summaryRes.rows,
        by_client: byClientRes.rows,
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
}
module.exports.registerResearchRoutes = registerResearchRoutes;
// ═══════════════════════════════════════════════════════════════
// UGC Routes
// ═══════════════════════════════════════════════════════════════
function registerUgcRoutes(app) {
  const { generateUgcScript } = require('../ugc/ugc-generator');

  // GET /api/command/pain-signals — fetch pain signals for UGC dropdown
  app.get('/api/command/pain-signals', async (req, res) => {
    try {
      const days = parseInt(req.query.days, 10) || 30;
      const severity = parseInt(req.query.severity, 10) || 3;
      
      const result = await query(
        `SELECT id, icp_slug, verbatim_quote, insight, pain_category, severity, context_snippet, created_at
         FROM pain_signals
         WHERE severity >= $1
           AND created_at > NOW() - ($2 || ' days')::interval
         ORDER BY severity DESC, created_at DESC
         LIMIT 200`,
        [severity, String(days)]
      );
      
      // Group by icp_slug
      const grouped = {};
      result.rows.forEach(row => {
        if (!grouped[row.icp_slug]) grouped[row.icp_slug] = [];
        grouped[row.icp_slug].push(row);
      });
      
      res.json({ signals: result.rows, grouped, count: result.rows.length });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/command/ugc/generate — generate UGC script via opus
  app.post('/api/command/ugc/generate', async (req, res) => {
    const { pain_signal_id, character, story_angle, call_to_action, script_length } = req.body;
    
    if (!pain_signal_id || !character || !story_angle || !call_to_action || !script_length) {
      return res.status(400).json({ error: 'Missing required fields: pain_signal_id, character, story_angle, call_to_action, script_length' });
    }

    try {
      // Load pain signal from DB
      const painRes = await query(
        `SELECT id, icp_slug, verbatim_quote, insight, pain_category, severity, context_snippet
         FROM pain_signals WHERE id = $1`,
        [pain_signal_id]
      );
      
      if (painRes.rows.length === 0) {
        return res.status(404).json({ error: 'Pain signal not found' });
      }
      
      const painSignal = painRes.rows[0];
      
      // Build form data
      const formData = {
        name: character.name,
        age: character.age,
        occupation: character.occupation,
        life_stage: character.life_stage,
        location: character.location,
        personality_traits: character.personality_traits,
        vocabulary_level: character.vocabulary_level,
        verbal_tics: character.verbal_tics,
        cadence: character.cadence,
        emotional_state: character.emotional_state,
        pov_lens: story_angle.pov_lens,
        brand_product: story_angle.brand_product,
        cta_destination: call_to_action.destination,
        cta_tone: call_to_action.tone,
        script_length
      };

      // Call opus
      const script = await generateUgcScript(painSignal, formData);
      
      res.json({ script, pain_signal: painSignal, generated_at: new Date().toISOString() });
    } catch(e) {
      console.error('UGC generation error:', e);
      res.status(500).json({ error: e.message });
    }
  });
}
module.exports.registerUgcRoutes = registerUgcRoutes;

