import { describe, it, expect } from "vitest";
import { carveMaze } from "../src/games/maze/carve";
import { makeRng } from "../src/core/rng";
import { E } from "../src/games/maze/types";

describe("carveMaze with blocked cells", () => {
  it("empty blocked set is byte-identical to no argument", () => {
    for (const seed of [1, 2, 7, 99]) {
      const a = carveMaze(8, 8, makeRng(seed));
      const b = carveMaze(8, 8, makeRng(seed), new Set());
      expect(b).toEqual(a);
    }
  });

  it("blocked cells stay sealed (open=0, no neighbor opens into them)", () => {
    const blocked = new Set(["0,1", "1,1"]); // a 1-wide, 2-deep stub next to (0,0)
    const open = carveMaze(6, 6, makeRng(5), blocked);
    expect(open[0]![1]).toBe(0);
    expect(open[1]![1]).toBe(0);
    expect(open[0]![0]! & E).toBe(0); // (0,0) does not open east into the blocked cell
    expect(open[0]![2]! & 8).toBe(0); // (0,2) does not open west (W=8) into it
  });

  it("the main region (grid minus blocked) is fully connected", () => {
    const blocked = new Set(["0,1", "1,1"]);
    const open = carveMaze(6, 6, makeRng(5), blocked);
    // BFS from (0,0) over open walls
    const seen = new Set<string>(["0,0"]);
    const q = [{ r: 0, c: 0 }];
    const dirs = [[ -1,0,1],[0,1,2],[1,0,4],[0,-1,8]] as const; // dr,dc,bit
    for (let i = 0; i < q.length; i++) {
      const { r, c } = q[i]!;
      for (const [dr, dc, bit] of dirs) {
        if (!(open[r]![c]! & bit)) continue;
        const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
        if (nr < 0 || nr >= 6 || nc < 0 || nc >= 6 || seen.has(k)) continue;
        seen.add(k); q.push({ r: nr, c: nc });
      }
    }
    expect(seen.size).toBe(36 - 2); // every non-blocked cell reached
  });
});
