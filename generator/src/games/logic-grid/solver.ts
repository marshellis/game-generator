import { Board, Contradiction } from "./board";
import { applyClues } from "./apply";
import type { Solution, StructuredClue } from "./types";

/** True iff propagation alone fully determined the board (no open cells anywhere). */
function isComplete(b: Board): boolean {
  for (let a = 0; a < b.C; a++) {
    for (let bb = a + 1; bb < b.C; bb++) {
      for (let ai = 0; ai < b.M; ai++) {
        let hasYes = false;
        for (let bi = 0; bi < b.M; bi++) if (b.get(a, ai, bb, bi) === 1) hasYes = true;
        if (!hasYes) return false;
      }
    }
  }
  return true;
}

/** Pick the most-constrained open row (cat pair + ai) for branching; null if complete. */
function pickBranch(b: Board): { a: number; ai: number; bb: number; options: number[] } | null {
  let best: { a: number; ai: number; bb: number; options: number[] } | null = null;
  for (let a = 0; a < b.C; a++) {
    for (let bb = a + 1; bb < b.C; bb++) {
      for (let ai = 0; ai < b.M; ai++) {
        let hasYes = false;
        const options: number[] = [];
        for (let bi = 0; bi < b.M; bi++) {
          const v = b.get(a, ai, bb, bi);
          if (v === 1) hasYes = true;
          else if (v === 0) options.push(bi);
        }
        if (hasYes || options.length === 0) continue;
        if (best === null || options.length < best.options.length) {
          best = { a, ai, bb, options };
          if (options.length === 2) return best;
        }
      }
    }
  }
  return best;
}

/** Count solutions of an already-propagated, consistent board, up to `limit`. */
export function countSolutions(board: Board, limit: number): number {
  let work = board.clone();
  try {
    work.propagate();
  } catch (e) {
    if (e instanceof Contradiction) return 0;
    throw e;
  }
  const branch = pickBranch(work);
  if (branch === null) return isComplete(work) ? 1 : 0;
  let total = 0;
  for (const bi of branch.options) {
    const next = work.clone();
    try {
      next.set(branch.a, branch.ai, branch.bb, bi, 1);
      next.propagate();
    } catch (e) {
      if (e instanceof Contradiction) continue;
      throw e;
    }
    total += countSolutions(next, limit - total);
    if (total >= limit) return total;
  }
  return total;
}

function buildBoard(C: number, M: number, clues: StructuredClue[]): Board {
  const b = new Board(C, M);
  applyClues(b, clues);
  return b;
}

export function uniqueSolutionExists(C: number, M: number, clues: StructuredClue[]): boolean {
  const b = buildBoard(C, M, clues);
  try {
    b.propagate();
  } catch (e) {
    if (e instanceof Contradiction) return false;
    throw e;
  }
  return countSolutions(b, 2) === 1;
}

/** True iff pure propagation (no branching) fully solves the puzzle. */
export function isNoGuessSolvable(C: number, M: number, clues: StructuredClue[]): boolean {
  const b = buildBoard(C, M, clues);
  try {
    b.propagate();
  } catch (e) {
    if (e instanceof Contradiction) return false;
    throw e;
  }
  return isComplete(b);
}

/** Read a fully-determined board into a Solution (anchor-relative). */
export function extractSolution(b: Board): Solution {
  const sol: Solution = [];
  for (let c = 0; c < b.C; c++) sol.push(new Array(b.M).fill(-1));
  for (let e = 0; e < b.M; e++) sol[0]![e] = e;
  for (let c = 1; c < b.C; c++) {
    for (let e = 0; e < b.M; e++) {
      for (let i = 0; i < b.M; i++) {
        if (b.get(0, e, c, i) === 1) { sol[c]![e] = i; break; }
      }
    }
  }
  return sol;
}
