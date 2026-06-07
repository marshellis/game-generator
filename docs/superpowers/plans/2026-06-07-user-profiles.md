# User Profiles (Username + PIN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight username+PIN accounts so players see which puzzles they've completed, with a data model ready for later gamification.

**Architecture:** Keep every game/content page prerendered (static); add a thin `/api/*` serverless surface (Astro `output: 'hybrid'` + `@astrojs/vercel`). All auth/completion logic lives in pure, unit-tested modules under `site/src/lib/profile/`; API route files are thin adapters. Personalization (header chip, solved badges, counts, profile page) is client-side hydration via `fetch`, so static HTML stays cacheable. Data in Upstash Redis (Vercel KV). PIN hashed with `node:crypto` scrypt; session is a signed httpOnly cookie.

**Tech Stack:** Astro 4 (hybrid), `@astrojs/vercel`, `@upstash/redis`, `node:crypto`, Vitest.

**Design spec:** `docs/superpowers/specs/2026-06-07-user-profiles-design.md`

**Canonical game slugs** (== content `gameType`, used as the completion key prefix and `data-game`):
`logic-grid`, `math-packet`, `maze`, `sudoku`, `word-search`, `kenken`.

**Conventions in this repo to follow:**
- Tests live in `site/test/**/*.test.ts` (Vitest config includes `test/**/*.test.ts`). Imports are relative (no path alias).
- Only **pure logic** is unit-tested; client/island DOM code and `.astro` files are verified by build, matching existing practice (e.g. `player.ts` is not unit-tested).
- The CI `test` job runs `npm ci && npm test` in `site/` — **no `astro build`, no secrets.** Keep all Redis/secret access lazy (request-time only) so the build never needs env vars.
- All work is on the current branch; per `CLAUDE.md`, open a PR and `gh pr merge --squash --auto --delete-branch` once CI is green.

---

## File Structure

**Create (pure logic + tests):**
- `site/src/lib/profile/types.ts` — shared types (`UserRecord`, `Store`, `Completion`, `HandlerResult`, `Deps`, `Cookie`).
- `site/src/lib/profile/auth.ts` — username/PIN validation, scrypt hash/verify.
- `site/src/lib/profile/session.ts` — HMAC session sign/verify, cookie name/age constants.
- `site/src/lib/profile/completions.ts` — completion field key + parse/group helpers.
- `site/src/lib/profile/handlers.ts` — request handlers (signup/login/logout/me/list/record) over `Deps`.
- `site/test/profile-auth.test.ts`, `site/test/profile-session.test.ts`, `site/test/profile-completions.test.ts`, `site/test/profile-handlers.test.ts` (the last includes an in-file fake `Store`).

**Create (runtime adapters, build-verified):**
- `site/src/lib/profile/store.ts` — Upstash-backed `Store` (lazy client).
- `site/src/lib/profile/route-helpers.ts` — `deps()`, `applyCookie()`, `toResponse()`.
- `site/src/pages/api/auth/signup.ts`, `login.ts`, `logout.ts`
- `site/src/pages/api/me.ts`, `site/src/pages/api/me/completions.ts`, `site/src/pages/api/completions.ts`
- `site/src/lib/profile-client.ts` — browser module (chip, modal, badges, count, profile render, solve-record).
- `site/src/pages/profile.astro` — profile shell.

**Modify:**
- `site/package.json` (deps) + `site/package-lock.json` (via `npm install`).
- `site/astro.config.mjs` (adapter + `output: 'hybrid'`).
- `site/src/layouts/Base.astro` (chip placeholder + load client module).
- `site/src/games/shared/win.ts` (dispatch `puzzle:solved`).
- `site/src/pages/index.astro` (solved-count placeholder).
- 6 play pages: `puzzle/[id].astro`, `packet/[id].astro`, `maze/[id].astro`, `kenken/[id].astro`, `sudoku/[id].astro`, `word-search/[id].astro` (emit `#puzzle-meta`).
- 6 grade pages: `logic-grid/grade/[grade].astro`, `math/grade/[grade].astro`, `maze/grade/[grade].astro`, `sudoku/grade/[grade].astro`, `word-search/grade/[grade].astro`, `kenken/grade/[grade].astro` (card `data-*` + badge).

---

## Task 1: Dependencies, Vercel adapter, hybrid output

**Files:**
- Modify: `site/package.json`, `site/package-lock.json`
- Modify: `site/astro.config.mjs`

- [ ] **Step 1: Install runtime deps (updates package.json + lock)**

Run (from `site/`):
```bash
npm install @astrojs/vercel@^7 @upstash/redis@^1
```
Expected: both added under `dependencies`; `package-lock.json` updated.

- [ ] **Step 2: Switch Astro to hybrid output with the Vercel adapter**

Replace `site/astro.config.mjs` with:
```js
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  site: "https://games.marshellis.com",
  output: "hybrid",
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
});
```
Note: `hybrid` = prerender by default; only files exporting `prerender = false` become serverless functions. Every existing page stays static.

- [ ] **Step 3: Verify the build still works and stays static**

