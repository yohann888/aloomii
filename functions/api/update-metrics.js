// POST /api/update-metrics
// Writes new metrics to Cloudflare KV (auth protected)
export async function onRequestPost({ request, env }) {
  // Auth check
  const authHeader = request.headers.get('Authorization');
  const apiKey = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!apiKey || apiKey !== env.METRICS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();

    // Stamp with server time
    body.updated_at = new Date().toISOString();

    await env.ALOOMII_METRICS.put('metrics', JSON.stringify(body));

    return new Response(JSON.stringify({ success: true, updated_at: body.updated_at }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
