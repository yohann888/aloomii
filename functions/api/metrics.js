// GET /api/metrics
// Reads live metrics from Cloudflare KV
export async function onRequestGet({ env }) {
  try {
    // Try to get both, but prioritize business metrics for the main response
    const bizData = await env.ALOOMII_METRICS.get('metrics:business', { type: 'json' });
    const opsData = await env.ALOOMII_METRICS.get('metrics:ops', { type: 'json' });

    // Fallback to the old 'metrics' key if neither exist (migration period)
    if (!bizData && !opsData) {
      const legacyData = await env.ALOOMII_METRICS.get('metrics', { type: 'json' });
      if (legacyData) return new Response(JSON.stringify(legacyData), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Combine them
    const combined = {
      ...(bizData || {}),
      cron_fleet: opsData ? opsData.cron_fleet : undefined,
      updated_at: new Date().toISOString()
    };

    // If we have nothing, return the hardcoded defaults
    if (!bizData && !opsData) {
      return new Response(JSON.stringify({
        error: 'No metrics data yet',
        economics: { weekly_cost_usd: 11.63, human_value_usd: 1536, roi_multiplier: 132,
          breakdown: { content_drafts: 50, contacts_managed: 640, hot_leads: 740, signals_scanned: 106 }
        },
        pipeline: { hot_leads_this_week: 37, signals_detected: 53, active_opportunities: 0,
          est_pipeline_value: 114000, network_contacts: 128 }
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify(combined), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
