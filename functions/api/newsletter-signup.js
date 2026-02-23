export async function onRequestPost(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const { email } = await context.request.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Store in KV
    const timestamp = new Date().toISOString();
    const key = `newsletter_${timestamp}_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;

    await context.env.ACCESS_REQUESTS.put(key, JSON.stringify({
      email,
      timestamp,
      type: "newsletter",
      status: "subscribed"
    }));

    // Try to send email notification via Worker (best-effort)
    try {
      if (context.env.EMAIL_WORKER) {
        await context.env.EMAIL_WORKER.fetch(
          new Request("https://internal/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Newsletter Subscriber",
              email,
              subject: `New Newsletter Signup: ${email}`,
              message: `New newsletter signup on aloomii.com\n\nEmail: ${email}\nTime: ${timestamp}`
            }),
          })
        );
      }
    } catch (emailErr) {
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
