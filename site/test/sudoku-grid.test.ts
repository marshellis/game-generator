import { describe, it, expect } from "vitest";
import { conflicts } from "../src/games/sudoku/grid";

describe("sudoku grid helpers", () => {
  const boxW = 2, boxH = 2, size = 4;
  it("flags a cell that duplicates within its row", () => {
    const g = [[1,1,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    const set = conflicts(g, size, boxW, boxH);
    expect(set.has("0,0")).toBe(true);
    expect(set.has("0,1")).toBe(true);
  });
  it("flags a box duplicate and leaves clean cells alone", () => {
    const g = [[2,0,0,0],[0,2,0,0],[0,0,0,0],[0,0,0,0]]; // both in top-left box
    const set = conflicts(g, size, boxW, boxH);
    expect(set.has("0,0")).toBe(true);
    expect(set.has("1,1")).toBe(true);
    expect(set.has("3,3")).toBe(false);
  });
});
