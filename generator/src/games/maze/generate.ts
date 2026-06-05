import { makeRng } from "../../core/rng";
import { resolveDifficulty, type Difficulty } from "./difficulty";
import { loadThemes, pickTheme } from "./themes";
import { carveMaze } from "./carve";
import { farthestCell, solutionPath, braid } from "./solve";
import { slugify, makeMazeId } from "./serialize";
import { DIRS, type Maze } from "./types";

export interface GenerateMazeOptions {
  difficulty: string;
  seed: number;
  date: string;
  overrides?: Partial<Difficulty>;
  gradeLabel?: string;
}

function ratingFor(cols: number, rows: number, solLen: number, open: number[][]): number {
  let branches = 0;
  for (const row of open) for (const m of row) {
    if ([1, 2, 4, 8].filter((b) => m & b).length >= 3) branches++;
  }
  const score = cols * rows + solLen + branches;
  return Math.min(5, Math.max(1, Math.round(score / 120)));
}

export function generateMaze(opts: GenerateMazeOptions): Maze {
  const diff = resolveDifficulty(opts.difficulty, opts.overrides);
  const rng = makeRng(opts.seed);
  const theme = pickTheme(loadThemes(), rng);

  const open = carveMaze(diff.cols, diff.rows, rng);
  const start = { r: 0, c: 0 };
  const end = farthestCell(open, diff.rows, diff.cols, start);
  if (diff.braid > 0) braid(open, diff.rows, diff.cols, diff.braid, rng);
  const solution = solutionPath(open, diff.rows, diff.cols, start, end);

  return {
    id: makeMazeId(opts.date, slugify(theme.title), opts.seed),
    title: theme.title,
    themeBlurb: theme.blurb,
    gameType: "maze",
    gradeLabel: opts.gradeLabel ?? diff.readingLevel,
    difficulty: diff.id,
    cols: diff.cols,
    rows: diff.rows,
    open,
    start,
    end,
    theme: { startIcon: theme.startIcon, endIcon: theme.endIcon },
    solution,
    difficultyRating: ratingFor(diff.cols, diff.rows, solution.length, open),
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
