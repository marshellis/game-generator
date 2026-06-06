import { describe, it, expect } from "vitest";
import { N, E, S, W, DIRS, type Maze, type Cell } from "../src/games/maze/types";

describe("maze types", () => {
  it("direction bits are distinct powers of two", () => {
    expect([N, E, S, W]).toEqual([1, 2, 4, 8]);
  });
  it("each direction's opposite is the real opposite", () => {
    const opp = Object.fromEntries(DIRS.map((d) => [d.bit, d.opp]));
    expect(opp[N]).toBe(S); expect(opp[S]).toBe(N);
    expect(opp[E]).toBe(W); expect(opp[W]).toBe(E);
  });
  it("constructs a Maze", () => {
    const c: Cell = { r: 0, c: 0 };
    const m: Maze = {
      id: "x", title: "t", themeBlurb: "b", gameType: "maze", gradeLabel: "grade 1",
      difficulty: "g1", cols: 2, rows: 2, open: [[E, W], [E, W]],
      start: c, end: { r: 1, c: 1 }, decoyStarts: [], theme: { startIcon: "🐭", endIcon: "🧀" },
      solution: [c], difficultyRating: 1, seed: 1, createdAt: "2026-06-05T00:00:00.000Z",
    };
    expect(m.cols).toBe(2);
  });
});
