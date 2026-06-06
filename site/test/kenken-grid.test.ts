import { describe, it, expect } from "vitest";
import { conflicts, cageSatisfied } from "../src/games/kenken/grid";

describe("kenken grid helpers", () => {
  it("conflicts flags row/col duplicates", () => {
    const g = [[1,1],[0,0]];
    const set = conflicts(g, 2);
    expect(set.has("0,0")).toBe(true);
    expect(set.has("0,1")).toBe(true);
    expect(set.has("1,0")).toBe(false);
  });
  it("cageSatisfied matches operations", () => {
    const grid = [[6,2],[3,4]];
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "/", target: 3 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:1,c:0},{r:1,c:1}], op: "+", target: 7 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0}], op: "=", target: 6 }, grid)).toBe(true);
  });
});
