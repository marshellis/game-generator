import { describe, it, expect } from "vitest";
import { N, E, S, W, isOpen, isValidStep, cellKey, isEntryPoint } from "../src/games/maze/grid";

describe("maze grid helpers", () => {
  const open = [
    [E, W | E, W],     // row 0: (0,0)->E, (0,1)<->, (0,2)<-W
    [0, 0, 0],
    [0, 0, 0],
  ];
  it("isOpen reads a direction bit", () => {
    expect(isOpen(open, { r: 0, c: 0 }, E)).toBe(true);
    expect(isOpen(open, { r: 0, c: 0 }, S)).toBe(false);
  });
  it("isValidStep allows an adjacent open move only", () => {
    expect(isValidStep(open, { r: 0, c: 0 }, { r: 0, c: 1 })).toBe(true);  // through open E
    expect(isValidStep(open, { r: 0, c: 0 }, { r: 1, c: 0 })).toBe(false); // wall
    expect(isValidStep(open, { r: 0, c: 0 }, { r: 0, c: 2 })).toBe(false); // not adjacent
  });
  it("cellKey", () => expect(cellKey({ r: 2, c: 3 })).toBe("2,3"));
  it("isEntryPoint matches the real start or any decoy", () => {
    const entries = [{ r: 0, c: 0 }, { r: 0, c: 1 }];
    expect(isEntryPoint(entries, { r: 0, c: 0 })).toBe(true);
    expect(isEntryPoint(entries, { r: 0, c: 1 })).toBe(true);
    expect(isEntryPoint(entries, { r: 1, c: 0 })).toBe(false);
  });
});
