import { countSolutions, solvedValid } from "./solver";
import type { Sudoku } from "./types";

/** Re-verify a generated Sudoku from its output alone: valid solution, honest givens, exactly one solution. */
export function validateSudoku(data: unknown): string[] {
  const s = data as Sudoku, p: string[] = [];
  if (!solvedValid(s.solution, s.size, s.boxW, s.boxH)) p.push("solution is not a valid grid");
  for (let r = 0; r < s.size; r++) for (let c = 0; c < s.size; c++) {
    const g = s.givens[r]![c]!;
    if (g !== 0 && g !== s.solution[r]![c]) p.push(`given at ${r},${c} disagrees with the solution`);
  }
  if (!p.length && countSolutions(s.givens, s.size, s.boxW, s.boxH, 2) !== 1) p.push("puzzle does not have exactly one solution");
  return p;
}
