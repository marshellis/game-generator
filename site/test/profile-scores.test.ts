import { describe, it, expect, beforeEach } from "vitest";
import type { Store, UserRecord, CompletionValue, ScoreEntry, Deps } from "../src/lib/profile/types";
import { signup, submitScore, submitPairScore, leaderboard } from "../src/lib/profile/handlers";
import { MAX_SCORE, canonicalPair } from "../src/lib/profile/scores";

class FakeStore implements Store {
  users = new Map<string, UserRecord>();
  completions = new Map<string, Record<string, unknown>>();
  lockouts = new Map<string, number>();
  scores = new Map<string, Map<string, number>>();
  async getUser(u: string) { return this.users.get(u) ?? null; }
  async createUser(u: string, rec: UserRecord) { if (this.users.has(u)) return false; this.users.set(u, rec); return true; }
  async getCompletions(u: string) { return this.completions.get(u) ?? {}; }
  async putCompletion(u: string, f: string, v: CompletionValue) { const h = this.completions.get(u) ?? {}; h[f] = v; this.completions.set(u, h); }
  async bumpLockout(u: string) { const n = (this.lockouts.get(u) ?? 0) + 1; this.lockouts.set(u, n); return n; }
  async getLockout(u: string) { return this.lockouts.get(u) ?? 0; }
  async bumpScore(game: string, u: string, score: number) {
    const g = this.scores.get(game) ?? new Map<string, number>();
    const best = Math.max(g.get(u) ?? 0, score); g.set(u, best); this.scores.set(game, g); return best;
  }
  async topScores(game: string, limit: number): Promise<ScoreEntry[]> {
    const g = this.scores.get(game) ?? new Map<string, number>();
    return [...g.entries()].map(([username, score]) => ({ username, score }))
      .sort((a, b) => b.score - a.score).slice(0, limit);
  }
  async userBest(game: string, u: string) { return this.scores.get(game)?.get(u) ?? 0; }
}

const SECRET = "s";
let store: FakeStore;
let deps: Deps;
beforeEach(() => { store = new FakeStore(); deps = { store, secret: SECRET, now: 1_000_000 }; });

function cookieValue(res: { cookie?: any }): string {
  return res.cookie && "value" in res.cookie ? res.cookie.value : "";
}
async function tokenFor(username: string): Promise<string> {
  return cookieValue(await signup({ username, pin: "4821" }, deps));
}

describe("submitScore", () => {
  it("requires auth (401)", async () => {
    expect((await submitScore(undefined, { game: "flappy", score: 5 }, deps)).status).toBe(401);
  });
  it("records a score and reports the new best", async () => {
    const res = (await submitScore(await tokenFor("alice"), { game: "flappy", score: 7 }, deps)) as any;
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ game: "flappy", score: 7, best: 7, improved: true });
  });
  it("keeps the highest score and flags a non-improvement", async () => {
    const t = await tokenFor("alice");
    await submitScore(t, { game: "flappy", score: 10 }, deps);
    const res = (await submitScore(t, { game: "flappy", score: 4 }, deps)) as any;
    expect(res.json).toMatchObject({ best: 10, improved: false });
  });
  it("rejects a game that isn't score-enabled (400)", async () => {
    expect((await submitScore(await tokenFor("alice"), { game: "maze", score: 5 }, deps)).status).toBe(400);
  });
  it("rejects invalid scores (400)", async () => {
    const t = await tokenFor("alice");
    for (const bad of [-1, 1.5, Number.NaN, MAX_SCORE + 1, "5", undefined]) {
      expect((await submitScore(t, { game: "flappy", score: bad }, deps)).status).toBe(400);
    }
  });
});

