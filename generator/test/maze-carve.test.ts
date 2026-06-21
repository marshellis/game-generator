import { describe, it, expect } from "vitest";
import { makeRng } from "../src/core/rng";
import { carveMaze } from "../src/games/maze/carve";
import { N, E, S, W } from "../src/games/maze/types";

function reachableCount(open: number[][], rows: number, cols: number): number {
  const seen = new Set<string>(); const stack = [{ r: 0, c: 0 }]; seen.add("0,0");
  const step = [{ b: N, dr: -1, dc: 0 }, { b: E, dr: 0, dc: 1 }, { b: S, dr: 1, dc: 0 }, { b: W, dr: 0, dc: -1 }];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const s of step) {
      if (open[cur.r]![cur.c]! & s.b) {
        const nr = cur.r + s.dr, nc = cur.c + s.dc, k = `${nr},${nc}`;
        if (!seen.has(k)) { seen.add(k); stack.push({ r: nr, c: nc }); }
      }
    }
  }
  return seen.size;
}
function edgeCount(open: number[][], rows: number, cols: number): number {
  let e = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (open[r]![c]! & E) e++; // count each undirected edge once (E only)
    if (open[r]![c]! & S) e++; // and S only
  }
  return e;
}

describe("carveMaze", () => {
  it("every cell is reachable (connected)", () => {
    const open = carveMaze(10, 10, makeRng(1));
    expect(reachableCount(open, 10, 10)).toBe(100);
  });
  it("is a perfect maze: edges == cells - 1 (spanning tree)", () => {
    const open = carveMaze(10, 10, makeRng(2));
    expect(edgeCount(open, 10, 10)).toBe(100 - 1);
  });
  it("wall openings are symmetric", () => {
    const open = carveMaze(8, 8, makeRng(3));
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (c < 7) expect(!!(open[r]![c]! & E)).toBe(!!(open[r]![c + 1]! & W));
      if (r < 7) expect(!!(open[r]![c]! & S)).toBe(!!(open[r + 1]![c]! & N));
    }
  });
  it("is deterministic for a seed", () => {
    expect(carveMaze(6, 6, makeRng(9))).toEqual(carveMaze(6, 6, makeRng(9)));
  });

  it("straight bias still yields a connected spanning tree", () => {
    const open = carveMaze(12, 12, makeRng(4), new Set(), 0.8);
    expect(reachableCount(open, 12, 12)).toBe(144);
    expect(edgeCount(open, 12, 12)).toBe(144 - 1);
  });

  it("straight bias is deterministic for a seed", () => {
    expect(carveMaze(10, 10, makeRng(3), new Set(), 0.8))
      .toEqual(carveMaze(10, 10, makeRng(3), new Set(), 0.8));
  });

  it("straight bias produces fewer (longer) dead-ends than an unbiased carve", () => {
    const deadEnds = (open: number[][], rows: number, cols: number) => {
      let d = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if ([N, E, S, W].filter((b) => open[r]![c]! & b).length === 1) d++;
      }
      return d;
    };
    let biased = 0, plain = 0;
    for (let seed = 0; seed < 12; seed++) {
      biased += deadEnds(carveMaze(16, 16, makeRng(seed), new Set(), 0.85), 16, 16);
      plain += deadEnds(carveMaze(16, 16, makeRng(seed), new Set(), 0), 16, 16);
    }
    // Fewer dead-ends ⇒ longer corridors ⇒ wrong turns run further before ending.
    expect(biased).toBeLessThan(plain);
  });
});
