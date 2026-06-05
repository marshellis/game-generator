import { describe, it, expect } from "vitest";
import { makeRng } from "../src/core/rng";
import { carveMaze } from "../src/games/maze/carve";
import { farthestCell, solutionPath, braid } from "../src/games/maze/solve";
import { N, E, S, W } from "../src/games/maze/types";

const adj = (a: {r:number;c:number}, b: {r:number;c:number}) =>
  Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
const openBetween = (open: number[][], a: {r:number;c:number}, b: {r:number;c:number}) => {
  if (b.r === a.r - 1) return !!(open[a.r]![a.c]! & N);
  if (b.r === a.r + 1) return !!(open[a.r]![a.c]! & S);
  if (b.c === a.c + 1) return !!(open[a.r]![a.c]! & E);
  return !!(open[a.r]![a.c]! & W);
};

describe("maze solve", () => {
  it("farthestCell returns a cell at max BFS distance from start", () => {
    const open = carveMaze(10, 10, makeRng(1));
    const end = farthestCell(open, 10, 10, { r: 0, c: 0 });
    expect(end).not.toEqual({ r: 0, c: 0 });
  });
  it("solutionPath is a valid adjacent, wall-respecting start→end path", () => {
    const open = carveMaze(10, 10, makeRng(1));
    const start = { r: 0, c: 0 };
    const end = farthestCell(open, 10, 10, start);
    const path = solutionPath(open, 10, 10, start, end);
    expect(path[0]).toEqual(start);
    expect(path[path.length - 1]).toEqual(end);
    for (let i = 1; i < path.length; i++) {
      expect(adj(path[i - 1]!, path[i]!)).toBe(true);
      expect(openBetween(open, path[i - 1]!, path[i]!)).toBe(true);
    }
  });
  it("braid keeps symmetry and only adds openings", () => {
    const open = carveMaze(8, 8, makeRng(2));
    const before = open.flat().reduce((s, m) => s + m, 0);
    braid(open, 8, 8, 0.5, makeRng(2));
    const after = open.flat().reduce((s, m) => s + m, 0);
    expect(after).toBeGreaterThanOrEqual(before);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (c < 7) expect(!!(open[r]![c]! & E)).toBe(!!(open[r]![c + 1]! & W));
      if (r < 7) expect(!!(open[r]![c]! & S)).toBe(!!(open[r + 1]![c]! & N));
    }
  });
});
