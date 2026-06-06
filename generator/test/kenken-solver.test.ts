import { describe, it, expect } from "vitest";
import { latinValid, cageSatisfied, countSolutions } from "../src/games/kenken/solver";
import type { Cage } from "../src/games/kenken/types";

describe("kenken solver", () => {
  it("latinValid", () => {
    expect(latinValid([[1,2],[2,1]], 2)).toBe(true);
    expect(latinValid([[1,2],[1,2]], 2)).toBe(false);
  });
  it("cageSatisfied handles each op", () => {
    const grid = [[6,2],[3,4]];
    expect(cageSatisfied({ cells: [{r:0,c:0}], op: "=", target: 6 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "+", target: 8 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "*", target: 12 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "-", target: 4 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "/", target: 3 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "+", target: 9 }, grid)).toBe(false);
  });
  it("countSolutions: 1 for a constrained 2×2, >=2 when under-constrained", () => {
    // 2×2 Latin with a single-cell given pinning the grid:
    const unique: Cage[] = [
      { cells: [{r:0,c:0}], op: "=", target: 1 },
      { cells: [{r:0,c:1}], op: "=", target: 2 },
      { cells: [{r:1,c:0},{r:1,c:1}], op: "+", target: 3 },
    ];
    expect(countSolutions(2, unique, 2)).toBe(1);
    const loose: Cage[] = [
      { cells: [{r:0,c:0},{r:0,c:1}], op: "+", target: 3 },
      { cells: [{r:1,c:0},{r:1,c:1}], op: "+", target: 3 },
    ];
    expect(countSolutions(2, loose, 2)).toBeGreaterThanOrEqual(2);
  });
});
