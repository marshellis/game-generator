import { describe, it, expect } from "vitest";
import { units, cellCands, solveLogical, countSolutions, solvedValid } from "../src/games/sudoku/solver";

// A solved 4×4 (boxes 2×2)
const SOLVED = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];

describe("sudoku solver", () => {
  it("units: rows+cols+boxes = 3*size unit lists of size cells", () => {
    const u = units(4, 2, 2);
    expect(u.length).toBe(12);
    expect(u.every((x) => x.length === 4)).toBe(true);
  });
  it("solvedValid accepts a valid grid and rejects a broken one", () => {
    expect(solvedValid(SOLVED, 4, 2, 2)).toBe(true);
    const bad = SOLVED.map((r) => r.slice()); bad[0]![0] = 2; // dup in row/col
    expect(solvedValid(bad, 4, 2, 2)).toBe(false);
  });
  it("solveLogical solves a naked-singles 4×4 at tier 1", () => {
    const givens = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,0]]; // one blank
    const res = solveLogical(givens, 4, 2, 2, 1);
    expect(res.solved).toBe(true);
    expect(res.hardestTier).toBe(1);
    expect(res.grid).toEqual(SOLVED);
  });
  it("countSolutions: 1 for a complete grid, >=2 for an empty grid", () => {
    expect(countSolutions(SOLVED, 4, 2, 2, 2)).toBe(1);
    const empty = Array.from({ length: 4 }, () => new Array(4).fill(0));
    expect(countSolutions(empty, 4, 2, 2, 2)).toBeGreaterThanOrEqual(2);
  });
  it("cellCands lists legal digits for a blank", () => {
    const g = [[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    expect(cellCands(g, 0, 1, 4, 2, 2).sort()).toEqual([2,3,4]); // not 1 (row) — col/box empty
  });
});
