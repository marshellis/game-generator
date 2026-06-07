import { describe, it, expect } from "vitest";
import { pruneShortDeadEnds } from "../src/games/maze/prune";
import { N, E, S, W } from "../src/games/maze/types";

const key = (r: number, c: number) => `${r},${c}`;
const degree = (m: number) => [1, 2, 4, 8].filter((b) => m & b).length;

// Build a small maze by hand. Layout (3 rows x 5 cols), all on row 1 is a
// straight corridor 0..4; row 0 has two branches hanging UP off the corridor:
//   - a SHORT stub at column 1 (1 cell deep)
//   - a LONG stub at columns 3 (up) then we extend it with row 0..  we keep it simple:
// corridor row1: (1,0)-(1,1)-(1,2)-(1,3)-(1,4)
// short branch:  (1,1)-(0,1)                 length 1
// long branch:   (1,3)-(0,3)-(0,2)           length 2
function buildGrid(): number[][] {
  const rows = 3, cols = 5;
  const open: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const link = (ar: number, ac: number, br: number, bc: number) => {
    const dr = br - ar, dc = bc - ac;
    const bit = dr === -1 ? N : dr === 1 ? S : dc === 1 ? E : W;
    const opp = dr === -1 ? S : dr === 1 ? N : dc === 1 ? W : E;
    open[ar]![ac]! |= bit;
    open[br]![bc]! |= opp;
  };
  // corridor along row 1
  link(1, 0, 1, 1); link(1, 1, 1, 2); link(1, 2, 1, 3); link(1, 3, 1, 4);
  // short stub up from (1,1)
  link(1, 1, 0, 1);
  // longer stub up from (1,3) then left to (0,2)
  link(1, 3, 0, 3); link(0, 3, 0, 2);
  return open;
}

describe("pruneShortDeadEnds", () => {
  it("is a no-op when minLen <= 0", () => {
    const open = buildGrid();
    const before = JSON.stringify(open);
    pruneShortDeadEnds(open, 3, 5, 0, new Set());
    expect(JSON.stringify(open)).toBe(before);
  });

  it("seals stubs shorter than minLen and keeps longer ones", () => {
    const open = buildGrid();
    // protect the corridor row 1 (the 'solution') and the grid endpoints
    const prot = new Set<string>();
    for (let c = 0; c < 5; c++) prot.add(key(1, c));

    pruneShortDeadEnds(open, 3, 5, 2, prot); // seal stubs of length < 2 (i.e. length 1)

    // short stub (0,1) sealed: no openings, and corridor (1,1) no longer opens N
    expect(open[0]![1]).toBe(0);
    expect(open[1]![1]! & N).toBe(0);

    // long stub (length 2) preserved: (0,3) and (0,2) still connected
    expect(degree(open[0]![3]!)).toBeGreaterThan(0);
    expect(degree(open[0]![2]!)).toBeGreaterThan(0);
    expect(open[1]![3]! & N).toBe(N);
  });

  it("never seals protected cells and keeps walls symmetric", () => {
    const open = buildGrid();
    const prot = new Set<string>();
    for (let c = 0; c < 5; c++) prot.add(key(1, c));

    pruneShortDeadEnds(open, 3, 5, 5, prot); // aggressive: seal everything off the corridor

    // corridor (protected) intact end to end
    for (let c = 0; c < 5; c++) expect(degree(open[1]![c]!)).toBeGreaterThan(0);
    expect(open[1]![0]! & E).toBe(E);
    expect(open[1]![4]! & W).toBe(W);

    // both branches sealed
    expect(open[0]![1]).toBe(0);
    expect(open[0]![2]).toBe(0);
    expect(open[0]![3]).toBe(0);

    // symmetric walls everywhere
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      if (c < 4) expect(!!(open[r]![c]! & E)).toBe(!!(open[r]![c + 1]! & W));
      if (r < 2) expect(!!(open[r]![c]! & S)).toBe(!!(open[r + 1]![c]! & N));
    }
  });
});
