import { describe, it, expect } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateSolution } from "../src/games/logic-grid/solution";
import { enumerateClues } from "../src/games/logic-grid/clues";
import { reduceClues } from "../src/games/logic-grid/reduce";
import { uniqueSolutionExists, isNoGuessSolvable } from "../src/games/logic-grid/solver";

describe("reduceClues", () => {
  it("produces a unique, no-guess-solvable, smaller clue set", () => {
    const C = 4, M = 4;
    const sol = generateSolution(C, M, makeRng(3));
    const all = enumerateClues(sol, { allowAdvanced: [], orderedCats: new Set() }, makeRng(3));
    const reduced = reduceClues(C, M, all, { redundancy: 0 }, makeRng(3));
    expect(reduced.length).toBeLessThan(all.length);
    expect(uniqueSolutionExists(C, M, reduced)).toBe(true);
    expect(isNoGuessSolvable(C, M, reduced)).toBe(true);
  });

  it("removing any clue from a redundancy-0 set breaks uniqueness or no-guess", () => {
    const C = 3, M = 3;
    const sol = generateSolution(C, M, makeRng(11));
    const all = enumerateClues(sol, { allowAdvanced: [], orderedCats: new Set() }, makeRng(11));
    const reduced = reduceClues(C, M, all, { redundancy: 0 }, makeRng(11));
    for (let i = 0; i < reduced.length; i++) {
      const without = reduced.filter((_, j) => j !== i);
      const stillGood = uniqueSolutionExists(C, M, without) && isNoGuessSolvable(C, M, without);
      expect(stillGood).toBe(false);
    }
  });

  it("redundancy adds back removed clues", () => {
    const C = 4, M = 4;
    const sol = generateSolution(C, M, makeRng(4));
    const all = enumerateClues(sol, { allowAdvanced: [], orderedCats: new Set() }, makeRng(4));
    const lean = reduceClues(C, M, all, { redundancy: 0 }, makeRng(4));
    const padded = reduceClues(C, M, all, { redundancy: 3 }, makeRng(4));
    expect(padded.length).toBeGreaterThan(lean.length);
  });
});
