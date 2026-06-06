// generator/src/games/kenken/solver.ts
import type { Cage } from "./types";

export function latinValid(grid: number[][], size: number): boolean {
  for (let i = 0; i < size; i++) {
    const row = new Set<number>(), col = new Set<number>();
    for (let j = 0; j < size; j++) {
      const rv = grid[i]![j]!, cv = grid[j]![i]!;
      if (rv < 1 || rv > size || row.has(rv)) return false;
      if (cv < 1 || cv > size || col.has(cv)) return false;
      row.add(rv); col.add(cv);
    }
  }
  return true;
}

/** True iff the cage's cells are all filled and combine to its target. */
export function cageSatisfied(cage: Cage, grid: number[][]): boolean {
  const vals = cage.cells.map(({ r, c }) => grid[r]![c]!);
  if (vals.some((v) => v === 0)) return false;
  switch (cage.op) {
    case "=": return vals[0] === cage.target;
    case "+": return vals.reduce((a, b) => a + b, 0) === cage.target;
    case "*": return vals.reduce((a, b) => a * b, 1) === cage.target;
    case "-": { if (vals.length !== 2) return false; return Math.abs(vals[0]! - vals[1]!) === cage.target; }
    case "/": {
      if (vals.length !== 2) return false;
      const hi = Math.max(vals[0]!, vals[1]!), lo = Math.min(vals[0]!, vals[1]!);
      return lo !== 0 && hi % lo === 0 && hi / lo === cage.target;
    }
  }
}

/** Count complete Latin fills consistent with every cage, stopping at `limit`. */
export function countSolutions(size: number, cages: Cage[], limit = 2): number {
  const cellCage: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  cages.forEach((cage, i) => cage.cells.forEach(({ r, c }) => { cellCage[r]![c] = i; }));
  const idx = (r: number, c: number) => r * size + c;
  const cageLast = cages.map((cage) => Math.max(...cage.cells.map(({ r, c }) => idx(r, c))));

  const grid: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const rowUsed: boolean[][] = Array.from({ length: size }, () => new Array(size + 1).fill(false));
  const colUsed: boolean[][] = Array.from({ length: size }, () => new Array(size + 1).fill(false));
  let count = 0;

  const bt = (pos: number): void => {
    if (count >= limit) return;
    if (pos === size * size) { count++; return; }
    const r = Math.floor(pos / size), c = pos % size;
    for (let v = 1; v <= size; v++) {
      if (rowUsed[r]![v] || colUsed[c]![v]) continue;
      grid[r]![c] = v; rowUsed[r]![v] = true; colUsed[c]![v] = true;
      const ci = cellCage[r]![c]!;
      const ok = idx(r, c) !== cageLast[ci] || cageSatisfied(cages[ci]!, grid);
      if (ok) bt(pos + 1);
      grid[r]![c] = 0; rowUsed[r]![v] = false; colUsed[c]![v] = false;
      if (count >= limit) return;
    }
  };
  bt(0);
  return count;
}