Run (from `site/`): `npm run build`
Expected: build succeeds. Since no route opts out yet, output is all static (a `.vercel/output` dir is produced by the adapter — that's expected, not committed).

- [ ] **Step 4: Verify tests still pass**

Run (from `site/`): `npm test`
Expected: existing grid tests PASS.

- [ ] **Step 5: Commit**

```bash
git add site/package.json site/package-lock.json site/astro.config.mjs
git commit -m "build(site): add vercel adapter + upstash, switch to hybrid output"
```

---

## Task 2: Types + auth (validation + scrypt)

**Files:**
- Create: `site/src/lib/profile/types.ts`
- Create: `site/src/lib/profile/auth.ts`
- Test: `site/test/profile-auth.test.ts`

- [ ] **Step 1: Write the types module**

Create `site/src/lib/profile/types.ts`:
```ts
export interface UserRecord {
  pinHash: string;
  createdAt: number; // epoch ms
}

export interface Completion {
  game: string;
  puzzleId: string;
  grade: string;
  ts: number; // epoch ms
}

export interface Store {
  getUser(username: string): Promise<UserRecord | null>;
  /** Atomic create. Returns false if the username already exists. */
  createUser(username: string, rec: UserRecord): Promise<boolean>;
  /** Raw completions hash: field "game:puzzleId" -> JSON string. */
  getCompletions(username: string): Promise<Record<string, string>>;
  putCompletion(username: string, field: string, value: string): Promise<void>;
  /** Increment the lockout counter, setting TTL on first hit. Returns new count. */
  bumpLockout(username: string, ttlSec: number): Promise<number>;
  getLockout(username: string): Promise<number>;
}

export type Cookie = { value: string; maxAgeSec: number } | { clear: true };

export interface HandlerResult {
  status: number;
  json?: unknown;
  cookie?: Cookie;
}

export interface Deps {
  store: Store;
  secret: string;
  now: number; // epoch ms
}
```

- [ ] **Step 2: Write the failing auth test**

Create `site/test/profile-auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  normalizeUsername, validateUsername, validatePin, hashPin, verifyPin,
} from "../src/lib/profile/auth";

describe("username", () => {
  it("normalizes case and surrounding space", () => {
    expect(normalizeUsername("  Alice  ")).toBe("alice");
  });
  it("accepts 3-20 of [a-z0-9_-]", () => {
    expect(validateUsername("ace_01")).toBe(true);
    expect(validateUsername("ab")).toBe(false);        // too short
    expect(validateUsername("a".repeat(21))).toBe(false); // too long
    expect(validateUsername("bad name")).toBe(false);  // space
    expect(validateUsername("Bad")).toBe(false);       // uppercase (caller must normalize first)
  });
});

describe("pin", () => {
  it("accepts 4-8 digits only", () => {
    expect(validatePin("1234")).toBe(true);
    expect(validatePin("12345678")).toBe(true);
    expect(validatePin("123")).toBe(false);
    expect(validatePin("123456789")).toBe(false);
    expect(validatePin("12ab")).toBe(false);
  });
});

describe("pin hashing", () => {
  it("verifies the correct pin and rejects a wrong one", () => {
    const stored = hashPin("4821");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPin("4821", stored)).toBe(true);
    expect(verifyPin("0000", stored)).toBe(false);
  });
  it("produces a different salt each call", () => {
    expect(hashPin("4821")).not.toBe(hashPin("4821"));
  });
  it("rejects malformed stored values", () => {
    expect(verifyPin("4821", "garbage")).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `site/`): `npx vitest run test/profile-auth.test.ts`
Expected: FAIL — cannot resolve `../src/lib/profile/auth`.

- [ ] **Step 4: Implement auth.ts**

Create `site/src/lib/profile/auth.ts`:
```ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;
export function validateUsername(u: string): boolean {
  return USERNAME_RE.test(u);
}

const PIN_RE = /^[0-9]{4,8}$/;
export function validatePin(p: string): boolean {
  return PIN_RE.test(p);
}

const KEYLEN = 32;
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const got = scryptSync(pin, salt, KEYLEN);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `site/`): `npx vitest run test/profile-auth.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/profile/types.ts site/src/lib/profile/auth.ts site/test/profile-auth.test.ts
git commit -m "feat(profile): username/pin validation + scrypt hashing"
```

---

## Task 3: Session (signed cookie)

**Files:**
- Create: `site/src/lib/profile/session.ts`
- Test: `site/test/profile-session.test.ts`

- [ ] **Step 1: Write the failing session test**

Create `site/test/profile-session.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { signSession, verifySession, SESSION_MAX_AGE_SEC } from "../src/lib/profile/session";

const SECRET = "test-secret";

describe("session", () => {
  it("round-trips a valid token", () => {
    const t = signSession("alice", SECRET, 1000);
    expect(verifySession(t, SECRET, 1000)).toEqual({ username: "alice" });
  });
  it("rejects a tampered token", () => {
    const t = signSession("alice", SECRET, 1000);
    expect(verifySession(t + "x", SECRET, 1000)).toBeNull();
  });
  it("rejects a token signed with a different secret", () => {
    const t = signSession("alice", SECRET, 1000);
    expect(verifySession(t, "other", 1000)).toBeNull();
  });
  it("rejects an expired token", () => {
    const t = signSession("alice", SECRET, 1000);
    expect(verifySession(t, SECRET, 1000 + SESSION_MAX_AGE_SEC + 1)).toBeNull();
  });
  it("rejects undefined / empty", () => {
    expect(verifySession(undefined, SECRET, 1000)).toBeNull();
    expect(verifySession("", SECRET, 1000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `site/`): `npx vitest run test/profile-session.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement session.ts**

Create `site/src/lib/profile/session.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "mg_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 90; // 90 days

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Token = "<username>.<issuedAtSec>.<sig>". Username has no dots (validated). */
export function signSession(username: string, secret: string, issuedAtSec: number): string {
  const payload = `${username}.${issuedAtSec}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  nowSec: number,
  maxAgeSec: number = SESSION_MAX_AGE_SEC,
): { username: string } | null {
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const firstDot = payload.indexOf(".");
  if (firstDot < 0) return null;
  const username = payload.slice(0, firstDot);
  const issuedAt = Number(payload.slice(firstDot + 1));
  if (!username || !Number.isFinite(issuedAt)) return null;
  if (nowSec - issuedAt > maxAgeSec) return null;
  return { username };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `site/`): `npx vitest run test/profile-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/profile/session.ts site/test/profile-session.test.ts
git commit -m "feat(profile): signed HMAC session cookie"
```

---

## Task 4: Completions (key + parse/group)

**Files:**
- Create: `site/src/lib/profile/completions.ts`
- Test: `site/test/profile-completions.test.ts`

- [ ] **Step 1: Write the failing completions test**

Create `site/test/profile-completions.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { completionField, parseCompletions, groupByGame } from "../src/lib/profile/completions";

describe("completionField", () => {
  it("joins game and puzzleId", () => {
    expect(completionField("maze", "maze-g3-1")).toBe("maze:maze-g3-1");
  });
});

describe("parseCompletions", () => {
  it("parses fields, splits on the first colon, sorts newest first", () => {
    const raw = {
      "maze:maze-1": JSON.stringify({ grade: "g3", ts: 100 }),
      "word-search:ws-1": JSON.stringify({ grade: "g2", ts: 200 }),
    };
    const cs = parseCompletions(raw);
    expect(cs).toEqual([
      { game: "word-search", puzzleId: "ws-1", grade: "g2", ts: 200 },
      { game: "maze", puzzleId: "maze-1", grade: "g3", ts: 100 },
    ]);
  });
  it("skips malformed JSON values", () => {
    expect(parseCompletions({ "maze:x": "not json" })).toEqual([]);
  });
});

describe("groupByGame", () => {
  it("counts per game, ordered by count desc", () => {
    const cs = [
      { game: "maze", puzzleId: "a", grade: "g1", ts: 3 },
      { game: "maze", puzzleId: "b", grade: "g1", ts: 2 },
      { game: "sudoku", puzzleId: "c", grade: "g1", ts: 1 },
    ];
    const g = groupByGame(cs);
    expect(g.map((x) => [x.game, x.count])).toEqual([["maze", 2], ["sudoku", 1]]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `site/`): `npx vitest run test/profile-completions.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement completions.ts**

