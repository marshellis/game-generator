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
import type { Store, UserRecord, ScoreEntry, CompletionValue } from "../../src/lib/profile/types";
import { PARENT_COOKIE, HOUSEHOLD_COOKIE } from "../../src/lib/family/accounts";
import { SESSION_COOKIE } from "../../src/lib/profile/session";

export const DEFAULT_SECRET = "sim-secret-sim-secret-sim-secret-32";
export const DEFAULT_START = Date.UTC(2026, 9, 30, 18, 0, 0);

/** Full in-memory implementation of the profile Store (users, completions, lockouts, leaderboards). */
export function memoryStore() {
  const users = new Map<string, UserRecord>();
  const completions = new Map<string, Record<string, unknown>>();
  const lockouts = new Map<string, number>();
  const boards = new Map<string, Map<string, number>>();
  const board = (g: string) => { if (!boards.has(g)) boards.set(g, new Map()); return boards.get(g)!; };
  const sorted = (g: string): [string, number][] => [...board(g)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const store: Store & { users: typeof users; boards: typeof boards } = {
    users, boards,
    async getUser(u) { return structuredClone(users.get(u) ?? null); },
    async createUser(u, rec) { if (users.has(u)) return false; users.set(u, structuredClone(rec)); return true; },
    async getCompletions(u) { return structuredClone(completions.get(u) ?? {}); },
    async putCompletion(u, f, v: CompletionValue) { completions.set(u, { ...(completions.get(u) ?? {}), [f]: v }); },
    async bumpLockout(u) { const n = (lockouts.get(u) ?? 0) + 1; lockouts.set(u, n); return n; },
    async getLockout(u) { return lockouts.get(u) ?? 0; },
    async bumpScore(g, u, s) { const b = board(g); b.set(u, Math.max(b.get(u) ?? -Infinity, s)); return b.get(u)!; },
    async topScores(g, n): Promise<ScoreEntry[]> { return sorted(g).slice(0, n).map(([username, score]) => ({ username, score })); },
    async userBest(g, u) { return board(g).get(u) ?? 0; },
    async userRank(g, u) { const i = sorted(g).findIndex(([m]) => m === u); return i < 0 ? null : i + 1; },
    async playerCount(g) { return board(g).size; },
    async removeScore(g, u) { board(g).delete(u); },
    async deleteUser(u) { users.delete(u); completions.delete(u); lockouts.delete(u); },
  };
  return store;
}

export interface World {
  kv: ReturnType<typeof memoryKV>;
  store: ReturnType<typeof memoryStore>;
  secret: string;
  now: number;
  /** Move the world clock forward (ms). Cookies expire against it too. */
  advance(ms: number): void;
  setTime(ms: number): void;
  deps(): FamilyDeps;
  browser(): Browser;
  /** Observe every response (for global invariants such as "no secret ever leaves the server"). */
  tap?: (method: string, url: string, res: Res) => void;
}

export function createWorld(o: { secret?: string; start?: number } = {}): World {
  const w: World = {
    kv: memoryKV(), store: memoryStore(), secret: o.secret ?? DEFAULT_SECRET, now: o.start ?? DEFAULT_START,
    advance(ms) { w.now += ms; }, setTime(ms) { w.now = ms; },
    deps() { return { kv: w.kv, store: w.store, secret: w.secret, now: w.now }; },
    browser() { return new Browser(w); },
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
    const u = new URL(url, "https://games.marshellis.com");
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
