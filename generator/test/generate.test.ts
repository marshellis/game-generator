import { describe, it, expect } from "vitest";
import { generatePuzzle } from "../src/games/logic-grid/generate";
import { uniqueSolutionExists, isNoGuessSolvable } from "../src/games/logic-grid/solver";
import { clueIsTrue } from "../src/games/logic-grid/clues";

describe("generatePuzzle", () => {
  it("produces a unique, no-guess puzzle with true, phrased clues", () => {
    const p = generatePuzzle({ difficulty: "g4", seed: 123, date: "2026-06-04" });
    const C = p.categories.length;
    const M = p.categories[0]!.items.length;
    const structured = p.clues.map((c) => c.structured);
    expect(uniqueSolutionExists(C, M, structured)).toBe(true);
    expect(isNoGuessSolvable(C, M, structured)).toBe(true);
    for (const c of p.clues) {
      expect(clueIsTrue(p.solution, c.structured)).toBe(true);
      expect(c.text.length).toBeGreaterThan(0);
    }
    expect(p.id).toContain("2026-06-04");
    expect(p.gameType).toBe("logic-grid");
  });

  it("is deterministic for a seed", () => {
    const a = generatePuzzle({ difficulty: "g3", seed: 7, date: "2026-06-04" });
    const b = generatePuzzle({ difficulty: "g3", seed: 7, date: "2026-06-04" });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("respects category/item overrides", () => {
    const p = generatePuzzle({ difficulty: "g1", seed: 1, date: "2026-06-04", overrides: { categories: 4, items: 4 } });
    expect(p.categories).toHaveLength(4);
    expect(p.categories[0]!.items).toHaveLength(4);
  });
});
