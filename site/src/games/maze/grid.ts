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

const STEPS: { dr: number; dc: number; bit: number }[] = [
  { dr: -1, dc: 0, bit: N },
  { dr: 1, dc: 0, bit: S },
  { dr: 0, dc: 1, bit: E },
  { dr: 0, dc: -1, bit: W },
];

/**
 * Shortest path through open passages from `from` to `to`, as the list of step
 * cells (excluding `from`, including `to`). Returns `[]` when they're the same
 * cell, and `null` when `to` is unreachable or farther than `maxLen` steps.
 *
 * Lets a finger-drag "catch up" along the only legal corridor when pointer
 * events skip cells (fast drags, diagonal motion around corners). In a perfect
 * maze the path between two cells is unique, so this is exactly the traced route.
 */
/**
 * The open-passage cell, reachable from `from` within `maxLen` steps, whose center
 * is closest to the finger at grid-unit coords (fx, fy) — cell (r,c)'s center is
 * (c + 0.5, r + 0.5). Always returns at least `from`.
 *
 * This is what makes the trail "flow" toward where the finger is heading: we chase
 * the nearest cell of the actual corridor rather than the exact cell under the
 * finger, so an off-center drag still follows the obvious direction. Cells on other
 * corridors that happen to be spatially close but are walled off (more than `maxLen`
 * away through passages) are never reachable here, so the head can't jump to them.
 */
export function nearestReachable(open: number[][], from: Cell, fx: number, fy: number, maxLen: number): Cell {
  const dist2 = (cell: Cell) => {
    const dx = cell.c + 0.5 - fx, dy = cell.r + 0.5 - fy;
    return dx * dx + dy * dy;
  };
  let best = from, bestD = dist2(from);
  const seen = new Set<string>([cellKey(from)]);
  let frontier: Cell[] = [from];
  for (let depth = 0; depth < maxLen && frontier.length; depth++) {
    const next: Cell[] = [];
    for (const cur of frontier) {
      for (const s of STEPS) {
        if (!(open[cur.r]?.[cur.c]! & s.bit)) continue;
        const nb: Cell = { r: cur.r + s.dr, c: cur.c + s.dc };
        const k = cellKey(nb);
        if (seen.has(k)) continue;
        seen.add(k);
        const d = dist2(nb);
        if (d < bestD) { bestD = d; best = nb; }
        next.push(nb);
      }
    }
    frontier = next;
  }
  return best;
}

export function corridorPath(open: number[][], from: Cell, to: Cell, maxLen: number): Cell[] | null {
  if (from.r === to.r && from.c === to.c) return [];
  const prev = new Map<string, Cell>();
  const seen = new Set<string>([cellKey(from)]);
  let frontier: Cell[] = [from];
  for (let depth = 0; depth < maxLen && frontier.length; depth++) {
    const next: Cell[] = [];
    for (const cur of frontier) {
      for (const s of STEPS) {
        if (!(open[cur.r]?.[cur.c]! & s.bit)) continue;
        const nb: Cell = { r: cur.r + s.dr, c: cur.c + s.dc };
        const k = cellKey(nb);
        if (seen.has(k)) continue;
        seen.add(k);
        prev.set(k, cur);
        if (nb.r === to.r && nb.c === to.c) {
          const path: Cell[] = [];
          let cell: Cell | undefined = nb;
          while (cell && !(cell.r === from.r && cell.c === from.c)) {
            path.push(cell);
            cell = prev.get(cellKey(cell));
          }
          return path.reverse();
        }
        next.push(nb);
      }
    }
    frontier = next;
  }
  return null;
}
