// generator/src/games/sudoku/generate.ts
import { makeRng, shuffle, type Rng } from "../../core/rng";
import { resolveDifficulty } from "./difficulty";
import { cellCands, countSolutions, solveLogical } from "./solver";
import type { Cell, Sudoku } from "./types";

function buildFullGrid(size: number, boxW: number, boxH: number, rng: Rng): number[][] {
  const grid = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const bt = (): boolean => {
    let best: Cell | null = null, bestCands: number[] | null = null;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (grid[r]![c]! !== 0) continue;
      const cs = cellCands(grid, r, c, size, boxW, boxH);
      if (cs.length === 0) return false;
      if (!bestCands || cs.length < bestCands.length) { best = { r, c }; bestCands = cs; }
    }
    if (!best) return true;
    for (const d of shuffle(bestCands!.slice(), rng)) {
      grid[best.r]![best.c] = d;
      if (bt()) return true;
      grid[best.r]![best.c] = 0;
    }
    return false;
  };
  bt();
  return grid;
}

export interface GenerateSudokuOptions { difficulty: string; seed: number; date: string; }

export function generateSudoku(opts: GenerateSudokuOptions): Sudoku {
  const d = resolveDifficulty(opts.difficulty);
  const size = d.boxW * d.boxH;
  const rng = makeRng(opts.seed);
  const solution = buildFullGrid(size, d.boxW, d.boxH, rng);

  const givens = solution.map((r) => r.slice());
  const cells: Cell[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cells.push({ r, c });
  for (const { r, c } of shuffle(cells, rng)) {
    const saved = givens[r]![c]!;
    if (saved === 0) continue;
    givens[r]![c] = 0;
    const unique = countSolutions(givens, size, d.boxW, d.boxH, 2) === 1;
    const logical = solveLogical(givens, size, d.boxW, d.boxH, d.maxTier).solved;
    if (!unique || !logical) givens[r]![c] = saved; // restore: removal made it ambiguous or too hard
  }

  const res = solveLogical(givens, size, d.boxW, d.boxH, d.maxTier);
  const sizeBonus = size >= 9 ? 2 : size >= 6 ? 1 : 0;
  const difficultyRating = Math.min(5, Math.max(1, res.hardestTier + sizeBonus));

  return {
    id: `${opts.date}-sudoku-${d.id}-${opts.seed}`,
    title: "Sudoku",
    gameType: "sudoku",
    gradeLabel: d.readingLevel,
    difficulty: d.id,
    size, boxW: d.boxW, boxH: d.boxH,
    givens, solution,
    maxTier: res.hardestTier,
    difficultyRating,
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
