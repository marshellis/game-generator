import { describe, it, expect } from "vitest";
import { generatePuzzle } from "../src/games/logic-grid/generate";
import { uniqueSolutionExists, isNoGuessSolvable } from "../src/games/logic-grid/solver";
import { clueIsTrue } from "../src/games/logic-grid/clues";

describe("property: generated puzzles are always valid", () => {
  const grades = ["g1", "g2", "g3", "g4", "g5"];
  for (const g of grades) {
    for (let seed = 0; seed < 6; seed++) {
      it(`${g} seed ${seed}: unique, no-guess, all clues true`, () => {
        const p = generatePuzzle({ difficulty: g, seed, date: "2026-06-04" });
        const C = p.categories.length;
        const M = p.categories[0]!.items.length;
        const structured = p.clues.map((c) => c.structured);
        expect(uniqueSolutionExists(C, M, structured)).toBe(true);
        expect(isNoGuessSolvable(C, M, structured)).toBe(true);
        for (const c of p.clues) expect(clueIsTrue(p.solution, c.structured)).toBe(true);
      });
    }
  }
});
