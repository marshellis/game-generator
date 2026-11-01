// The simulation "world": everything the site's server side needs, in memory, with a clock the test
// controls. Same handlers production runs (profile/handlers + family/router); only storage is fake.
//
//   const w = createWorld();           // fresh universe, clock at 2026-10-30 18:00 UTC
//   const phone = w.browser();         // a browser with its own cookie jar
//   await phone.post("/api/family/parent/signup", {...});
//   w.advance(60_000);                 // time passes for every server-side check
//
// Everything is deterministic: no real time, no network, no randomness unless you pass a seed.
import { memoryKV } from "../../src/lib/family/kv";
import type { FamilyDeps } from "../../src/lib/family/accounts";
import "../../src/lib/family/register";
import { handle } from "../../src/lib/family/router";
import * as P from "../../src/lib/profile/handlers";
import { PARENT_COOKIE, HOUSEHOLD_COOKIE } from "../../src/lib/family/accounts";
import { SESSION_COOKIE } from "../../src/lib/profile/session";
import { originAllowed } from "../../src/lib/origin";

export const SITE_ORIGIN = "https://games.marshellis.com";
export const ARCADE_ORIGIN = "https://play.marshellis.com";

export const DEFAULT_SECRET = "sim-secret-sim-secret-sim-secret-32";
export const DEFAULT_START = Date.UTC(2026, 9, 30, 18, 0, 0);

export { memoryStore } from "../../src/lib/profile/memory-store";
import { memoryStore } from "../../src/lib/profile/memory-store";

export interface World {
  kv: ReturnType<typeof memoryKV>;
  store: ReturnType<typeof memoryStore>;
  secret: string;
  now: number;
  /** Move the world clock forward (ms). Cookies expire against it too. */
  advance(ms: number): void;
  setTime(ms: number): void;
  deps(): FamilyDeps;
  browser(origin?: string): Browser;
  /** Observe every response (for global invariants such as "no secret ever leaves the server"). */
  tap?: (method: string, url: string, res: Res) => void;
}

export function createWorld(o: { secret?: string; start?: number } = {}): World {
  const w: World = {
    kv: memoryKV(), store: memoryStore(), secret: o.secret ?? DEFAULT_SECRET, now: o.start ?? DEFAULT_START,
    advance(ms) { w.now += ms; }, setTime(ms) { w.now = ms; },
    deps() { return { kv: w.kv, store: w.store, secret: w.secret, now: w.now }; },
    browser(origin?: string) { const b = new Browser(w); if (origin) b.origin = origin; return b; },
  };
  return w;
}

export interface Res<T = any> { status: number; ok: boolean; json: T }

/**
 * A browser: a cookie jar plus the same request->handler translation the Astro routes do. Cookies obey
 * Max-Age against the WORLD clock, so "the parent unlocked 31 minutes ago" is just advance(31 * 60_000).
 */
export class Browser {
  private jar = new Map<string, { value: string; expires: number }>();
  /** The page origin this browser is "on": sent as Origin on writes, like a real browser. */
  origin = SITE_ORIGIN;
  constructor(readonly world: World) {}

  cookie(name: string): string | undefined {
    const c = this.jar.get(name);
    if (!c) return undefined;
    if (c.expires <= this.world.now) { this.jar.delete(name); return undefined; }
    return c.value;
  }
  setCookie(name: string, value: string, maxAgeSec = 3600 * 24 * 365) { this.jar.set(name, { value, expires: this.world.now + maxAgeSec * 1000 }); }
  clearCookies() { this.jar.clear(); }
  /** Copy another browser's cookies (the "kid borrows the parent's unlocked phone" move). */
  adopt(other: Browser) { for (const [k, v] of other.jar) this.jar.set(k, { ...v }); }

  private apply(res: { cookies?: any[]; cookie?: any }) {
    for (const c of res.cookies ?? []) { if (c.clear) this.jar.delete(c.name); else this.setCookie(c.name, c.value ?? "", c.maxAgeSec); }
    if (res.cookie) { if ("clear" in res.cookie) this.jar.delete(SESSION_COOKIE); else this.setCookie(SESSION_COOKIE, res.cookie.value, res.cookie.maxAgeSec); }
  }

  async request(method: string, url: string, body?: unknown, extra: { headers?: Record<string, string>; raw?: string } = {}): Promise<Res> {
    const u = new URL(url, SITE_ORIGIN);
    // The Astro routes refuse a foreign Origin on writes (src/lib/origin.ts); the sim must too.
    if (!originAllowed(method, extra.headers?.origin ?? this.origin, [SITE_ORIGIN])) {
      const denied = { status: 403, ok: false, json: { error: "cross-origin" } };
      this.world.tap?.(method, url, denied);
      return denied;
    }
    const deps = this.world.deps();
    const pdeps = { store: this.world.store, secret: this.world.secret, now: this.world.now };
    const b = (body ?? {}) as Record<string, any>;
    const token = this.cookie(SESSION_COOKIE);
    let res: { status: number; json?: unknown; cookies?: any[]; cookie?: any };
    const p = u.pathname;
    if (p.startsWith("/api/family/")) {
      res = await handle({
        method, path: p.slice("/api/family/".length).split("/").filter(Boolean), body: b,
        raw: extra.raw ?? (body === undefined ? "" : JSON.stringify(body)),
        tokens: { parent: this.cookie(PARENT_COOKIE), household: this.cookie(HOUSEHOLD_COOKIE) },
        childToken: token, query: Object.fromEntries(u.searchParams), headers: extra.headers ?? {},
      }, deps);
    } else if (p === "/api/auth/login") res = await P.login(b, pdeps);
    else if (p === "/api/auth/signup") res = await P.signup(b, pdeps);
    else if (p === "/api/auth/logout") res = P.logout();
    else if (p === "/api/me") res = await P.me(token, pdeps);
    else if (p === "/api/me/completions") res = method === "POST" ? await P.recordCompletion(token, b, pdeps) : await P.listCompletions(token, pdeps);
    else if (p === "/api/me/trophies") res = await P.myTrophies(token, pdeps);
    else if (p === "/api/scores") {
      res = method === "DELETE" ? await P.deleteScore(token, b, pdeps)
        : b.partner ? await P.submitPairScore(token, b, pdeps) : await P.submitScore(token, b, pdeps);
    } else if (p === "/api/leaderboard") res = await P.leaderboard({ game: u.searchParams.get("game") ?? "", limit: u.searchParams.get("limit") }, pdeps);
    else res = { status: 404, json: { error: "not-found" } };
    this.apply(res);
    const out = { status: res.status, ok: res.status < 400, json: res.json };
    this.world.tap?.(method, url, out);
    return out;
  }
  get(url: string) { return this.request("GET", url); }
  post(url: string, body?: unknown) { return this.request("POST", url, body ?? {}); }
  patch(url: string, body?: unknown) { return this.request("PATCH", url, body ?? {}); }
  delete(url: string, body?: unknown) { return this.request("DELETE", url, body ?? {}); }
}
