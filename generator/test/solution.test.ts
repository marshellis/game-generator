import { describe, it, expect } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateSolution } from "../src/games/logic-grid/solution";

describe("generateSolution", () => {
  it("anchor category is identity", () => {
    const sol = generateSolution(4, 5, makeRng(1));
    expect(sol[0]).toEqual([0, 1, 2, 3, 4]);
  });

  it("every non-anchor category is a permutation of 0..M-1", () => {
    const sol = generateSolution(4, 5, makeRng(2));
    for (let c = 1; c < 4; c++) {
      expect([...sol[c]!].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("is deterministic for a seed", () => {
    expect(generateSolution(3, 4, makeRng(9))).toEqual(generateSolution(3, 4, makeRng(9)));
  });
});
