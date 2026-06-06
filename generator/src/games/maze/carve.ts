import { shuffle, type Rng } from "../../core/rng";
import { DIRS } from "./types";

/** Carve a perfect maze (spanning tree) with an iterative recursive-backtracker. */
export function carveMaze(cols: number, rows: number, rng: Rng): number[][] {
  const open: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const stack: { r: number; c: number }[] = [{ r: 0, c: 0 }];
  visited[0]![0] = true;

  while (stack.length) {
    const cur = stack[stack.length - 1]!;
    let moved = false;
    for (const d of shuffle([...DIRS], rng)) {
      const nr = cur.r + d.dr, nc = cur.c + d.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr]![nc]) continue;
      open[cur.r]![cur.c]! |= d.bit;
      open[nr]![nc]! |= d.opp;
      visited[nr]![nc] = true;
      stack.push({ r: nr, c: nc });
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }
  return open;
}
