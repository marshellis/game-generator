import { N, S, type Cell } from "./types";

const key = (r: number, c: number) => `${r},${c}`;

/**
 * Plan a cluster of sealed decoy entrances next to the real start (0,0).
 * Decoy i sits at (0, 1+i) with a corridor running down to (depth, 1+i).
 * Returns the entrance cells (where icons go) and the full set of reserved
 * (blocked) cells to keep out of the main carve. Pure; consumes no RNG.
 */
export function planDecoys(
  cols: number,
  rows: number,
  count: number,
  depth: number,
): { entrances: Cell[]; blocked: Set<string> } {
  const n = Math.max(0, Math.min(count, cols - 1));
  const d = Math.max(0, Math.min(depth, rows - 1));
  const entrances: Cell[] = [];
  const blocked = new Set<string>();
  for (let i = 0; i < n; i++) {
    const c = 1 + i;
    entrances.push({ r: 0, c });
    for (let r = 0; r <= d; r++) blocked.add(key(r, c));
  }
  return { entrances, blocked };
}

/**
 * Carve each decoy entrance into a straight vertical dead-end of length `depth`.
 * Mutates `open`. Only touches the reserved decoy columns, so the pockets stay
 * sealed from the main maze. Pure w.r.t. RNG.
 */
export function carveDecoyPockets(open: number[][], entrances: Cell[], depth: number, rows: number): void {
  const d = Math.max(0, Math.min(depth, rows - 1));
  for (const e of entrances) {
    for (let r = 0; r < d; r++) {
      open[r]![e.c]! |= S;
      open[r + 1]![e.c]! |= N;
    }
  }
}