Create `site/src/lib/profile/completions.ts`:
```ts
import type { Completion } from "./types";

export function completionField(game: string, puzzleId: string): string {
  return `${game}:${puzzleId}`;
}

export function parseCompletions(raw: Record<string, string>): Completion[] {
  const out: Completion[] = [];
  for (const [field, value] of Object.entries(raw)) {
    const sep = field.indexOf(":");
    if (sep < 0) continue;
    const game = field.slice(0, sep);
    const puzzleId = field.slice(sep + 1);
    try {
      const v = JSON.parse(value) as { grade?: string; ts?: number };
      if (typeof v.ts !== "number") continue;
      out.push({ game, puzzleId, grade: String(v.grade ?? ""), ts: v.ts });
    } catch {
      // skip malformed
    }
  }
  return out.sort((a, b) => b.ts - a.ts);
}

export interface GameGroup {
  game: string;
  count: number;
  completions: Completion[];
}

export function groupByGame(cs: Completion[]): GameGroup[] {
  const map = new Map<string, Completion[]>();
  for (const c of cs) {
    const list = map.get(c.game) ?? [];
    list.push(c);
    map.set(c.game, list);
  }
  return [...map.entries()]
    .map(([game, completions]) => ({ game, count: completions.length, completions }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `site/`): `npx vitest run test/profile-completions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/profile/completions.ts site/test/profile-completions.test.ts
git commit -m "feat(profile): completion key + parse/group helpers"
```

---

## Task 5: Handlers (signup/login/logout/me/list/record)

**Files:**
- Create: `site/src/lib/profile/handlers.ts`
- Test: `site/test/profile-handlers.test.ts`

- [ ] **Step 1: Write the failing handlers test (with an in-file fake Store)**

Create `site/test/profile-handlers.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Store, UserRecord, Deps } from "../src/lib/profile/types";
import { signup, login, logout, me, listCompletions, recordCompletion } from "../src/lib/profile/handlers";

class FakeStore implements Store {
  users = new Map<string, UserRecord>();
  completions = new Map<string, Record<string, string>>();
  lockouts = new Map<string, number>();
  async getUser(u: string) { return this.users.get(u) ?? null; }
  async createUser(u: string, rec: UserRecord) {
    if (this.users.has(u)) return false;
    this.users.set(u, rec); return true;
  }
  async getCompletions(u: string) { return this.completions.get(u) ?? {}; }
  async putCompletion(u: string, field: string, value: string) {
    const h = this.completions.get(u) ?? {}; h[field] = value; this.completions.set(u, h);
  }
  async bumpLockout(u: string) { const n = (this.lockouts.get(u) ?? 0) + 1; this.lockouts.set(u, n); return n; }
  async getLockout(u: string) { return this.lockouts.get(u) ?? 0; }
}

const SECRET = "s";
let store: FakeStore;
let deps: Deps;
beforeEach(() => { store = new FakeStore(); deps = { store, secret: SECRET, now: 1_000_000 }; });

function cookieValue(res: { cookie?: any }): string {
  return res.cookie && "value" in res.cookie ? res.cookie.value : "";
}

describe("signup", () => {
  it("creates a user and returns a session cookie", async () => {
    const res = await signup({ username: "Alice", pin: "4821" }, deps);
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ username: "alice" });
    expect(cookieValue(res)).toContain("alice.");
    expect(store.users.has("alice")).toBe(true);
  });
  it("rejects invalid input with 400", async () => {
    expect((await signup({ username: "ab", pin: "4821" }, deps)).status).toBe(400);
    expect((await signup({ username: "alice", pin: "12" }, deps)).status).toBe(400);
  });
  it("rejects a taken username with 409", async () => {
    await signup({ username: "alice", pin: "4821" }, deps);
    expect((await signup({ username: "alice", pin: "0000" }, deps)).status).toBe(409);
  });
});

describe("login", () => {
  beforeEach(async () => { await signup({ username: "alice", pin: "4821" }, deps); });
  it("succeeds with the right pin", async () => {
    const res = await login({ username: "alice", pin: "4821" }, deps);
    expect(res.status).toBe(200);
    expect(cookieValue(res)).toContain("alice.");
  });
  it("fails with the wrong pin (401) and bumps lockout", async () => {
    const res = await login({ username: "alice", pin: "0000" }, deps);
    expect(res.status).toBe(401);
    expect(store.lockouts.get("alice")).toBe(1);
  });
  it("locks out after too many attempts (429)", async () => {
    store.lockouts.set("alice", 8);
    expect((await login({ username: "alice", pin: "4821" }, deps)).status).toBe(429);
  });
  it("returns 401 for an unknown user", async () => {
    expect((await login({ username: "ghost", pin: "4821" }, deps)).status).toBe(401);
  });
});

describe("logout", () => {
  it("clears the cookie", () => {
    const res = logout();
    expect(res.status).toBe(204);
    expect(res.cookie).toEqual({ clear: true });
  });
});

describe("me", () => {
  it("returns username for a valid token, 401 otherwise", async () => {
    const token = cookieValue(await signup({ username: "alice", pin: "4821" }, deps));
    expect(me(token, deps)).toEqual({ status: 200, json: { username: "alice" } });
    expect(me(undefined, deps).status).toBe(401);
  });
});

