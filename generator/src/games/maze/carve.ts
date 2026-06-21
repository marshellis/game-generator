import { shuffle, type Rng } from "../../core/rng";
import { DIRS, type Dir } from "./types";

/**
 * Carve a perfect maze (spanning tree) with an iterative recursive-backtracker.
 * `blocked` cells (keyed "r,c") are treated as pre-visited: the carve never enters
 * them and never opens a wall into them, so they stay sealed (open=0). With an empty
 * set this is byte-identical to the unblocked carve.
 *
 * `straightBias` (0–1) makes the walk prefer continuing in the same direction it
 * entered a cell: with probability `straightBias` the straight-ahead neighbour is
 * taken when it's available (else a random unvisited neighbour). Higher bias ⇒ longer
 * straight corridors and far fewer short dead-end stubs, so off-solution wrong turns
 * run a real distance before ending instead of cutting off after a cell or two. The
 * result is still a spanning tree (every unblocked cell reached, no loops). 0 = the
 * original uniformly-random recursive-backtracker.
 */
export function carveMaze(
  cols: number,
  rows: number,
  rng: Rng,
  blocked: Set<string> = new Set(),
  straightBias = 0,
): number[][] {
  const open: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const k of blocked) {
    const [r, c] = k.split(",").map(Number) as [number, number];
    if (r >= 0 && r < rows && c >= 0 && c < cols) visited[r]![c] = true;
  }
  // Track the direction used to enter each cell so we can favour going straight.
  const stack: { r: number; c: number; inDir: Dir | null }[] = [{ r: 0, c: 0, inDir: null }];
  visited[0]![0] = true;

  while (stack.length) {
    const cur = stack[stack.length - 1]!;
    const opts = DIRS.filter((d) => {
      const nr = cur.r + d.dr, nc = cur.c + d.dc;
      return nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr]![nc];
    });
    if (opts.length === 0) { stack.pop(); continue; }

    // Prefer the straight-ahead direction (same as how we entered) with probability
    // `straightBias`; otherwise pick a uniformly-random unvisited neighbour.
    const straight = (straightBias > 0 && cur.inDir) ? opts.find((d) => d === cur.inDir) : undefined;
    const choice = straight && rng() < straightBias ? straight : shuffle([...opts], rng)[0]!;

    const nr = cur.r + choice.dr, nc = cur.c + choice.dc;
    open[cur.r]![cur.c]! |= choice.bit;
    open[nr]![nc]! |= choice.opp;
    visited[nr]![nc] = true;
    stack.push({ r: nr, c: nc, inDir: choice });
  }
  return open;
}
