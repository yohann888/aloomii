export async function onRequestPost(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  try {
    // Auth check — requires METRICS_API_KEY
    const authHeader = context.request.headers.get("Authorization");
    const apiKey = context.env.METRICS_API_KEY;

    if (!apiKey || !authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const metrics = await context.request.json();

    // Store the full metrics blob in KV under a single key
    await context.env.ACCESS_REQUESTS.put(
      "live_metrics",
      JSON.stringify({
        ...metrics,
        updated_at: new Date().toISOString(),
      })
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
