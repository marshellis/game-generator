import { DIRS, type Maze } from "./types";

/** Re-verify a maze: walls are symmetric, the stored path is walkable start->end, and end is reachable. */
export function validateMaze(data: unknown): string[] {
  const m = data as Maze, p: string[] = [];
  const inb = (r: number, c: number) => r >= 0 && c >= 0 && r < m.rows && c < m.cols;
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) for (const d of DIRS) {
    if (!(m.open[r]![c]! & d.bit)) continue;
    const nr = r + d.dr, nc = c + d.dc;
    if (!inb(nr, nc)) p.push(`opening leads off the board at ${r},${c}`);
    else if (!(m.open[nr]![nc]! & d.opp)) p.push(`one-way wall between ${r},${c} and ${nr},${nc}`);
  }
  const path = m.solution;
  if (!path.length || path[0]!.r !== m.start.r || path[0]!.c !== m.start.c) p.push("path does not begin at start");
  const last = path[path.length - 1]!;
  if (last.r !== m.end.r || last.c !== m.end.c) p.push("path does not end at end");
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const d = DIRS.find((x) => a.r + x.dr === b.r && a.c + x.dc === b.c);
    if (!d || !(m.open[a.r]![a.c]! & d.bit)) p.push(`path steps through a wall at step ${i}`);
  }
  return p;
}
