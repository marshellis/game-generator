import type { APIRoute } from "astro";
import { e2eMemory } from "../../../lib/e2e";
import { upstashKV } from "../../../lib/family/kv";
import { verifyToken } from "../../../lib/family/token";
import { GUEST_COOKIE } from "../../../lib/family/accounts";
import { emptyDay, type Day } from "../../../lib/family/wallet";

export const prerender = false;

/** E2E-only (404 anywhere else): fast-forward a guest's day so a browser test can reach the limit without waiting 15 minutes. */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!e2eMemory()) return new Response(null, { status: 404 });
  const id = verifyToken("guest", cookies.get(GUEST_COOKIE)?.value, process.env.SESSION_SECRET ?? "", Math.floor(Date.now() / 1000), 365 * 24 * 3600);
  if (!id) return new Response(JSON.stringify({ error: "no-guest" }), { status: 400 });
  const kv = upstashKV(), key = `guest:${id}:day:${new Date().toISOString().slice(0, 10)}`;
  const day = (await kv.get<Day>(key)) ?? emptyDay();
  const seconds = Number((await request.json().catch(() => ({}))).seconds) || 0;
  await kv.set(key, { ...day, spentSec: day.spentSec + seconds }, { ttlSec: 3 * 24 * 3600 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
};
