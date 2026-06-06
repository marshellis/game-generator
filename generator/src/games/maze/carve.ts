import { shuffle, type Rng } from "../../core/rng";
import { DIRS } from "./types";

/**
 * Carve a perfect maze (spanning tree) with an iterative recursive-backtracker.
 * `blocked` cells (keyed "r,c") are treated as pre-visited: the carve never enters
 * them and never opens a wall into them, so they stay sealed (open=0). With an empty
 * set this is byte-identical to the unblocked carve.
 */
export function carveMaze(cols: number, rows: number, rng: Rng, blocked: Set<string> = new Set()): number[][] {
  const open: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const k of blocked) {
    const [r, c] = k.split(",").map(Number) as [number, number];
    if (r >= 0 && r < rows && c >= 0 && c < cols) visited[r]![c] = true;
  }
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
