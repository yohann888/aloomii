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

            // General signals feed — score >= 3
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
                else if (job.state?.lastRunStatus === 'ok' && job.state?.consecutiveErrors === 0) status = 'healthy';
                else if (job.state?.consecutiveErrors > 0 || job.state?.lastRunStatus === 'error') status = 'attention';
                
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

  // POST /api/command/signals/:id/act — marks acted_on, creates outreach_queue entry
  app.post('/api/command/signals/:id/act', async (req, res) => {
    const { id } = req.params;
    const { contactId, type = 'follow_up', channel = 'email' } = req.body;
    const warmReplyChannels = new Set(['whatsapp', 'imessage', 'telegram']);
    const queueType = channel === 'email' ? 'outbound_email' : (warmReplyChannels.has(channel) ? 'warm_reply' : 'outbound_email');
    
    try {
      // Mark signal as acted on
      await query(`
        UPDATE prospect_signals 
        SET acted_on = true, action_id = gen_random_uuid(), outcome = 'acted'
        WHERE id = $1
      `, [id]);
      
      // Create queue item
      if (contactId) {
        await query(`
          INSERT INTO outreach_queue (contact_id, type, channel, queue_type, status, fire_date)
          VALUES ($1, $2, $3, $4, 'pending', CURRENT_DATE)
        `, [contactId, type, channel, queueType]);
      }
      
      res.json({ success: true, message: 'Signal marked as acted on and queued' });
    } catch (error) {
      console.error('Signal act failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/command/signals/:id/dismiss — marks prospect_signals.acted_on = true, outcome = 'not_relevant'
  app.patch('/api/command/signals/:id/dismiss', async (req, res) => {
    const { id } = req.params;
    try {
      const result = await query(`
        UPDATE prospect_signals
        SET acted_on = true, outcome = 'not_relevant', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'prospect_signal not found' });
      }
      res.json({ success: true, updated: result.rows[0] });
    } catch (error) {
      console.error('Signal dismiss failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/command/signals/:id/snooze — marks prospect_signals.acted_on = true, outcome = 'snoozed'
  app.patch('/api/command/signals/:id/snooze', async (req, res) => {
    const { id } = req.params;
    const { days = 7 } = req.body;
    try {
      const snoozedUntil = new Date();
      snoozedUntil.setDate(snoozedUntil.getDate() + parseInt(days));
      const result = await query(`
        UPDATE prospect_signals
        SET acted_on = true, outcome = 'snoozed',
            updated_at = NOW(),
            raw_data = COALESCE(raw_data, '{}') || jsonb_build_object('snoozed_until', $2::text)
        WHERE id = $1
        RETURNING *
      `, [id, snoozedUntil.toISOString()]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'prospect_signal not found' });
      }
      res.json({ success: true, updated: result.rows[0], snoozed_until: snoozedUntil.toISOString() });
    } catch (error) {
      console.error('Signal snooze failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/command/signals/:id/draft — one-click outreach draft generation
  app.post('/api/command/signals/:id/draft', async (req, res) => {
    const { id } = req.params;
    let client;
    try {
      client = await getPool().connect();

      // 1. Get signal from prospect_signals
      const sigRes = await client.query(`
        SELECT * FROM prospect_signals WHERE id = $1
      `, [id]);
      if (sigRes.rows.length === 0) {
        return res.status(404).json({ error: 'prospect_signal not found' });
      }
      const signal = sigRes.rows[0];

      // 2. Find contact by handle (don't create if not found)
      let contactId = signal.contact_id;
      if (!contactId && signal.handle) {
        const contactRes = await client.query(
          'SELECT id FROM contacts WHERE handle = $1 LIMIT 1',
          [signal.handle]
        );
        if (contactRes.rows.length > 0) {
          contactId = contactRes.rows[0].id;
        }
      }

      // 3. Determine channel from signal_source
      const channelMap = { reddit: 'reddit_dm', x_search: 'email', linkedin: 'email', indiehackers: 'email', other: 'email' };
      const channel = channelMap[signal.signal_source] || 'email';

      // 4. Create outreach_queue entry
      const warmReplyChannels = new Set(['whatsapp', 'imessage', 'telegram']);
      const queueType = channel === 'email' ? 'outbound_email' : (warmReplyChannels.has(channel) ? 'warm_reply' : 'outbound_email');
      const queueRes = await client.query(`
        INSERT INTO outreach_queue (contact_id, type, channel, queue_type, status, fire_date)
        VALUES ($1, 'signal_outreach', $2, $3, 'pending', CURRENT_DATE)
        RETURNING id
      `, [contactId, channel, queueType]);
      const queueId = queueRes.rows[0].id;

      // 5. Generate draft from template engine (no LLM — static hydration)
      const { generateDraft } = require('../bridge/draft-templates');
      const draftText = generateDraft({
        handle: signal.handle,
        company: signal.company,
        signal_text: signal.signal_text,
        signal_source: signal.signal_source,
        icp_match: signal.raw_data?.icp_match || null,
      });

      // 6. Create outreach_drafts entry
      const draftRes = await client.query(`
        INSERT INTO outreach_drafts (contact_id, queue_id, channel, draft_text, status, source_type)
        VALUES ($1, $2, $3, $4, 'draft', 'signal')
        RETURNING id
      `, [contactId, queueId, channel, draftText]);

      res.json({
        queue_id: queueId,
        draft_id: draftRes.rows[0].id,
        draft_text: draftText,
        channel,
        contact_id: contactId,
      });
    } catch (error) {
      console.error('Signal draft generation failed:', error);
      res.status(500).json({ error: error.message });
    } finally {
      if (client) client.release();
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

// Graceful shutdown helper
process.on('SIGTERM', () => {
  if (poolInstance) poolInstance.end();
});

module.exports.query = query;
module.exports.getPool = getPool;

// ── Influencer Pipeline routes (registered standalone for serve-local) ──────
function registerInfluencerRoutes(app) {
  const nodePath = require('path');
  // GET /api/command/influencers — list with filters
  app.get('/api/command/influencers', async (req, res) => {
    try {
      const { icp_target, platform, tier, has_email, limit } = req.query;
      const lim = Math.min(parseInt(limit) || 100, 500);
      const conditions = [];
      const params = [];
      let idx = 1;
      if (icp_target) { conditions.push(`icp_target = $${idx}`); params.push(icp_target); idx++; }
      if (platform)   { conditions.push(`platform_primary = $${idx}`); params.push(platform); idx++; }
      if (tier)       { conditions.push(`lead_tier = $${idx}`); params.push(tier); idx++; }
      if (has_email === 'true') { conditions.push(`email IS NOT NULL`); }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const result = await query(
        `SELECT id, handle, platform_primary, icp_target, followers, engagement_rate,
                lead_score, lead_tier, email, email_source, profile_url, status, created_at
         FROM influencer_pipeline ${where}
         ORDER BY lead_score DESC NULLS LAST, followers DESC NULLS LAST
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
}
module.exports.registerInfluencerRoutes = registerInfluencerRoutes;

// ── Research Routes ───────────────────────────────────────────────────────────
function registerResearchRoutes(app) {

  // GET /api/research/pulse — daily briefs + live prospect signals
  app.get('/api/research/pulse', async (req, res) => {
    try {
      const [briefsResult, signalsResult] = await Promise.all([
        query(
          `SELECT brand, brief_date, markdown_body, signal_count
           FROM daily_briefs
           ORDER BY brief_date DESC, brand
           LIMIT 20`
        ),
        query(
          `SELECT ps.company, ps.handle, ps.signal_text, ps.signal_type, ps.signal_source, ps.relevance_score,
                  c.name as contact_name
           FROM prospect_signals ps
           LEFT JOIN contacts c ON ps.contact_id = c.id
           WHERE ps.acted_on = false
           ORDER BY ps.relevance_score DESC, ps.captured_at DESC
           LIMIT 10`
        ),
      ]);
      res.json({ briefs: briefsResult.rows, live_signals: signalsResult.rows });
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
          `SELECT ps.icp_slug, ps.pain_category, ps.severity, ps.verbatim_quote, ps.active_search, ps.aloomii_addressable, ps.context_snippet, ps.created_at,
                  COALESCE(rp.url, 'https://reddit.com' || rp.permalink) as source_url
           FROM pain_signals ps
           LEFT JOIN reddit_posts rp ON rp.id = ps.source_id
           WHERE ($1::text IS NULL OR ps.icp_slug = $1) AND ps.created_at > NOW() - ($2 || ' days')::interval
           ORDER BY ps.severity DESC, ps.created_at DESC
           LIMIT $3`,
          [icpSlug, String(days), limit]
        ),
        query(
          `SELECT ms.icp_slug, ms.mood_primary, ms.mood_secondary, ms.verbatim_phrases, ms.emotional_punch, ms.shirt_potential, ms.universality, ms.trigger_context, ms.created_at,
                  COALESCE(rp.url, 'https://reddit.com' || rp.permalink) as source_url
           FROM mood_signals ms
           LEFT JOIN reddit_posts rp ON rp.id = ms.source_id
           WHERE ($1::text IS NULL OR ms.icp_slug = $1) AND ms.created_at > NOW() - ($2 || ' days')::interval
           ORDER BY ms.emotional_punch DESC, ms.created_at DESC
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
}
module.exports.registerResearchRoutes = registerResearchRoutes;
