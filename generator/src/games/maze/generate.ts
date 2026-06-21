import { makeRng } from "../../core/rng";
import { resolveDifficulty, type Difficulty } from "./difficulty";
import { loadThemes, pickTheme } from "./themes";
import { carveMaze } from "./carve";
import { farthestCell, solutionPath, braid } from "./solve";
import { pruneShortDeadEnds } from "./prune";
import { planDecoys, carveDecoyPockets } from "./decoys";
import { slugify, makeMazeId } from "./serialize";
import { type Maze } from "./types";

export interface GenerateMazeOptions {
  difficulty: string;
  seed: number;
  date: string;
  overrides?: Partial<Difficulty>;
  gradeLabel?: string;
}

function ratingFor(
  cols: number,
  rows: number,
  solLen: number,
  open: number[][],
  decoyLoad: number,
): number {
  let branches = 0;
  for (const row of open) for (const m of row) {
    if ([1, 2, 4, 8].filter((b) => m & b).length >= 3) branches++;
  }
  const score = cols * rows + solLen + branches + decoyLoad;
  return Math.min(5, Math.max(1, Math.round(score / 120)));
}

export function generateMaze(opts: GenerateMazeOptions): Maze {
  const diff = resolveDifficulty(opts.difficulty, opts.overrides);
  const rng = makeRng(opts.seed);
  const theme = pickTheme(loadThemes(), rng);

  // Plan decoys first so the main maze is carved around the reserved cells.
  // planDecoys/carveDecoyPockets consume no RNG, so count-0 grades stay byte-identical.
  const { entrances, blocked } = planDecoys(diff.cols, diff.rows, diff.decoys, diff.decoyDepth);

  const open = carveMaze(diff.cols, diff.rows, rng, blocked, diff.straightBias);
  const start = { r: 0, c: 0 };
  const end = farthestCell(open, diff.rows, diff.cols, start);
  if (diff.braid > 0) braid(open, diff.rows, diff.cols, diff.braid, rng);
  const solution = solutionPath(open, diff.rows, diff.cols, start, end);

  // Seal short off-solution dead-ends so wrong turns aren't obvious at a glance.
  // Runs after the solution is fixed (protected) and before decoy pockets are carved
  // (decoy cells are still blocked/degree-0 here, so they're skipped either way).
  const protectedCells = new Set<string>([...blocked]);
  for (const cell of solution) protectedCells.add(`${cell.r},${cell.c}`);
  pruneShortDeadEnds(open, diff.rows, diff.cols, diff.minWrongPath, protectedCells);

  // Carve the sealed dead-end pockets last (main maze + solution already fixed).
  carveDecoyPockets(open, entrances, diff.decoyDepth, diff.rows);

  const decoyLoad = diff.decoys * (diff.decoyDepth + 1);

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
    decoyStarts: entrances,
    theme: { startIcon: theme.startIcon, endIcon: theme.endIcon },
    solution,
    difficultyRating: ratingFor(diff.cols, diff.rows, solution.length, open, decoyLoad),
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
