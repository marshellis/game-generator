// generator/src/games/sudoku/solver.ts
import type { Cell } from "./types";

export function units(size: number, boxW: number, boxH: number): Cell[][] {
  const u: Cell[][] = [];
  for (let r = 0; r < size; r++) { const row: Cell[] = []; for (let c = 0; c < size; c++) row.push({ r, c }); u.push(row); }
  for (let c = 0; c < size; c++) { const col: Cell[] = []; for (let r = 0; r < size; r++) col.push({ r, c }); u.push(col); }
  for (let br = 0; br < size / boxH; br++) for (let bc = 0; bc < size / boxW; bc++) {
    const box: Cell[] = [];
    for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) box.push({ r: br * boxH + dr, c: bc * boxW + dc });
    u.push(box);
  }
  return u;
}

export function cellCands(grid: number[][], r: number, c: number, size: number, boxW: number, boxH: number): number[] {
  const used = new Set<number>();
  for (let k = 0; k < size; k++) { used.add(grid[r]![k]!); used.add(grid[k]![c]!); }
  const br = Math.floor(r / boxH) * boxH, bc = Math.floor(c / boxW) * boxW;
  for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) used.add(grid[br + dr]![bc + dc]!);
  const out: number[] = [];
  for (let d = 1; d <= size; d++) if (!used.has(d)) out.push(d);
  return out;
}

function buildCands(grid: number[][], size: number, boxW: number, boxH: number): Set<number>[][] {
  const cands: Set<number>[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => new Set<number>()));
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (grid[r]![c]! === 0) cands[r]![c] = new Set(cellCands(grid, r, c, size, boxW, boxH));
  }
  return cands;
}

const isFull = (grid: number[][]): boolean => grid.every((row) => row.every((v) => v !== 0));

export function solvedValid(grid: number[][], size: number, boxW: number, boxH: number): boolean {
  const ok = (cells: Cell[]): boolean => {
    const seen = new Set<number>();
    for (const { r, c } of cells) { const v = grid[r]![c]!; if (v < 1 || v > size || seen.has(v)) return false; seen.add(v); }
    return seen.size === size;
  };
  return units(size, boxW, boxH).every(ok);
}

function placeHiddenSingle(grid: number[][], cands: Set<number>[][], us: Cell[][]): boolean {
  for (const unit of us) {
    for (let d = 1; d <= unit.length; d++) {
      let only: Cell | null = null, cnt = 0;
      for (const { r, c } of unit) if (grid[r]![c]! === 0 && cands[r]![c]!.has(d)) { cnt++; only = { r, c }; }
      if (cnt === 1 && only) { grid[only.r]![only.c] = d; return true; }
    }
  }
  return false;
}

function applyNakedPairs(pruned: Set<number>[][], us: Cell[][], grid: number[][]): void {
  for (const unit of us) {
    const twos = unit.filter(({ r, c }) => grid[r]![c]! === 0 && pruned[r]![c]!.size === 2);
    for (let i = 0; i < twos.length; i++) for (let j = i + 1; j < twos.length; j++) {
      const a = pruned[twos[i]!.r]![twos[i]!.c]!, b = pruned[twos[j]!.r]![twos[j]!.c]!;
      if ([...a].sort().join(",") !== [...b].sort().join(",")) continue;
      for (const { r, c } of unit) {
        if ((r === twos[i]!.r && c === twos[i]!.c) || (r === twos[j]!.r && c === twos[j]!.c)) continue;
        if (grid[r]![c]! !== 0) continue;
        for (const d of a) pruned[r]![c]!.delete(d);
      }
    }
  }
}

export interface LogicalResult { solved: boolean; grid: number[][]; hardestTier: number; }

/** Solve using only techniques up to maxTier. Places one cell per iteration. */
export function solveLogical(givens: number[][], size: number, boxW: number, boxH: number, maxTier: number): LogicalResult {
  const grid = givens.map((r) => r.slice());
  const us = units(size, boxW, boxH);
  let hardest = 0;
  while (!isFull(grid)) {
    const cands = buildCands(grid, size, boxW, boxH);
    // contradiction
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      if (grid[r]![c]! === 0 && cands[r]![c]!.size === 0) return { solved: false, grid, hardestTier: hardest };
    // T1 naked single
    let placed = false;
    for (let r = 0; r < size && !placed; r++) for (let c = 0; c < size; c++)
      if (grid[r]![c]! === 0 && cands[r]![c]!.size === 1) { grid[r]![c] = [...cands[r]![c]!][0]!; hardest = Math.max(hardest, 1); placed = true; break; }
    if (placed) continue;
    // T2 hidden single
    if (maxTier >= 2 && placeHiddenSingle(grid, cands, us)) { hardest = Math.max(hardest, 2); continue; }
    // T3 naked pairs → prune → single
    if (maxTier >= 3) {
      const pruned = cands.map((row) => row.map((s) => new Set(s)));
      applyNakedPairs(pruned, us, grid);
      for (let r = 0; r < size && !placed; r++) for (let c = 0; c < size; c++)
        if (grid[r]![c]! === 0 && pruned[r]![c]!.size === 1) { grid[r]![c] = [...pruned[r]![c]!][0]!; hardest = Math.max(hardest, 3); placed = true; break; }
      if (!placed && placeHiddenSingle(grid, pruned, us)) { hardest = Math.max(hardest, 3); placed = true; }
      if (placed) continue;
    }
    return { solved: false, grid, hardestTier: hardest };
  }
  return { solved: true, grid, hardestTier: hardest };
}

/** Count solutions by backtracking (MRV), stopping at `limit`. */
export function countSolutions(givens: number[][], size: number, boxW: number, boxH: number, limit = 2): number {
  const grid = givens.map((r) => r.slice());
  let count = 0;
  const bt = (): void => {
    if (count >= limit) return;
    let best: Cell | null = null, bestCands: number[] | null = null;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (grid[r]![c]! !== 0) continue;
      const cs = cellCands(grid, r, c, size, boxW, boxH);
      if (cs.length === 0) return;
      if (!bestCands || cs.length < bestCands.length) { best = { r, c }; bestCands = cs; }
    }
    if (!best) { count++; return; }
    for (const d of bestCands!) { grid[best.r]![best.c] = d; bt(); grid[best.r]![best.c] = 0; if (count >= limit) return; }
  };
  bt();
  return count;
}
