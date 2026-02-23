export async function onRequestGet(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  // Simple auth check via query param
  const url = new URL(context.request.url);
  const auth = url.searchParams.get("auth");

  // Same password as the dashboard gate
  if (auth !== "aloomii888") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  try {
    // List all entries from KV (access requests + consultation inquiries + newsletter)
    const prefixes = ["request_", "contact_", "newsletter_"];
    const requests = [];

    for (const prefix of prefixes) {
      const list = await context.env.ACCESS_REQUESTS.list({ prefix });
      for (const key of list.keys) {
        const value = await context.env.ACCESS_REQUESTS.get(key.name);
        if (value) {
          requests.push(JSON.parse(value));
        }
      }
    }

    // Sort by timestamp descending (newest first)
    requests.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return new Response(JSON.stringify({ success: true, requests, count: requests.length }), {
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
