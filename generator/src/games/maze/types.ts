export const N = 1, E = 2, S = 4, W = 8;

export interface Dir { bit: number; dr: number; dc: number; opp: number; }
export const DIRS: Dir[] = [
  { bit: N, dr: -1, dc: 0, opp: S },
  { bit: E, dr: 0, dc: 1, opp: W },
  { bit: S, dr: 1, dc: 0, opp: N },
  { bit: W, dr: 0, dc: -1, opp: E },
];

export interface Cell { r: number; c: number; }

export interface Maze {
  id: string;
  title: string;
  themeBlurb: string;
  gameType: "maze";
  gradeLabel: string;
  difficulty: string;
  cols: number;
  rows: number;
  /** open[r][c] = bitmask of open directions (N|E|S|W) from that cell. */
  open: number[][];
  start: Cell;
  end: Cell;
  /** Extra start icons clustered by the real start; sealed dead-ends. [] when none. */
  decoyStarts: Cell[];
  theme: { startIcon: string; endIcon: string };
  solution: Cell[];        // inclusive start→end path
  difficultyRating: number; // 1–5
  seed: number;
  createdAt: string;
}
