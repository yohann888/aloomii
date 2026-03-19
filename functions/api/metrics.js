// GET /api/metrics
// Reads live metrics from Cloudflare KV (merged from business and ops keys)
export async function onRequestGet({ env }) {
  try {
    // Parallel fetch from both KV keys
    const [bizData, opsData] = await Promise.all([
      env.ALOOMII_METRICS.get('metrics:business', { type: 'json' }),
      env.ALOOMII_METRICS.get('metrics:ops', { type: 'json' })
    ]);

    // Fallback/Legacy: check the old 'metrics' key if new keys are empty
    let legacyData = null;
    if (!bizData && !opsData) {
      legacyData = await env.ALOOMII_METRICS.get('metrics', { type: 'json' });
    }

    // Merge results
    const merged = {
      timestamp: new Date().toISOString(),
      ...(legacyData || {}),
      ...(bizData || {}),
      ...(opsData || {})
    };

    // If still no data, return static defaults
    if (!bizData && !opsData && !legacyData) {
      return new Response(JSON.stringify({
        error: 'No metrics data yet',
        economics: { weekly_cost_usd: 7.42, human_value_usd: 1083, roi_multiplier: 146,
          breakdown: { content_drafts: 800, contacts_managed: 235, hot_leads: 40, signals_scanned: 8 }
        },
        pipeline: { hot_leads_this_week: 2, signals_detected: 4, active_opportunities: 4,
          est_pipeline_value: 28500, network_contacts: 48 }
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify(merged), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