describe("completions", () => {
  it("records then lists a completion for the authed user", async () => {
    const token = cookieValue(await signup({ username: "alice", pin: "4821" }, deps));
    const rec = await recordCompletion(token, { game: "maze", puzzleId: "maze-1", grade: "g3" }, deps);
    expect(rec.status).toBe(200);
    const list = await listCompletions(token, deps) as any;
    expect(list.status).toBe(200);
    expect(list.json.total).toBe(1);
    expect(list.json.completions[0]).toMatchObject({ game: "maze", puzzleId: "maze-1", grade: "g3" });
  });
  it("rejects an unknown game with 400", async () => {
    const token = cookieValue(await signup({ username: "alice", pin: "4821" }, deps));
    expect((await recordCompletion(token, { game: "nope", puzzleId: "x", grade: "g1" }, deps)).status).toBe(400);
  });
  it("requires auth (401) for record and list", async () => {
    expect((await recordCompletion(undefined, { game: "maze", puzzleId: "x", grade: "g1" }, deps)).status).toBe(401);
    expect((await listCompletions(undefined, deps)).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `site/`): `npx vitest run test/profile-handlers.test.ts`
Expected: FAIL — cannot resolve `../src/lib/profile/handlers`.

- [ ] **Step 3: Implement handlers.ts**

Create `site/src/lib/profile/handlers.ts`:
```ts
import type { Deps, HandlerResult } from "./types";
import { normalizeUsername, validateUsername, validatePin, hashPin, verifyPin } from "./auth";
import { signSession, verifySession, SESSION_MAX_AGE_SEC } from "./session";
import { parseCompletions, groupByGame, completionField } from "./completions";

const LOCKOUT_MAX = 8;
const LOCKOUT_TTL_SEC = 15 * 60;
const KNOWN_GAMES = new Set([
  "logic-grid", "math-packet", "maze", "sudoku", "word-search", "kenken",
]);

function sessionCookie(username: string, deps: Deps) {
  const nowSec = Math.floor(deps.now / 1000);
  return { value: signSession(username, deps.secret, nowSec), maxAgeSec: SESSION_MAX_AGE_SEC };
}

function authed(token: string | undefined, deps: Deps): string | null {
  const s = verifySession(token, deps.secret, Math.floor(deps.now / 1000));
  return s?.username ?? null;
}

export async function signup(input: { username?: string; pin?: string }, deps: Deps): Promise<HandlerResult> {
  const username = normalizeUsername(input.username ?? "");
  const pin = (input.pin ?? "").trim();
  if (!validateUsername(username) || !validatePin(pin)) return { status: 400, json: { error: "invalid" } };
  const created = await deps.store.createUser(username, { pinHash: hashPin(pin), createdAt: deps.now });
  if (!created) return { status: 409, json: { error: "taken" } };
  return { status: 201, json: { username }, cookie: sessionCookie(username, deps) };
}

export async function login(input: { username?: string; pin?: string }, deps: Deps): Promise<HandlerResult> {
  const username = normalizeUsername(input.username ?? "");
  const pin = (input.pin ?? "").trim();
  if (!validateUsername(username) || !validatePin(pin)) return { status: 400, json: { error: "invalid" } };
  if ((await deps.store.getLockout(username)) >= LOCKOUT_MAX) return { status: 429, json: { error: "locked" } };
  const user = await deps.store.getUser(username);
  if (!user || !verifyPin(pin, user.pinHash)) {
    await deps.store.bumpLockout(username, LOCKOUT_TTL_SEC);
    return { status: 401, json: { error: "bad-credentials" } };
  }
  return { status: 200, json: { username }, cookie: sessionCookie(username, deps) };
}

export function logout(): HandlerResult {
  return { status: 204, cookie: { clear: true } };
}

export function me(token: string | undefined, deps: Deps): HandlerResult {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  return { status: 200, json: { username } };
}

export async function listCompletions(token: string | undefined, deps: Deps): Promise<HandlerResult> {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  const completions = parseCompletions(await deps.store.getCompletions(username));
  return { status: 200, json: { completions, groups: groupByGame(completions), total: completions.length } };
}

export async function recordCompletion(
  token: string | undefined,
  input: { game?: string; puzzleId?: string; grade?: string },
  deps: Deps,
): Promise<HandlerResult> {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  const game = String(input.game ?? "");
  const puzzleId = String(input.puzzleId ?? "");
  const grade = String(input.grade ?? "");
  if (!KNOWN_GAMES.has(game) || !puzzleId) return { status: 400, json: { error: "invalid" } };
  await deps.store.putCompletion(username, completionField(game, puzzleId), JSON.stringify({ grade, ts: deps.now }));
  return { status: 200, json: { ok: true } };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `site/`): `npx vitest run test/profile-handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/profile/handlers.ts site/test/profile-handlers.test.ts
git commit -m "feat(profile): auth + completion request handlers"
```

---

## Task 6: Upstash store (runtime adapter)

**Files:**
- Create: `site/src/lib/profile/store.ts`

- [ ] **Step 1: Implement the Upstash-backed Store (lazy client)**

Create `site/src/lib/profile/store.ts`:
```ts
import { Redis } from "@upstash/redis";
import type { Store, UserRecord } from "./types";

let redis: Redis | null = null;
function client(): Redis {
  // Reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from the environment.
  // Lazy so the build never needs these vars (only request time does).
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

export function upstashStore(): Store {
  const r = client();
  return {
    async getUser(u) {
      return (await r.get<UserRecord>(`user:${u}`)) ?? null;
    },
    async createUser(u, rec) {
      const res = await r.set(`user:${u}`, rec, { nx: true });
      return res === "OK";
    },
    async getCompletions(u) {
      return (await r.hgetall<Record<string, string>>(`completions:${u}`)) ?? {};
    },
    async putCompletion(u, field, value) {
      await r.hset(`completions:${u}`, { [field]: value });
    },
    async bumpLockout(u, ttlSec) {
      const n = await r.incr(`lockout:${u}`);
      if (n === 1) await r.expire(`lockout:${u}`, ttlSec);
      return n;
    },
    async getLockout(u) {
      return Number(await r.get(`lockout:${u}`)) || 0;
    },
  };
}
```

- [ ] **Step 2: Type-check by building**

Run (from `site/`): `npm run build`
Expected: build succeeds (module type-checks; not yet imported by a route, so still all-static).

- [ ] **Step 3: Commit**

```bash
git add site/src/lib/profile/store.ts
git commit -m "feat(profile): upstash redis store adapter"
```

---

## Task 7: Route helpers + API routes

**Files:**
- Create: `site/src/lib/profile/route-helpers.ts`
- Create: `site/src/pages/api/auth/signup.ts`, `login.ts`, `logout.ts`
- Create: `site/src/pages/api/me.ts`, `site/src/pages/api/me/completions.ts`, `site/src/pages/api/completions.ts`

- [ ] **Step 1: Implement route helpers**

Create `site/src/lib/profile/route-helpers.ts`:
```ts
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
```

- [ ] **Step 2: Create the auth routes**

Create `site/src/pages/api/auth/signup.ts`:
```ts
import type { APIRoute } from "astro";
import { signup } from "../../../lib/profile/handlers";
import { deps, readBody, applyCookie, toResponse } from "../../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const res = await signup(await readBody(request), deps());
  applyCookie(cookies, res);
  return toResponse(res);
};
```

Create `site/src/pages/api/auth/login.ts`:
```ts
import type { APIRoute } from "astro";
import { login } from "../../../lib/profile/handlers";
import { deps, readBody, applyCookie, toResponse } from "../../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const res = await login(await readBody(request), deps());
  applyCookie(cookies, res);
  return toResponse(res);
};
```

Create `site/src/pages/api/auth/logout.ts`:
```ts
import type { APIRoute } from "astro";
import { logout } from "../../../lib/profile/handlers";
import { applyCookie, toResponse } from "../../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  const res = logout();
  applyCookie(cookies, res);
  return toResponse(res);
};
```

- [ ] **Step 3: Create the me + completions routes**

Create `site/src/pages/api/me.ts`:
```ts
import type { APIRoute } from "astro";
import { me } from "../../lib/profile/handlers";
import { deps, readToken, toResponse } from "../../lib/profile/route-helpers";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  return toResponse(me(readToken(cookies), deps()));
};
```

Create `site/src/pages/api/me/completions.ts`:
```ts
import type { APIRoute } from "astro";
import { listCompletions } from "../../../lib/profile/handlers";
import { deps, readToken, toResponse } from "../../../lib/profile/route-helpers";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  return toResponse(await listCompletions(readToken(cookies), deps()));
};
```

Create `site/src/pages/api/completions.ts`:
```ts
import type { APIRoute } from "astro";
import { recordCompletion } from "../../lib/profile/handlers";
import { deps, readToken, readBody, toResponse } from "../../lib/profile/route-helpers";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await readBody(request);
  const res = await recordCompletion(
    readToken(cookies),
    { game: body.game as string, puzzleId: body.puzzleId as string, grade: body.grade as string },
    deps(),
  );
  return toResponse(res);
};
```

- [ ] **Step 4: Build (confirms hybrid functions compile and only /api/* opts out)**

Run (from `site/`): `npm run build`
Expected: build succeeds; log shows the `/api/*` routes built as on-demand/server endpoints while game pages stay prerendered.

- [ ] **Step 5: Run tests**

Run (from `site/`): `npm test`
Expected: all profile + grid tests PASS.

- [ ] **Step 6: Commit**

```bash
git add site/src/lib/profile/route-helpers.ts site/src/pages/api
git commit -m "feat(profile): /api auth + completions routes"
```

---

## Task 8: Fire a solved event from the shared win splash

**Files:**
- Modify: `site/src/games/shared/win.ts`

Context: every game's win runs through `celebrate()` (logic-grid/math/maze/word-search via their `player.ts`; sudoku/kenken via shared `number-grid.ts`). Dispatching one DOM event here is the single recording chokepoint — no per-game island edits.

- [ ] **Step 1: Dispatch `puzzle:solved` when the splash first shows**

In `site/src/games/shared/win.ts`, find:
```ts
export function celebrate(title = "You solved it!"): void {
  if (shown) return;
  shown = true;
  confetti();
```
Replace with:
```ts
export function celebrate(title = "You solved it!"): void {
  if (shown) return;
  shown = true;
  // Single recording chokepoint for every game — the profile client listens for this.
  document.dispatchEvent(new CustomEvent("puzzle:solved"));
  confetti();
```

- [ ] **Step 2: Build to confirm it compiles**

Run (from `site/`): `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add site/src/games/shared/win.ts
git commit -m "feat(profile): emit puzzle:solved event from win splash"
```

---

## Task 9: Profile client + header chip

**Files:**
- Create: `site/src/lib/profile-client.ts`
- Modify: `site/src/layouts/Base.astro`

- [ ] **Step 1: Add the chip placeholder + load the client in Base**

In `site/src/layouts/Base.astro`, find the header inner div:
```astro
      <div class="mx-auto flex max-w-5xl items-center gap-2 px-5 py-3">
        <a href="/" class="flex items-center gap-2 font-extrabold tracking-tight text-slate-900 no-underline">
          <span class="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">M</span>
          Marshellis Games
        </a>
      </div>
```
Replace with (adds an auto-margin chip slot on the right):
```astro
      <div class="mx-auto flex max-w-5xl items-center gap-2 px-5 py-3">
        <a href="/" class="flex items-center gap-2 font-extrabold tracking-tight text-slate-900 no-underline">
          <span class="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">M</span>
          Marshellis Games
        </a>
        <span id="profile-chip" class="ml-auto"></span>
      </div>
```
Then, immediately before the closing `</body>` tag, add:
```astro
    <script>
      import "../lib/profile-client.ts";
    </script>
```

- [ ] **Step 2: Implement the profile client**

Create `site/src/lib/profile-client.ts`:
```ts
// Browser-side personalization: header chip, login/signup modal, solve recording,
// solved badges on grade lists, home count, and the /profile listing. All network
// calls degrade silently — gameplay never depends on them.
import { groupByGame, type GameGroup } from "./profile/completions";
import type { Completion } from "./profile/types";

type Me = { username: string } | null;

const GAME_LABELS: Record<string, string> = {
  "logic-grid": "Logic Grid",
  "math-packet": "Math Worksheets",
  "maze": "Mazes",
  "sudoku": "Sudoku",
  "word-search": "Word Search",
  "kenken": "KenKen",
};

async function fetchMe(): Promise<Me> {
  try {
    const r = await fetch("/api/me", { credentials: "same-origin" });
    if (!r.ok) return null;
    return (await r.json()) as Me;
  } catch {
    return null;
  }
}

async function fetchCompletions(): Promise<Completion[]> {
  try {
    const r = await fetch("/api/me/completions", { credentials: "same-origin" });
    if (!r.ok) return [];
    const j = (await r.json()) as { completions: Completion[] };
    return j.completions ?? [];
  } catch {
    return [];
  }
}

// ---- header chip ----------------------------------------------------------
function renderChip(me: Me): void {
  const slot = document.getElementById("profile-chip");
  if (!slot) return;
  slot.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.style.cssText =
    "border:1px solid #cbd5e1;background:#fff;border-radius:9999px;padding:4px 12px;" +
    "font-size:13px;font-weight:600;color:#334155;cursor:pointer;";
  if (me) {
    btn.textContent = `👤 ${me.username}`;
    btn.addEventListener("click", () => openMenu(me));
  } else {
    btn.textContent = "Sign in";
    btn.addEventListener("click", () => openAuthModal());
  }
  slot.appendChild(btn);
}

function openMenu(me: Me): void {
  if (!me) return;
  if (confirm(`Signed in as ${me.username}.\n\nOK = go to your profile, Cancel = log out.`)) {
    location.href = "/profile";
  } else {
    void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(() => location.reload());
  }
}

// ---- auth modal -----------------------------------------------------------
function openAuthModal(): void {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;" +
    "padding:24px;background:rgba(15,23,42,.6);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";
  const input = "width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;margin-top:8px;";
  const btn = "display:block;width:100%;box-sizing:border-box;padding:11px 16px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:none;";
  overlay.innerHTML = `
    <div style="width:100%;max-width:340px;background:#fff;border-radius:16px;padding:28px;box-shadow:0 20px 50px rgba(0,0,0,.25);">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#0f172a;" data-title>Sign in</h2>
      <p style="margin:0;font-size:13px;color:#64748b;">Username + PIN. No email needed.</p>
      <input data-username placeholder="username" autocomplete="username" style="${input}" />
      <input data-pin placeholder="PIN (4-8 digits)" inputmode="numeric" autocomplete="off" style="${input}" />
      <p data-error style="margin:10px 0 0;font-size:13px;color:#dc2626;min-height:16px;"></p>
      <button data-submit style="${btn}background:#4f46e5;color:#fff;margin-top:8px;">Sign in</button>
      <button data-toggle style="background:none;border:none;margin-top:12px;width:100%;font-size:13px;color:#4f46e5;cursor:pointer;">New here? Create a profile</button>
      <button data-cancel style="background:none;border:none;margin-top:6px;width:100%;font-size:13px;color:#94a3b8;cursor:pointer;">Cancel</button>
    </div>`;
  document.body.appendChild(overlay);

  let mode: "login" | "signup" = "login";
  const $ = <T extends HTMLElement>(sel: string) => overlay.querySelector<T>(sel)!;
  const error = $("[data-error]");
  const submit = $<HTMLButtonElement>("[data-submit]");
  const setMode = (m: "login" | "signup") => {
    mode = m;
    $("[data-title]").textContent = m === "login" ? "Sign in" : "Create a profile";
    submit.textContent = m === "login" ? "Sign in" : "Create profile";
    $("[data-toggle]").textContent = m === "login" ? "New here? Create a profile" : "Have a profile? Sign in";
  };

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  $("[data-cancel]").addEventListener("click", close);
  $("[data-toggle]").addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

  submit.addEventListener("click", async () => {
    const username = $<HTMLInputElement>("[data-username]").value.trim();
    const pin = $<HTMLInputElement>("[data-pin]").value.trim();
    error.textContent = "";
    submit.disabled = true;
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, pin }),
      });
      if (r.ok) { location.reload(); return; }
      error.textContent =
        r.status === 409 ? "That username is taken." :
        r.status === 401 ? "Wrong username or PIN." :
        r.status === 429 ? "Too many tries — wait a bit." :
        "Check your username (3-20) and PIN (4-8 digits).";
    } catch {
      error.textContent = "Network error — try again.";
    } finally {
      submit.disabled = false;
    }
  });
}

// ---- solve recording ------------------------------------------------------
function wireSolveRecording(): void {
  document.addEventListener("puzzle:solved", () => {
    const el = document.getElementById("puzzle-meta");
    if (!el?.textContent) return;
    let meta: { game?: string; puzzleId?: string; grade?: string };
    try { meta = JSON.parse(el.textContent); } catch { return; }
    void fetch("/api/completions", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(meta),
    }).catch(() => {});
  });
}

// ---- solved badges on grade lists ----------------------------------------
async function markSolvedCards(): Promise<void> {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("a[data-puzzle-id]"));
  if (cards.length === 0) return;
  const done = new Set((await fetchCompletions()).map((c) => `${c.game}:${c.puzzleId}`));
  for (const card of cards) {
    const key = `${card.dataset.game}:${card.dataset.puzzleId}`;
    if (done.has(key)) {
      const badge = card.querySelector<HTMLElement>("[data-solved-badge]");
      if (badge) badge.hidden = false;
    }
  }
}

// ---- home count -----------------------------------------------------------
async function renderHomeCount(): Promise<void> {
  const el = document.getElementById("solved-count");
  if (!el) return;
  const n = (await fetchCompletions()).length;
  if (n > 0) { el.textContent = `✓ ${n} puzzles solved`; el.hidden = false; }
}

// ---- /profile listing -----------------------------------------------------
async function renderProfile(me: Me): Promise<void> {
  const root = document.getElementById("profile-root");
  if (!root) return;
  if (!me) {
    root.innerHTML = `<p style="color:#64748b;">Please <button id="profile-signin" style="background:none;border:none;color:#4f46e5;font-weight:600;cursor:pointer;">sign in</button> to see your progress.</p>`;
    document.getElementById("profile-signin")?.addEventListener("click", () => openAuthModal());
    return;
  }
  const groups: GameGroup[] = groupByGame(await fetchCompletions());
  const total = groups.reduce((s, g) => s + g.count, 0);
  root.innerHTML =
    `<p style="font-size:18px;font-weight:700;margin:0 0 16px;">${me.username} — ${total} puzzles solved</p>` +
    (groups.length === 0
      ? `<p style="color:#64748b;">No puzzles solved yet. Go play one!</p>`
      : groups.map((g) => `
        <div style="margin-bottom:18px;">
          <div style="font-weight:700;margin-bottom:6px;">${GAME_LABELS[g.game] ?? g.game} · ${g.count}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${g.completions.map((c) => `<span style="font-size:12px;background:#f1f5f9;border-radius:9999px;padding:3px 10px;color:#475569;">${c.puzzleId}</span>`).join("")}
          </div>
        </div>`).join(""));
}

// ---- bootstrap ------------------------------------------------------------
async function init(): Promise<void> {
  wireSolveRecording();
  const me = await fetchMe();
  renderChip(me);
  void markSolvedCards();
  void renderHomeCount();
  void renderProfile(me);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
```

- [ ] **Step 3: Build to confirm the client bundles**

Run (from `site/`): `npm run build`
Expected: success; `profile-client` is bundled into every page (it's imported by `Base`).

- [ ] **Step 4: Commit**

```bash
git add site/src/lib/profile-client.ts site/src/layouts/Base.astro
git commit -m "feat(profile): header chip, auth modal, and client hydration"
```

---

## Task 10: Emit puzzle metadata on the 6 play pages

**Files:**
- Modify: `site/src/pages/puzzle/[id].astro` (var `puzzle`)
- Modify: `site/src/pages/packet/[id].astro` (var `packet`)
- Modify: `site/src/pages/maze/[id].astro` (var `m`)
- Modify: `site/src/pages/kenken/[id].astro` (var `k`)
- Modify: `site/src/pages/sudoku/[id].astro` (var `s`)
- Modify: `site/src/pages/word-search/[id].astro` (var `s`)

Each entry's data has `.gameType`, `.id`, `.difficulty`. Add a `#puzzle-meta` JSON script anywhere inside the page body (just inside the `<Base ...>` element). The profile client reads it on `puzzle:solved`.

- [ ] **Step 1: `puzzle/[id].astro`** — add immediately after the opening `<Base ...>` line:
```astro
  <script type="application/json" id="puzzle-meta" set:html={JSON.stringify({ game: puzzle.gameType, puzzleId: puzzle.id, grade: puzzle.difficulty })} />
```

- [ ] **Step 2: `packet/[id].astro`** — add after `<Base ...>`:
```astro
  <script type="application/json" id="puzzle-meta" set:html={JSON.stringify({ game: packet.gameType, puzzleId: packet.id, grade: packet.difficulty })} />
```

- [ ] **Step 3: `maze/[id].astro`** — add after `<Base ...>`:
```astro
  <script type="application/json" id="puzzle-meta" set:html={JSON.stringify({ game: m.gameType, puzzleId: m.id, grade: m.difficulty })} />
```

- [ ] **Step 4: `kenken/[id].astro`** — add after `<Base ...>`:
```astro
  <script type="application/json" id="puzzle-meta" set:html={JSON.stringify({ game: k.gameType, puzzleId: k.id, grade: k.difficulty })} />
```

- [ ] **Step 5: `sudoku/[id].astro`** — add after `<Base ...>`:
```astro
  <script type="application/json" id="puzzle-meta" set:html={JSON.stringify({ game: s.gameType, puzzleId: s.id, grade: s.difficulty })} />
```

- [ ] **Step 6: `word-search/[id].astro`** — add after `<Base ...>`:
```astro
  <script type="application/json" id="puzzle-meta" set:html={JSON.stringify({ game: s.gameType, puzzleId: s.id, grade: s.difficulty })} />
```

- [ ] **Step 7: Build**

Run (from `site/`): `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add site/src/pages/puzzle/\[id\].astro site/src/pages/packet/\[id\].astro site/src/pages/maze/\[id\].astro site/src/pages/kenken/\[id\].astro site/src/pages/sudoku/\[id\].astro site/src/pages/word-search/\[id\].astro
git commit -m "feat(profile): emit puzzle-meta on play pages for completion recording"
```

---

## Task 11: Solved badges on the 6 grade-list pages

**Files:**
- Modify: `site/src/pages/logic-grid/grade/[grade].astro` (var `p`)
- Modify: `site/src/pages/math/grade/[grade].astro` (var `p`)
- Modify: `site/src/pages/maze/grade/[grade].astro` (var `m`)
- Modify: `site/src/pages/sudoku/grade/[grade].astro` (var `s`)
- Modify: `site/src/pages/word-search/grade/[grade].astro` (var `s`)
- Modify: `site/src/pages/kenken/grade/[grade].astro` (var `k`)

For each card `<a ...>`: (1) add `data-game` + `data-puzzle-id` attributes, and (2) add a hidden badge span as the first child. The client unhides the badge for solved puzzles. The badge is inline-styled (green pill) so Tailwind purging can't strip it.

The badge span to insert as the first child inside each `<a>`:
```astro
          <span data-solved-badge hidden style="align-self:flex-start;font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:9999px;padding:2px 8px;margin-bottom:6px;">✓ Solved</span>
```

- [ ] **Step 1: `logic-grid/grade/[grade].astro`** — change the card opener:

Find:
```astro
        <a href={`/puzzle/${p.data.id}`}
           class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span class="text-base font-bold text-slate-900">{p.data.title}</span>
```
Replace with:
```astro
        <a href={`/puzzle/${p.data.id}`} data-game={p.data.gameType} data-puzzle-id={p.data.id}
           class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span data-solved-badge hidden style="align-self:flex-start;font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:9999px;padding:2px 8px;margin-bottom:6px;">✓ Solved</span>
          <span class="text-base font-bold text-slate-900">{p.data.title}</span>
```

- [ ] **Step 2: `math/grade/[grade].astro`** — find:
```astro
        <a href={`/packet/${p.data.id}`}
           class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md">
          <span class="text-base font-bold text-slate-900">{p.data.title}</span>
```
Replace with:
```astro
        <a href={`/packet/${p.data.id}`} data-game={p.data.gameType} data-puzzle-id={p.data.id}
           class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md">
          <span data-solved-badge hidden style="align-self:flex-start;font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:9999px;padding:2px 8px;margin-bottom:6px;">✓ Solved</span>
          <span class="text-base font-bold text-slate-900">{p.data.title}</span>
```

- [ ] **Step 3: `maze/grade/[grade].astro`** — find:
```astro
        <a href={`/maze/${m.data.id}`} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span class="text-2xl">{m.data.theme.startIcon} {m.data.theme.endIcon}</span>
```
Replace with:
```astro
        <a href={`/maze/${m.data.id}`} data-game={m.data.gameType} data-puzzle-id={m.data.id} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span data-solved-badge hidden style="align-self:flex-start;font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:9999px;padding:2px 8px;margin-bottom:6px;">✓ Solved</span>
          <span class="text-2xl">{m.data.theme.startIcon} {m.data.theme.endIcon}</span>
```

- [ ] **Step 4: `sudoku/grade/[grade].astro`** — find:
```astro
        <a href={`/sudoku/${s.data.id}`} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span class="text-base font-bold text-slate-900">Sudoku {s.data.size}×{s.data.size}</span>
```
Replace with:
```astro
        <a href={`/sudoku/${s.data.id}`} data-game={s.data.gameType} data-puzzle-id={s.data.id} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span data-solved-badge hidden style="align-self:flex-start;font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:9999px;padding:2px 8px;margin-bottom:6px;">✓ Solved</span>
          <span class="text-base font-bold text-slate-900">Sudoku {s.data.size}×{s.data.size}</span>
```

- [ ] **Step 5: `word-search/grade/[grade].astro`** — find:
```astro
        <a href={`/word-search/${s.data.id}`} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span class="text-base font-bold text-slate-900">{s.data.theme} · {s.data.size}×{s.data.size}</span>
```
Replace with:
```astro
        <a href={`/word-search/${s.data.id}`} data-game={s.data.gameType} data-puzzle-id={s.data.id} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span data-solved-badge hidden style="align-self:flex-start;font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:9999px;padding:2px 8px;margin-bottom:6px;">✓ Solved</span>
          <span class="text-base font-bold text-slate-900">{s.data.theme} · {s.data.size}×{s.data.size}</span>
```

- [ ] **Step 6: `kenken/grade/[grade].astro`** — find:
```astro
        <a href={`/kenken/${k.data.id}`} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span class="text-base font-bold text-slate-900">KenKen {k.data.size}×{k.data.size}</span>
```
Replace with:
```astro
        <a href={`/kenken/${k.data.id}`} data-game={k.data.gameType} data-puzzle-id={k.data.id} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span data-solved-badge hidden style="align-self:flex-start;font-size:11px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:9999px;padding:2px 8px;margin-bottom:6px;">✓ Solved</span>
          <span class="text-base font-bold text-slate-900">KenKen {k.data.size}×{k.data.size}</span>
```

- [ ] **Step 7: Build**

Run (from `site/`): `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add site/src/pages/logic-grid/grade/\[grade\].astro site/src/pages/math/grade/\[grade\].astro site/src/pages/maze/grade/\[grade\].astro site/src/pages/sudoku/grade/\[grade\].astro site/src/pages/word-search/grade/\[grade\].astro site/src/pages/kenken/grade/\[grade\].astro
git commit -m "feat(profile): solved badges on grade-list cards"
```

---

## Task 12: Home count + /profile page

**Files:**
- Modify: `site/src/pages/index.astro`
- Create: `site/src/pages/profile.astro`

- [ ] **Step 1: Add the solved-count placeholder on the home page**

In `site/src/pages/index.astro`, find:
```astro
  <h1 class="text-3xl font-extrabold tracking-tight sm:text-4xl">Marshellis Games</h1>
  <p class="mt-2 text-slate-500">Pick a game to play or print.</p>
```
Replace with:
```astro
  <h1 class="text-3xl font-extrabold tracking-tight sm:text-4xl">Marshellis Games</h1>
  <p class="mt-2 text-slate-500">Pick a game to play or print.</p>
  <p id="solved-count" hidden class="mt-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700"></p>
```

- [ ] **Step 2: Create the profile page (static shell, client fills it)**

Create `site/src/pages/profile.astro`:
```astro
---
import Base from "../layouts/Base.astro";
---
<Base title="My Profile — Marshellis Games">
  <nav class="mb-4 text-sm text-slate-500">
    <a href="/" class="text-slate-500 no-underline hover:underline">All games</a>
    <span class="px-1">/</span>
    <span class="text-slate-700">My Profile</span>
  </nav>
  <h1 class="text-3xl font-extrabold tracking-tight">My Profile</h1>
  <p class="mt-2 text-slate-500">Everything you've solved so far.</p>
  <div id="profile-root" class="mt-8 text-slate-700">Loading…</div>
</Base>
```

- [ ] **Step 3: Build**

Run (from `site/`): `npm run build`
Expected: success; `/profile` is prerendered (static shell), personalized client-side.

- [ ] **Step 4: Commit**

```bash
git add site/src/pages/index.astro site/src/pages/profile.astro
git commit -m "feat(profile): home solved-count + /profile page"
```

---

## Task 13: Full verification + deploy prerequisites

**Files:** none (verification + docs note)

- [ ] **Step 1: Full test run**

Run (from `site/`): `npm test`
Expected: all profile + grid tests PASS.

- [ ] **Step 2: Full build**

Run (from `site/`): `npm run build`
Expected: success. Confirm in the output that game/content pages are prerendered and only `/api/*` are server endpoints.

- [ ] **Step 3: Manual smoke (local) — optional but recommended**

Because API routes need Redis + a secret, set throwaway local values and run a Vercel-style dev only if convenient. Minimum viable local check without Redis: `npm run dev`, load a play page, confirm the "Sign in" chip renders and the auth modal opens (network calls will fail gracefully without a backend — that's the designed degradation). Full end-to-end (signup → solve → badge) requires the deploy prerequisites below.

- [ ] **Step 4: Record deploy prerequisites for the owner**

These must be set once in the Vercel project (the CI `test` gate does NOT need them):
- Add the Upstash (Vercel KV / Redis) integration to the project.
- Set environment variables (Production + Preview): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SESSION_SECRET` (a long random string).

Note this in the PR description so the owner sets them before/after merge. Until they're set, the API returns 500s and personalization degrades to logged-out — games still work.

- [ ] **Step 5: Open PR and auto-merge once green (per CLAUDE.md)**

```bash
git push -u origin HEAD
gh pr create --fill --title "feat: lightweight username+PIN profiles + completion tracking" \
  --body "Adds username+PIN accounts (Upstash Redis), completion recording via the shared win event, header chip, solved badges, home count, and /profile. Static pages stay prerendered; only /api/* is serverless.

DEPLOY PREREQS (owner, one-time in Vercel): add Upstash integration + set UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SESSION_SECRET. CI test gate does not need them.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --squash --auto --delete-branch
```

---

## Self-Review Notes (coverage vs. spec)

- **Static → hybrid + serverless API** → Task 1, Task 7. ✓
- **Upstash datastore (user/completions/lockout keys)** → Task 6 (`store.ts`). ✓
- **scrypt PIN hash, HMAC session cookie, username/PIN rules** → Tasks 2, 3. ✓
- **No recovery / username stays claimed** → enforced by atomic `createUser` returning 409 (Task 5). ✓
- **API routes (signup/login/logout/me/completions read+write), auth required, lockout, unknown-game rejection** → Tasks 5, 7. ✓
- **Client: header chip, login/signup modal, auto-record on solve via `puzzle:solved`, solved badges, home count, /profile** → Tasks 8–12. ✓
- **Error handling: gameplay never blocked; API failures degrade silently** → client `fetch` wrappers + lazy server clients (Tasks 6, 9). ✓
- **Testing with a fake Store; CI needs no secrets** → Task 5 fake store; build-not-in-CI confirmed. ✓
- **Deploy prerequisites** → Task 13. ✓
