// GET /api/metrics
// Reads live metrics from Cloudflare KV
export async function onRequestGet({ env }) {
  try {
    const data = await env.ALOOMII_METRICS.get('metrics', { type: 'json' });

    if (!data) {
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

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
