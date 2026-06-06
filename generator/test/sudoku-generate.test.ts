import { describe, it, expect } from "vitest";
import { generateSudoku } from "../src/games/sudoku/generate";
import { countSolutions, solveLogical, solvedValid } from "../src/games/sudoku/solver";

describe("generateSudoku", () => {
  it("g1 (4x4): unique, no-guess within tier, givens ⊆ solution", () => {
    const s = generateSudoku({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect(s.size).toBe(4);
    expect(solvedValid(s.solution, 4, 2, 2)).toBe(true);
    expect(countSolutions(s.givens, 4, 2, 2, 2)).toBe(1);
    expect(solveLogical(s.givens, 4, 2, 2, 1).solved).toBe(true);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
      if (s.givens[r]![c]! !== 0) expect(s.givens[r]![c]).toBe(s.solution[r]![c]);
    expect(s.id).toBe("2026-06-06-sudoku-g1-1");
  });
  it("g5 (9x9): unique and solvable within its tier", () => {
    const s = generateSudoku({ difficulty: "g5", seed: 2, date: "2026-06-06" });
    expect(s.size).toBe(9);
    expect(countSolutions(s.givens, 9, 3, 3, 2)).toBe(1);
    expect(solveLogical(s.givens, 9, 3, 3, s.maxTier).solved).toBe(true);
  });
  it("is deterministic for a seed", () => {
    expect(JSON.stringify(generateSudoku({ difficulty: "g3", seed: 7, date: "2026-06-06" })))
      .toEqual(JSON.stringify(generateSudoku({ difficulty: "g3", seed: 7, date: "2026-06-06" })));
  });
});
