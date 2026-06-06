import { describe, it, expect } from "vitest";
import { generateSudoku } from "../src/games/sudoku/generate";
import { countSolutions, solveLogical, solvedValid } from "../src/games/sudoku/solver";

describe("property: every generated sudoku is valid", () => {
  for (const g of ["g1","g2","g3","g4","g5","g6","g7","g8"]) {
    for (let seed = 1; seed <= 2; seed++) {
      it(`${g} seed ${seed}: unique + no-guess + valid`, () => {
        const s = generateSudoku({ difficulty: g, seed, date: "2026-06-06" });
        expect(solvedValid(s.solution, s.size, s.boxW, s.boxH)).toBe(true);
        expect(countSolutions(s.givens, s.size, s.boxW, s.boxH, 2)).toBe(1);
        const res = solveLogical(s.givens, s.size, s.boxW, s.boxH, s.maxTier);
        expect(res.solved).toBe(true);
        // givens are a subset of solution
        for (let r = 0; r < s.size; r++) for (let c = 0; c < s.size; c++)
          if (s.givens[r]![c]! !== 0) expect(s.givens[r]![c]).toBe(s.solution[r]![c]);
      });
    }
  }
});
