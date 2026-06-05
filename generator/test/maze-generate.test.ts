import { describe, it, expect } from "vitest";
import { generateMaze } from "../src/games/maze/generate";
import { N, E, S, W } from "../src/games/maze/types";

const adj = (a: any, b: any) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
const openBetween = (open: number[][], a: any, b: any) => {
  if (b.r === a.r - 1) return !!(open[a.r][a.c] & N);
  if (b.r === a.r + 1) return !!(open[a.r][a.c] & S);
  if (b.c === a.c + 1) return !!(open[a.r][a.c] & E);
  return !!(open[a.r][a.c] & W);
};

describe("generateMaze", () => {
  it("produces a sized maze with a valid solution and theme", () => {
    const m = generateMaze({ difficulty: "g3", seed: 7, date: "2026-06-05" });
    expect(m.rows).toBe(10); expect(m.cols).toBe(10);
    expect(m.gameType).toBe("maze");
    expect(m.theme.startIcon).toBeTruthy();
    expect(m.solution[0]).toEqual(m.start);
    expect(m.solution[m.solution.length - 1]).toEqual(m.end);
    for (let i = 1; i < m.solution.length; i++) {
      expect(adj(m.solution[i - 1], m.solution[i])).toBe(true);
      expect(openBetween(m.open, m.solution[i - 1], m.solution[i])).toBe(true);
    }
    expect(m.id).toContain("2026-06-05");
    expect(m.difficultyRating).toBeGreaterThanOrEqual(1);
  });
  it("is deterministic for a seed", () => {
    const a = generateMaze({ difficulty: "g4", seed: 2, date: "2026-06-05" });
    const b = generateMaze({ difficulty: "g4", seed: 2, date: "2026-06-05" });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
