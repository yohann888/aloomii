async function sendResendEmail(apiKey, { to, subject, html }) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Aloomii Inbox <inbox@aloomii.com>",
      to,
      subject,
      html,
    }),
  });
}

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

    // Send email notification via Resend
    try {
      if (context.env.RESEND_API_KEY) {
        await sendResendEmail(context.env.RESEND_API_KEY, {
          to: ["yohann@aloomii.com"],
          subject: `New newsletter signup: ${email}`,
          html: `
            <h2>New Newsletter Signup</h2>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p><strong>Time:</strong> ${timestamp}</p>
            <hr>
            <p><a href="https://aloomii.com/admin-inbox">View inbox</a></p>
          `,
        });
      }
    } catch (emailErr) {
      console.log("Resend notification failed:", emailErr.message);
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
