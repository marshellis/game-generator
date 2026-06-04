import { shuffle, type Rng } from "../../core/rng";
import type { StructuredClue } from "./types";
import { uniqueSolutionExists, isNoGuessSolvable } from "./solver";

export interface ReduceOptions {
  /** number of removed clues to add back for easier puzzles (0 = minimal/hardest) */
  redundancy: number;
}

/** Order clues so direct facts are tried for removal first → advanced clues are retained. */
function removalOrder(clues: StructuredClue[], rng: Rng): StructuredClue[] {
  const rank = (c: StructuredClue) => (c.type === "is" || c.type === "isNot" ? 0 : 1);
  return shuffle([...clues], rng).sort((a, b) => rank(a) - rank(b));
}

export function reduceClues(
  C: number,
  M: number,
  all: StructuredClue[],
  opts: ReduceOptions,
  rng: Rng,
): StructuredClue[] {
  let kept = [...all];
  const removed: StructuredClue[] = [];
  for (const clue of removalOrder(all, rng)) {
    const trial = kept.filter((c) => c !== clue);
    if (uniqueSolutionExists(C, M, trial) && isNoGuessSolvable(C, M, trial)) {
      kept = trial;
      removed.push(clue);
    }
  }
  if (opts.redundancy > 0 && removed.length > 0) {
    // Add back direct positive ("is") clues first — those are the easy givens
    // that make a puzzle approachable, rather than more negatives to chase.
    const directs = shuffle(removed.filter((c) => c.type === "is"), rng);
    const rest = shuffle(removed.filter((c) => c.type !== "is"), rng);
    kept.push(...[...directs, ...rest].slice(0, opts.redundancy));
  }
  return kept;
}
