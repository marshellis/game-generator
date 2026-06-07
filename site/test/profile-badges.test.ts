import { describe, it, expect } from "vitest";
import { dayKey, currentStreak, deriveBadges } from "../src/lib/profile/badges";
import type { Completion } from "../src/lib/profile/types";

// Local-noon timestamps keep day bucketing deterministic regardless of the
// machine's timezone (no test runs near a midnight boundary).
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).getTime();
const c = (game: string, puzzleId: string, ts: number, grade = "g1"): Completion => ({ game, puzzleId, grade, ts });

const find = (bs: ReturnType<typeof deriveBadges>, id: string) => {
  const b = bs.find((x) => x.id === id);
  if (!b) throw new Error(`no badge ${id}`);
  return b;
};

describe("dayKey", () => {
  it("buckets a timestamp into a local YYYY-MM-DD string", () => {
    expect(dayKey(day(2026, 6, 7))).toBe("2026-06-07");
  });
});

describe("currentStreak", () => {
  it("is 0 with no completions", () => {
    expect(currentStreak([], day(2026, 6, 7))).toBe(0);
  });
  it("counts consecutive days ending today", () => {
    const cs = [c("maze", "a", day(2026, 6, 5)), c("maze", "b", day(2026, 6, 6)), c("maze", "d", day(2026, 6, 7))];
    expect(currentStreak(cs, day(2026, 6, 7))).toBe(3);
  });
  it("still counts a streak that ends yesterday (today not played yet)", () => {
    const cs = [c("maze", "a", day(2026, 6, 5)), c("maze", "b", day(2026, 6, 6))];
    expect(currentStreak(cs, day(2026, 6, 7))).toBe(2);
  });
  it("breaks the streak when a day is skipped", () => {
    const cs = [c("maze", "a", day(2026, 6, 3)), c("maze", "b", day(2026, 6, 6)), c("maze", "d", day(2026, 6, 7))];
    expect(currentStreak(cs, day(2026, 6, 7))).toBe(2);
  });
  it("is 0 when the most recent play is older than yesterday", () => {
    const cs = [c("maze", "a", day(2026, 6, 1))];
    expect(currentStreak(cs, day(2026, 6, 7))).toBe(0);
  });
  it("counts multiple solves on the same day as one day", () => {
    const cs = [c("maze", "a", day(2026, 6, 7)), c("sudoku", "b", day(2026, 6, 7))];
    expect(currentStreak(cs, day(2026, 6, 7))).toBe(1);
  });
});

describe("deriveBadges", () => {
  const now = day(2026, 6, 7);

  it("returns every badge unearned for a brand-new player, with zero progress", () => {
    const bs = deriveBadges([], now);
    expect(bs.length).toBeGreaterThan(0);
    expect(bs.every((b) => !b.earned)).toBe(true);
    expect(find(bs, "m1").have).toBe(0);
    expect(find(bs, "m1").need).toBe(1);
  });

  it("earns First Solve on the very first completion", () => {
    const bs = deriveBadges([c("maze", "a", now)], now);
    expect(find(bs, "m1").earned).toBe(true);
    expect(find(bs, "m5").earned).toBe(false);
    expect(find(bs, "m5").have).toBe(1);
  });

  it("earns milestone badges as the total climbs", () => {
    const cs = Array.from({ length: 10 }, (_, i) => c("maze", `m${i}`, now));
    const bs = deriveBadges(cs, now);
    expect(find(bs, "m5").earned).toBe(true);
    expect(find(bs, "m10").earned).toBe(true);
    expect(find(bs, "m25").earned).toBe(false);
    expect(find(bs, "m25").have).toBe(10);
  });

  it("earns a per-game mastery badge at 5 solves of that game", () => {
    const cs = Array.from({ length: 5 }, (_, i) => c("maze", `m${i}`, now));
    const bs = deriveBadges(cs, now);
    expect(find(bs, "mastery-maze").earned).toBe(true);
    expect(find(bs, "mastery-maze").label).toBe("Maze Master");
    // a different game's mastery is not earned, and shows that game's progress
    expect(find(bs, "mastery-sudoku").earned).toBe(false);
    expect(find(bs, "mastery-sudoku").have).toBe(0);
  });

  it("earns the Sampler badge only after every game has been played once", () => {
    const games = ["logic-grid", "math-packet", "maze", "sudoku", "word-search", "kenken"];
    const five = games.slice(0, 5).map((g, i) => c(g, `p${i}`, now));
    expect(find(deriveBadges(five, now), "sampler").earned).toBe(false);
    expect(find(deriveBadges(five, now), "sampler").have).toBe(5);
    const all = games.map((g, i) => c(g, `p${i}`, now));
    expect(find(deriveBadges(all, now), "sampler").earned).toBe(true);
  });

  it("earns streak badges from consecutive-day play", () => {
    const cs = [day(2026, 6, 5), day(2026, 6, 6), day(2026, 6, 7)].map((t, i) => c("maze", `s${i}`, t));
    const bs = deriveBadges(cs, now);
    expect(find(bs, "streak3").earned).toBe(true);
    expect(find(bs, "streak3").have).toBe(3);
    expect(find(bs, "streak7").earned).toBe(false);
  });
});
