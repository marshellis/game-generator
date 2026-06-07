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
