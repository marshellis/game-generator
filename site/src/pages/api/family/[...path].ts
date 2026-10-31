import type { APIRoute } from "astro";
import { handle } from "../../../lib/family/router";
import "../../../lib/family/register"; // registers learning / wallet / billing / store routes
import { upstashKV } from "../../../lib/family/kv";
import { upstashStore } from "../../../lib/profile/store";
import { PARENT_COOKIE, HOUSEHOLD_COOKIE } from "../../../lib/family/accounts";
import { SESSION_COOKIE } from "../../../lib/profile/session";
import { originAllowed, selfOrigins, forbidden } from "../../../lib/origin";

export const prerender = false;

const run: APIRoute = async ({ request, params, cookies, url }) => {
  if (!originAllowed(request.method, request.headers.get("origin"), selfOrigins(request, url))) return forbidden();
  let body: Record<string, unknown> = {};
  let raw = "";
  if (request.method !== "GET") {
    raw = await request.text();
    try { const j = JSON.parse(raw); if (j && typeof j === "object") body = j; } catch { /* non-JSON bodies (webhooks) use raw */ }
  }
  const res = await handle(
    {
      method: request.method, path: (params.path ?? "").split("/").filter(Boolean), body, raw,
      tokens: { parent: cookies.get(PARENT_COOKIE)?.value, household: cookies.get(HOUSEHOLD_COOKIE)?.value },
      childToken: cookies.get(SESSION_COOKIE)?.value,
      query: Object.fromEntries(url.searchParams), headers: Object.fromEntries(request.headers),
    },
    { kv: upstashKV(), store: upstashStore(), secret: process.env.SESSION_SECRET ?? "", now: Date.now() },
  );
  for (const c of res.cookies ?? []) {
    if (c.clear) cookies.delete(c.name, { path: "/" });
    else cookies.set(c.name, c.value ?? "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: c.maxAgeSec });
  }
  return new Response(res.json === undefined ? null : JSON.stringify(res.json), {
    status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
export const GET = run, POST = run, PATCH = run, DELETE = run;
