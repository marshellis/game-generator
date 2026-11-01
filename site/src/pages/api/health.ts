import type { APIRoute } from "astro";
import { healthCheck } from "../../lib/health";
import { upstashKV } from "../../lib/family/kv";

export const prerender = false;

// Public, read-only, secret-free: used by the uptime monitor (.github/workflows/health.yml) and by humans.
export const GET: APIRoute = async () => {
  const h = await healthCheck(upstashKV(), process.env);
  return new Response(JSON.stringify(h), { status: h.ok ? 200 : 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
};
