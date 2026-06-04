import { describe, it, expect } from "vitest";
import { Board } from "../src/games/logic-grid/board";
import { applyClues } from "../src/games/logic-grid/apply";
import { countSolutions, uniqueSolutionExists, isNoGuessSolvable, extractSolution } from "../src/games/logic-grid/solver";
import type { StructuredClue } from "../src/games/logic-grid/types";

// 2 categories, 2 items: Kid {Ann,Ben} × Pet {Cat,Dog}
function board() { return new Board(2, 2); }

describe("solver", () => {
  it("counts both solutions when unconstrained", () => {
    const b = board();
    expect(countSolutions(b, 5)).toBe(2); // Ann-Cat/Ben-Dog OR Ann-Dog/Ben-Cat
  });

  it("a single is-clue makes a 2x2 unique", () => {
    const b = board();
    const clues: StructuredClue[] = [{ type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 0 } }];
    applyClues(b, clues);
    b.propagate();
    expect(countSolutions(b, 5)).toBe(1);
    expect(uniqueSolutionExists(2, 2, clues)).toBe(true);
    expect(isNoGuessSolvable(2, 2, clues)).toBe(true);
  });

  it("extracts the solution as anchor-relative assignment", () => {
    const b = board();
    applyClues(b, [{ type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } }]);
    b.propagate();
    const sol = extractSolution(b);
    expect(sol[0]).toEqual([0, 1]); // anchor identity
    expect(sol[1]![0]).toBe(1);     // entity 0 (Ann) → Pet item 1 (Dog)
    expect(sol[1]![1]).toBe(0);     // entity 1 (Ben) → Pet item 0 (Cat)
  });

  it("detects non-unique vs unique", () => {
    expect(uniqueSolutionExists(2, 2, [])).toBe(false);
  });
});