describe("submitPairScore", () => {
  it("requires auth (401)", async () => {
    expect((await submitPairScore(undefined, { game: "net-rally-duo", score: 5, partner: "bob" }, deps)).status).toBe(401);
  });
  it("records a pair score under the canonical key and reports the best", async () => {
    await tokenFor("bob"); // partner must exist
    const res = (await submitPairScore(await tokenFor("alice"), { game: "net-rally-duo", score: 9, partner: "bob" }, deps)) as any;
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ game: "net-rally-duo", pair: "alice&bob", score: 9, best: 9, improved: true });
  });
  it("is order-independent — both partners post to the same row", async () => {
    const ta = await tokenFor("alice");
    const tb = await tokenFor("bob");
    await submitPairScore(ta, { game: "net-rally-duo", score: 12, partner: "bob" }, deps);
    const res = (await submitPairScore(tb, { game: "net-rally-duo", score: 12, partner: "alice" }, deps)) as any;
    expect(res.json).toMatchObject({ pair: "alice&bob", best: 12, improved: false });
    expect(canonicalPair("bob", "alice")).toBe("alice&bob");
  });
  it("keeps the highest pair score", async () => {
    await tokenFor("bob");
    const ta = await tokenFor("alice");
    await submitPairScore(ta, { game: "net-rally-duo", score: 20, partner: "bob" }, deps);
    const res = (await submitPairScore(ta, { game: "net-rally-duo", score: 7, partner: "bob" }, deps)) as any;
    expect(res.json).toMatchObject({ best: 20, improved: false });
  });
  it("rejects a non-coop or unknown game (400)", async () => {
    await tokenFor("bob");
    const t = await tokenFor("alice");
    expect((await submitPairScore(t, { game: "net-rally", score: 5, partner: "bob" }, deps)).status).toBe(400);
    expect((await submitPairScore(t, { game: "nope", score: 5, partner: "bob" }, deps)).status).toBe(400);
  });
  it("rejects invalid scores (400)", async () => {
    await tokenFor("bob");
    const t = await tokenFor("alice");
    for (const bad of [-1, 1.5, Number.NaN, MAX_SCORE + 1, "5", undefined]) {
      expect((await submitPairScore(t, { game: "net-rally-duo", score: bad, partner: "bob" }, deps)).status).toBe(400);
    }
  });
  it("rejects a partner that doesn't exist (400)", async () => {
    expect((await submitPairScore(await tokenFor("alice"), { game: "net-rally-duo", score: 5, partner: "ghost" }, deps)).status).toBe(400);
  });
  it("rejects pairing with yourself (400)", async () => {
    expect((await submitPairScore(await tokenFor("alice"), { game: "net-rally-duo", score: 5, partner: "alice" }, deps)).status).toBe(400);
  });
  it("surfaces on the duo leaderboard as the pair key", async () => {
    await tokenFor("bob");
    await submitPairScore(await tokenFor("alice"), { game: "net-rally-duo", score: 15, partner: "bob" }, deps);
    const res = (await leaderboard({ game: "net-rally-duo" }, deps)) as any;
    expect(res.status).toBe(200);
    expect(res.json.top).toEqual([{ rank: 1, username: "alice&bob", score: 15 }]);
  });
});

describe("leaderboard", () => {
  it("is public and ranks players high-to-low", async () => {
    await submitScore(await tokenFor("alice"), { game: "flappy", score: 5 }, deps);
    await submitScore(await tokenFor("bob"), { game: "flappy", score: 12 }, deps);
    await submitScore(await tokenFor("cara"), { game: "flappy", score: 9 }, deps);
    const res = (await leaderboard({ game: "flappy" }, deps)) as any;
    expect(res.status).toBe(200);
    expect(res.json.top).toEqual([
      { rank: 1, username: "bob", score: 12 },
      { rank: 2, username: "cara", score: 9 },
      { rank: 3, username: "alice", score: 5 },
    ]);
  });
  it("honors a limit", async () => {
    await submitScore(await tokenFor("alice"), { game: "flappy", score: 5 }, deps);
    await submitScore(await tokenFor("bob"), { game: "flappy", score: 12 }, deps);
    const res = (await leaderboard({ game: "flappy", limit: 1 }, deps)) as any;
    expect(res.json.top).toHaveLength(1);
    expect(res.json.top[0].username).toBe("bob");
  });
  it("rejects an unknown game (400)", async () => {
    expect((await leaderboard({ game: "nope" }, deps)).status).toBe(400);
  });
});
