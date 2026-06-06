// site/src/games/maze/grid.ts
export const N = 1, E = 2, S = 4, W = 8;
export interface Cell { r: number; c: number; }

export const cellKey = (c: Cell): string => `${c.r},${c.c}`;

export function isOpen(open: number[][], cell: Cell, dir: number): boolean {
  return !!(open[cell.r]?.[cell.c]! & dir);
}

/** True iff `c` is one of the entry points (real start or a decoy start). */
export function isEntryPoint(entries: Cell[], c: Cell): boolean {
  return entries.some((e) => e.r === c.r && e.c === c.c);
}

/** True iff b is orthogonally adjacent to a and the wall between them is open. */
export function isValidStep(open: number[][], a: Cell, b: Cell): boolean {
  const dr = b.r - a.r, dc = b.c - a.c;
  if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
  if (dr === -1) return isOpen(open, a, N);
  if (dr === 1) return isOpen(open, a, S);
  if (dc === 1) return isOpen(open, a, E);
  return isOpen(open, a, W);
}
