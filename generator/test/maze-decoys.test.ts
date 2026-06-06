import { describe, it, expect } from "vitest";
import { planDecoys, carveDecoyPockets } from "../src/games/maze/decoys";
import { N, S } from "../src/games/maze/types";

describe("planDecoys", () => {
  it("returns no entrances and empty blocked for count 0", () => {
    const { entrances, blocked } = planDecoys(10, 10, 0, 0);
    expect(entrances).toEqual([]);
    expect(blocked.size).toBe(0);
  });

  it("places entrances on the top row right of the start, with corridor cells blocked", () => {
    const { entrances, blocked } = planDecoys(14, 14, 2, 2);
    expect(entrances).toEqual([{ r: 0, c: 1 }, { r: 0, c: 2 }]);
    // each decoy reserves entrance + depth corridor cells = depth+1 cells
    expect(blocked.size).toBe(2 * (2 + 1));
    expect(blocked.has("0,1")).toBe(true);
    expect(blocked.has("1,1")).toBe(true);
    expect(blocked.has("2,1")).toBe(true);
    expect(blocked.has("0,2")).toBe(true);
    expect(blocked.has("0,0")).toBe(false); // never blocks the real start
  });

  it("clamps count and depth to fit the grid", () => {
    const { entrances, blocked } = planDecoys(3, 2, 9, 9); // cols-1=2 cols available, rows-1=1 deep
    expect(entrances.length).toBe(2);           // columns 1,2 only
    expect(blocked.size).toBe(2 * (1 + 1));      // depth clamped to rows-1=1
  });
});

describe("carveDecoyPockets", () => {
  it("opens each entrance straight down through its corridor and nothing else", () => {
    const cols = 14, rows = 14, depth = 2;
    const { entrances } = planDecoys(cols, rows, 2, depth);
    const open: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
    carveDecoyPockets(open, entrances, depth, rows);
    for (const e of entrances) {
      // vertical links S/N down the column for `depth` steps
      for (let r = 0; r < depth; r++) {
        expect(open[r]![e.c]! & S).toBe(S);
        expect(open[r + 1]![e.c]! & N).toBe(N);
      }
      // bottom of the corridor is a dead end (no further S)
      expect(open[depth]![e.c]! & S).toBe(0);
    }
  });
});
