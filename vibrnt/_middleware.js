/**
 * Vibrnt Dashboard — Public Access
 * Passthrough — no auth gate. Serves dist/index.html with embedded data.
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Serve the pre-built dashboard HTML for the root
  if (url.pathname === '/vibrnt' || url.pathname === '/vibrnt/' || url.pathname === '/vibrnt/index.html') {
    const html = await env.ASSETS.fetch(new Request(url.origin + '/vibrnt/dist/index.html'));
    return new Response(html.body, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  return context.next();
}
