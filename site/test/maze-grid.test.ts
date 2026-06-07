import { describe, it, expect } from "vitest";
import { N, E, S, W, isOpen, isValidStep, cellKey, isEntryPoint, corridorPath, nearestReachable } from "../src/games/maze/grid";

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

describe("nearestReachable", () => {
  // L-shaped corridor: (0,0)-(0,1)-(0,2) then down (1,2)-(2,2).
  const open = [
    [E, W | E, W | S],
    [0, 0, N | S],
    [0, 0, N],
  ];
  // cell (r,c) center in grid units is (c + 0.5, r + 0.5)

  it("returns the reachable cell whose center is nearest the finger", () => {
    // finger parked over (0,2)
    expect(nearestReachable(open, { r: 0, c: 0 }, 2.5, 0.5, 8)).toEqual({ r: 0, c: 2 });
  });

  it("tolerates an imprecise finger — snaps to the corridor cell, not the exact point", () => {
    // finger drifted off-center but is still clearly nearest the (0,2) corridor cell
    expect(nearestReachable(open, { r: 0, c: 0 }, 2.3, 0.8, 8)).toEqual({ r: 0, c: 2 });
  });

  it("follows the obvious direction around a corner", () => {
    // finger near the bottom of the L
    expect(nearestReachable(open, { r: 0, c: 0 }, 2.5, 2.5, 8)).toEqual({ r: 2, c: 2 });
  });

  it("only advances as far as maxLen allows toward a far finger", () => {
    // finger past the end, but we may only chase 1 cell this move
    expect(nearestReachable(open, { r: 0, c: 0 }, 2.5, 2.5, 1)).toEqual({ r: 0, c: 1 });
  });

  it("stays put when the finger points into a wall (no corridor that way)", () => {
    // finger straight down from the start, which is walled off
    expect(nearestReachable(open, { r: 0, c: 0 }, 0.5, 2.5, 8)).toEqual({ r: 0, c: 0 });
  });

  it("never jumps to a spatially-close cell on a different, unreachable corridor", () => {
    // two parallel rows, NOT connected; head on the top row
    const split = [
      [E, W],
      [E, W],
    ];
    // finger sits over (1,1) on the lower corridor — unreachable from (0,0)
    // so we chase along our own row toward it, landing on (0,1), never (1,1)
    expect(nearestReachable(split, { r: 0, c: 0 }, 1.5, 1.5, 8)).toEqual({ r: 0, c: 1 });
  });
});
