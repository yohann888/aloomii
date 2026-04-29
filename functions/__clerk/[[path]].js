// Cloudflare Pages Function: proxy /__clerk/* to app.aloomii.com/__clerk/*
// Why: Clerk's dashboard locks the proxy URL prefix to the apex domain
// (https://aloomii.com/__clerk/), but our Next.js worker with Clerk
// middleware lives on app.aloomii.com. This function forwards the request
// to the worker, which has clerkMiddleware({ frontendApiProxy: { enabled: true } })
// to handle the actual Clerk frontend API protocol.
//
// Flow: browser -> aloomii.com/__clerk/* (this fn) -> app.aloomii.com/__clerk/* (worker) -> Clerk frontend API
//
// Reference: https://clerk.com/docs/advanced-usage/using-proxies

const UPSTREAM = "https://app.aloomii.com";

export async function onRequest(context) {
  const { request } = context;
  const incomingUrl = new URL(request.url);

  // Build upstream URL: keep path (/__clerk/*) and query string verbatim
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, UPSTREAM);

  // Clone headers but force the Host to the upstream worker so Cloudflare
  // routes correctly and the Next.js middleware sees the right host.
  const headers = new Headers(request.headers);
  headers.set("host", "app.aloomii.com");

  // Tell Clerk middleware (and Clerk's edge) that the proxy lives on the apex.
  // The proxy URL registered in Clerk Dashboard is https://aloomii.com/__clerk
  // The Next.js middleware uses this header (or X-Forwarded-Host) to set
  // the Clerk-Proxy-Url header that Clerk's edge requires.
  headers.set("x-forwarded-host", "aloomii.com");
  headers.set("x-forwarded-proto", "https");
  // Trailing slash REQUIRED — Clerk does exact-match against Dashboard config.
  headers.set("clerk-proxy-url", "https://aloomii.com/__clerk/");

  // Forward the original client IP
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
  }

  // Strip CF-specific headers that could confuse the upstream.
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("x-real-ip");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  // Only attach a body for methods that allow one
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = request.body;
  }

  const upstreamResponse = await fetch(upstreamUrl.toString(), init);

  // Pass response through. Clerk's middleware already sets correct CORS headers.
  // Strip hop-by-hop / cookie-domain-tied headers that would break on this domain.
  const respHeaders = new Headers(upstreamResponse.headers);
  // Remove transfer-encoding to let CF rechunk
  respHeaders.delete("transfer-encoding");
  respHeaders.delete("connection");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: respHeaders,
  });
}
