// The Upstash store (production) and the in-memory store (sim + local e2e) must agree on board direction.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryStore } from "../src/lib/profile/memory-store";

const calls: [string, ...unknown[]][] = [];
vi.mock("@upstash/redis", () => ({
  Redis: class {
    zadd = async (...a: unknown[]) => { calls.push(["zadd", ...a]); return 1; };
    zscore = async () => 5;
    zrange = async (...a: unknown[]) => { calls.push(["zrange", ...a]); return []; };
    zrank = async (...a: unknown[]) => { calls.push(["zrank", ...a]); return 0; };
    zrevrank = async (...a: unknown[]) => { calls.push(["zrevrank", ...a]); return 0; };
  },
}));

beforeEach(() => {
  calls.length = 0;
  process.env.KV_REST_API_URL = "http://x"; process.env.KV_REST_API_TOKEN = "t";
  delete process.env.E2E_MEMORY;
});

describe("upstashStore board direction", () => {
  it("highest-wins boards: zadd gt, descending zrange, zrevrank (unchanged)", async () => {
    const { upstashStore } = await import("../src/lib/profile/store");
    const s = upstashStore();
    await s.bumpScore("flappy", "ann", 9);
    await s.topScores("flappy", 10);
    await s.userRank("flappy", "ann");
    expect(calls).toEqual([
      ["zadd", "leaderboard:flappy", { gt: true }, { score: 9, member: "ann" }],
      ["zrange", "leaderboard:flappy", 0, 9, { rev: true, withScores: true }],
      ["zrevrank", "leaderboard:flappy", "ann"],
    ]);
  });
  it("lowest-wins boards: zadd lt, ascending zrange, zrank", async () => {
    const { upstashStore } = await import("../src/lib/profile/store");
    const s = upstashStore();
    await s.bumpScore("nexus-race", "ann", 4100);
    await s.topScores("nexus-race", 10);
    expect(await s.userRank("nexus-race", "ann")).toBe(1);
    expect(calls).toEqual([
      ["zadd", "leaderboard:nexus-race", { lt: true }, { score: 4100, member: "ann" }],
      ["zrange", "leaderboard:nexus-race", 0, 9, { rev: false, withScores: true }],
      ["zrank", "leaderboard:nexus-race", "ann"],
    ]);
  });
});

describe("memoryStore board direction", () => {
  it("lowest-wins keeps the min, ranks ascending; highest-wins is unchanged", async () => {
    const m = memoryStore();
    await m.bumpScore("nexus-race", "ann", 5000);
    expect(await m.bumpScore("nexus-race", "ann", 6000)).toBe(5000);
    expect(await m.bumpScore("nexus-race", "ann", 4000)).toBe(4000);
    await m.bumpScore("nexus-race", "bo", 4500);
    expect((await m.topScores("nexus-race", 5)).map((r) => r.username)).toEqual(["ann", "bo"]);
    expect(await m.userRank("nexus-race", "bo")).toBe(2);
    await m.bumpScore("flappy", "ann", 3);
    expect(await m.bumpScore("flappy", "ann", 1)).toBe(3);
    await m.bumpScore("flappy", "bo", 8);
    expect((await m.topScores("flappy", 5)).map((r) => r.username)).toEqual(["bo", "ann"]);
    expect(await m.userRank("flappy", "ann")).toBe(2);
  });
});
