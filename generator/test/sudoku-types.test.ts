import { describe, it, expect } from "vitest";
import type { Sudoku, Cell } from "../src/games/sudoku/types";

describe("sudoku types", () => {
  it("constructs", () => {
    const c: Cell = { r: 0, c: 0 };
    const s: Sudoku = {
      id: "x", title: "Sudoku", gameType: "sudoku", gradeLabel: "grade 1", difficulty: "g1",
      size: 4, boxW: 2, boxH: 2, givens: [[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
      solution: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]], maxTier: 1, difficultyRating: 1,
      seed: 1, createdAt: "2026-06-06T00:00:00.000Z",
    };
    expect(s.size).toBe(4); expect(c.r).toBe(0);
  });
});
