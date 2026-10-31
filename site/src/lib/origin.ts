/**
 * CSRF / cross-origin guard for state-changing API calls. Browsers always send `Origin` on a cross-origin
 * POST/PATCH/DELETE; if it is present and not ours, refuse. A missing Origin (curl, server-to-server such as
 * Stripe/RevenueCat webhooks, same-origin GETs) is allowed: those carry their own auth (signatures, cookies
 * that a cross-site page cannot make the browser send with a foreign Origin).
 *
 * This also covers SameSite's blind spot: sibling subdomains (e.g. the isolated arcade origin) are the same
 * *site*, so Lax cookies would otherwise ride along on their cross-origin requests.
 */
export function originAllowed(method: string, originHeader: string | null | undefined, selfOrigin: string | string[]): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (!originHeader) return true;
  return (Array.isArray(selfOrigin) ? selfOrigin : [selfOrigin]).includes(originHeader);
}

/** Every origin this deployment legitimately answers as (behind a proxy `url.origin` can differ from the public host). */
export function selfOrigins(request: Request, url: URL, site = "https://games.marshellis.com"): string[] {
  const out = new Set([url.origin, new URL(site).origin]);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) out.add(`https://${host}`);
  return [...out];
}

export const forbidden = () =>
  new Response(JSON.stringify({ error: "cross-origin" }), { status: 403, headers: { "content-type": "application/json" } });
