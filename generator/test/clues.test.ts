import { describe, it, expect } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateSolution } from "../src/games/logic-grid/solution";
import { enumerateClues, entityOf, clueIsTrue } from "../src/games/logic-grid/clues";

describe("clue enumeration", () => {
  it("entityOf finds the entity for a ref under the solution", () => {
    const sol = generateSolution(3, 3, makeRng(1)); // sol[0] identity
    expect(entityOf(sol, { cat: 0, item: 2 })).toBe(2);
    expect(entityOf(sol, { cat: 1, item: sol[1]![0]! })).toBe(0);
  });

  it("every enumerated clue is true under the solution", () => {
    const sol = generateSolution(4, 4, makeRng(5));
    const ordered = new Set([3]);
    const clues = enumerateClues(sol, { allowAdvanced: ["eitherOr", "comparative"], orderedCats: ordered }, makeRng(5));
    expect(clues.length).toBeGreaterThan(0);
    for (const c of clues) expect(clueIsTrue(sol, c)).toBe(true);
  });

  it("omits comparatives when no ordered categories", () => {
    const sol = generateSolution(3, 3, makeRng(7));
    const clues = enumerateClues(sol, { allowAdvanced: ["comparative"], orderedCats: new Set() }, makeRng(7));
    expect(clues.some((c) => c.type === "comparative")).toBe(false);
  });
});
