export async function onRequestPost(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const { name, email, company, service, budget, timeline, details } = await context.request.json();

    if (!name || !email) {
      return new Response(JSON.stringify({ error: "Name and email are required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Store inquiry in KV
    const timestamp = new Date().toISOString();
    const key = `contact_${timestamp}_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;

    await context.env.ACCESS_REQUESTS.put(key, JSON.stringify({
      name,
      email,
      company: company || "",
      service: service || "",
      budget: budget || "",
      timeline: timeline || "",
      details: details || "",
      timestamp,
      type: "consultation_request",
      status: "new"
    }));

    // Try to send email notification via Worker (best-effort)
    try {
      if (context.env.EMAIL_WORKER) {
        await context.env.EMAIL_WORKER.fetch(
          new Request("https://internal/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              email,
              subject: `New Consultation Request from ${name}${company ? ` (${company})` : ''}`,
              message: `New consultation request via aloomii.com\n\nName: ${name}\nEmail: ${email}\nCompany: ${company || 'N/A'}\nService Interest: ${service || 'N/A'}\nBudget Range: ${budget || 'N/A'}\nTimeline: ${timeline || 'N/A'}\n\nProject Details:\n${details || 'No details provided.'}\n\nReply directly to ${email} to follow up.`
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
