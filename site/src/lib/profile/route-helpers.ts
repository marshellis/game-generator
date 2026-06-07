import type { AstroCookies } from "astro";
import { SESSION_COOKIE } from "./session";
import { upstashStore } from "./store";
import type { Deps, HandlerResult } from "./types";

export function deps(): Deps {
  return {
    store: upstashStore(),
    secret: process.env.SESSION_SECRET ?? "",
    now: Date.now(),
  };
}

export function readToken(cookies: AstroCookies): string | undefined {
  return cookies.get(SESSION_COOKIE)?.value;
}

export function applyCookie(cookies: AstroCookies, res: HandlerResult): void {
  if (!res.cookie) return;
  if ("clear" in res.cookie) {
    cookies.delete(SESSION_COOKIE, { path: "/" });
    return;
  }
  cookies.set(SESSION_COOKIE, res.cookie.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: res.cookie.maxAgeSec,
  });
}

export function toResponse(res: HandlerResult): Response {
  return new Response(res.json === undefined ? null : JSON.stringify(res.json), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = await request.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
