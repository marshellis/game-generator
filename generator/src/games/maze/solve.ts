import { shuffle, type Rng } from "../../core/rng";
import { DIRS, type Cell } from "./types";

const key = (r: number, c: number) => `${r},${c}`;

function bfs(open: number[][], rows: number, cols: number, start: Cell) {
  const dist = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  const prev = new Map<string, Cell>();
  dist[start.r]![start.c] = 0;
  const q: Cell[] = [start];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]!;
    for (const d of DIRS) {
      if (!(open[cur.r]![cur.c]! & d.bit)) continue;
      const nr = cur.r + d.dr, nc = cur.c + d.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || dist[nr]![nc] !== -1) continue;
      dist[nr]![nc] = dist[cur.r]![cur.c]! + 1;
      prev.set(key(nr, nc), cur);
      q.push({ r: nr, c: nc });
    }
  }
  return { dist, prev };
}

export function farthestCell(open: number[][], rows: number, cols: number, start: Cell): Cell {
  const { dist } = bfs(open, rows, cols, start);
  let best = start, bestD = -1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (dist[r]![c]! > bestD) { bestD = dist[r]![c]!; best = { r, c }; }
  }
  return best;
}

export function solutionPath(open: number[][], rows: number, cols: number, start: Cell, end: Cell): Cell[] {
  const { prev } = bfs(open, rows, cols, start);
  const path: Cell[] = [end];
  let cur = end;
  while (!(cur.r === start.r && cur.c === start.c)) {
    const p = prev.get(key(cur.r, cur.c));
    if (!p) break; // disconnected (shouldn't happen)
    path.push(p);
    cur = p;
  }
  return path.reverse();
}

/** Open a fraction of dead-ends into loops (gentler mazes). Mutates `open`. */
export function braid(open: number[][], rows: number, cols: number, factor: number, rng: Rng): void {
  if (factor <= 0) return;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const m = open[r]![c]!;
    const openCount = [1, 2, 4, 8].filter((b) => m & b).length;
    if (openCount !== 1) continue; // dead-end only
    if (rng() > factor) continue;
    // open a random currently-closed wall to an in-bounds neighbor
    for (const d of shuffle([...DIRS], rng)) {
      if (m & d.bit) continue;
      const nr = r + d.dr, nc = c + d.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      open[r]![c]! |= d.bit;
      open[nr]![nc]! |= d.opp;
      break;
    }
  }
}
