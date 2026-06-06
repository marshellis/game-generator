import { describe, it, expect } from "vitest";
import { generateKenKen } from "../src/games/kenken/generate";
import { latinValid, cageSatisfied, countSolutions } from "../src/games/kenken/solver";

describe("generateKenKen", () => {
  it("g1 3×3: unique, valid latin, cages cover all cells & match solution", () => {
    const k = generateKenKen({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect(k.size).toBe(3);
    expect(latinValid(k.solution, 3)).toBe(true);
    expect(countSolutions(3, k.cages, 2)).toBe(1);
    // every cell covered exactly once
    const seen = new Set<string>();
    for (const cage of k.cages) for (const { r, c } of cage.cells) { expect(seen.has(`${r},${c}`)).toBe(false); seen.add(`${r},${c}`); }
    expect(seen.size).toBe(9);
    // every cage satisfied by the solution; ops within preset (+ only for g1)
    for (const cage of k.cages) {
      expect(cageSatisfied(cage, k.solution)).toBe(true);
      expect(["+", "="]).toContain(cage.op);
    }
    expect(k.id).toBe("2026-06-06-kenken-g1-1");
  });
  it("g7 6×6: unique; − and ÷ only on 2-cell cages", () => {
    const k = generateKenKen({ difficulty: "g7", seed: 3, date: "2026-06-06" });
    expect(k.size).toBe(6);
    expect(countSolutions(6, k.cages, 2)).toBe(1);
    for (const cage of k.cages) {
      if (cage.op === "-" || cage.op === "/") expect(cage.cells.length).toBe(2);
      expect(cageSatisfied(cage, k.solution)).toBe(true);
    }
  });
  it("deterministic by seed", () => {
    expect(JSON.stringify(generateKenKen({ difficulty: "g4", seed: 5, date: "2026-06-06" })))
      .toEqual(JSON.stringify(generateKenKen({ difficulty: "g4", seed: 5, date: "2026-06-06" })));
  });
});
