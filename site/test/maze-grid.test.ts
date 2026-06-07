import { describe, it, expect } from "vitest";
import { N, E, S, W, isOpen, isValidStep, cellKey, isEntryPoint, corridorPath } from "../src/games/maze/grid";

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

describe("corridorPath", () => {
  // An L-shaped corridor: (0,0)-(0,1)-(0,2) then down (1,2)-(2,2).
  const open = [
    [E, W | E, W | S],
    [0, 0, N | S],
    [0, 0, N],
  ];

  it("returns the unique step list from a cell to a reachable target (excludes start)", () => {
    const path = corridorPath(open, { r: 0, c: 0 }, { r: 0, c: 2 }, 8);
    expect(path).toEqual([{ r: 0, c: 1 }, { r: 0, c: 2 }]);
  });

  it("follows the corridor around a corner", () => {
    const path = corridorPath(open, { r: 0, c: 0 }, { r: 2, c: 2 }, 8);
    expect(path).toEqual([{ r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 2 }, { r: 2, c: 2 }]);
  });

  it("returns an empty array when from === to", () => {
    expect(corridorPath(open, { r: 0, c: 0 }, { r: 0, c: 0 }, 8)).toEqual([]);
  });

  it("returns null when the target is beyond maxLen", () => {
    expect(corridorPath(open, { r: 0, c: 0 }, { r: 2, c: 2 }, 3)).toBeNull();
  });

  it("returns null when the target is walled off", () => {
    expect(corridorPath(open, { r: 0, c: 0 }, { r: 1, c: 0 }, 8)).toBeNull();
  });
});
