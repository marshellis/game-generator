import { describe, it, expect } from "vitest";
import { generateKenKen } from "../src/games/kenken/generate";
import { latinValid, cageSatisfied, countSolutions } from "../src/games/kenken/solver";
import { PRESETS } from "../src/games/kenken/difficulty";

describe("property: every generated kenken is valid", () => {
  for (const g of ["g1","g2","g3","g4","g5","g6","g7","g8"]) {
    for (let seed = 1; seed <= 2; seed++) {
      it(`${g} seed ${seed}: unique + latin + cage/op consistency`, () => {
        const k = generateKenKen({ difficulty: g, seed, date: "2026-06-06" });
        const allowed = new Set<string>([...PRESETS[g]!.ops, "="]);
        expect(latinValid(k.solution, k.size)).toBe(true);
        expect(countSolutions(k.size, k.cages, 2)).toBe(1);
        const seen = new Set<string>();
        for (const cage of k.cages) {
          expect(cageSatisfied(cage, k.solution)).toBe(true);
          expect(allowed.has(cage.op)).toBe(true);
          if (cage.op === "-" || cage.op === "/") expect(cage.cells.length).toBe(2);
          for (const { r, c } of cage.cells) { expect(seen.has(`${r},${c}`)).toBe(false); seen.add(`${r},${c}`); }
        }
        expect(seen.size).toBe(k.size * k.size);
      });
    }
  }
});
