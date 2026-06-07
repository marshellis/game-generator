import { DIRS, type Cell } from "./types";

const key = (r: number, c: number) => `${r},${c}`;
const degree = (mask: number): number => [1, 2, 4, 8].filter((b) => mask & b).length;

/**
 * Seal off-solution dead-end stubs shorter than `minLen`, so every wrong turn
 * runs a real distance before dead-ending (instead of an obvious 1–2 cell stub).
 *
 * A *stub* is the run from a dead-end (degree 1) inward to the first junction
 * (degree >= 3) or protected cell. Stubs strictly shorter than `minLen` are
 * filled: every stub cell's mask is set to 0 and the junction-side wall is
 * closed symmetrically. Protected cells (start, end, every solution cell, decoy
 * cells) are never sealed and act as walk boundaries, so the start→end solution
 * always stays connected.
 *
 * Removing dead-end appendages can't disconnect the kept set, so iterating to
 * convergence is safe. No-op when `minLen <= 0`. Mutates `open`.
 */
export function pruneShortDeadEnds(
  open: number[][],
  rows: number,
  cols: number,
  minLen: number,
  protectedSet: Set<string>,
  maxPasses = 8,
): void {
  if (minLen <= 0) return;

  for (let pass = 0; pass < maxPasses; pass++) {
    let sealedAny = false;

    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (degree(open[r]![c]!) !== 1) continue; // dead-ends only
      if (protectedSet.has(key(r, c))) continue;

      // Walk inward, collecting stub cells, until a junction / protected cell /
      // until the stub is already long enough to keep.
      const stub: Cell[] = [];
      let cur: Cell = { r, c };
      let prevR = -1, prevC = -1;
      let junction: Cell | null = null;

      while (true) {
        stub.push(cur);
        if (stub.length >= minLen) break; // long enough — keep it (junction stays null)

        let next: Cell | null = null;
        for (const d of DIRS) {
          if (!(open[cur.r]![cur.c]! & d.bit)) continue;
          const nr = cur.r + d.dr, nc = cur.c + d.dc;
          if (nr === prevR && nc === prevC) continue; // don't walk back
          next = { r: nr, c: nc };
          break;
        }
        if (!next) break; // isolated chain end — keep

        if (protectedSet.has(key(next.r, next.c)) || degree(open[next.r]![next.c]!) >= 3) {
          junction = next; // stub attaches here; do not include it
          break;
        }
        prevR = cur.r; prevC = cur.c; cur = next;
      }

      if (!junction) continue; // kept (too long, isolated, or already-sealed)

      // Close the junction-side wall (cur is the stub cell adjacent to junction).
      const dr = cur.r - junction.r, dc = cur.c - junction.c;
      for (const d of DIRS) {
        if (d.dr === dr && d.dc === dc) open[junction.r]![junction.c]! &= ~d.bit;
      }
      for (const s of stub) open[s.r]![s.c]! = 0;
      sealedAny = true;
    }

    if (!sealedAny) break;
  }
}
