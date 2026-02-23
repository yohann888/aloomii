export async function onRequestPost(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const { name, email } = await context.request.json();

    if (!name || !email) {
      return new Response(JSON.stringify({ error: "Name and email are required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Store request in KV
    const timestamp = new Date().toISOString();
    const key = `request_${timestamp}_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;

    await context.env.ACCESS_REQUESTS.put(key, JSON.stringify({
      name,
      email,
      timestamp,
      status: "pending"
    }));

    // Also try to send email via the Worker (best-effort, don't fail if it errors)
    try {
      if (context.env.EMAIL_WORKER) {
        await context.env.EMAIL_WORKER.fetch(
          new Request("https://internal/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email }),
          })
        );
      }
    } catch (emailErr) {
      // Email sending failed — that's OK, request is stored in KV
      console.log("Email notification failed:", emailErr.message);
    }

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
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
