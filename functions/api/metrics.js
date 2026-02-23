export async function onRequestGet(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
  };

  try {
    const data = await context.env.ACCESS_REQUESTS.get("live_metrics");

    if (!data) {
      return new Response(JSON.stringify({ error: "No metrics data yet" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    return new Response(data, {
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
