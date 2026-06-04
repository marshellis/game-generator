import { shuffle, type Rng } from "../../core/rng";
import type { Ref, Solution, StructuredClue } from "./types";

/** Which entity does this ref belong to under the solution? (find e where sol[cat][e] === item) */
export function entityOf(sol: Solution, ref: Ref): number {
  const row = sol[ref.cat]!;
  for (let e = 0; e < row.length; e++) if (row[e] === ref.item) return e;
  throw new Error("ref not found in solution");
}

export function clueIsTrue(sol: Solution, clue: StructuredClue): boolean {
  switch (clue.type) {
    case "is":
      return entityOf(sol, clue.a) === entityOf(sol, clue.b);
    case "isNot":
      return entityOf(sol, clue.a) !== entityOf(sol, clue.b);
    case "eitherOr": {
      const e = entityOf(sol, clue.a);
      return clue.options.some((o) => entityOf(sol, o) === e);
    }
    case "comparative": {
      const O = clue.orderedCat;
      const rank = (ref: Ref) => sol[O]![entityOf(sol, ref)]!;
      return rank(clue.greater) > rank(clue.lesser);
    }
  }
}

export interface EnumerateOptions {
  allowAdvanced: ("eitherOr" | "comparative")[];
  orderedCats: Set<number>;
  /** how many advanced clues of each allowed type to sample (default 40) */
  advancedSample?: number;
}

export function enumerateClues(sol: Solution, opts: EnumerateOptions, rng: Rng): StructuredClue[] {
  const C = sol.length;
  const M = sol[0]!.length;
  const out: StructuredClue[] = [];

  for (let a = 0; a < C; a++) {
    for (let b = a + 1; b < C; b++) {
      for (let ai = 0; ai < M; ai++) {
        for (let bi = 0; bi < M; bi++) {
          const aRef: Ref = { cat: a, item: ai };
          const bRef: Ref = { cat: b, item: bi };
          const same = entityOf(sol, aRef) === entityOf(sol, bRef);
          out.push(same
            ? { type: "is", a: aRef, b: bRef }
            : { type: "isNot", a: aRef, b: bRef });
        }
      }
    }
  }

  const sample = opts.advancedSample ?? 40;

  if (opts.allowAdvanced.includes("eitherOr")) {
    const pool: StructuredClue[] = [];
    for (let a = 0; a < C; a++) {
      for (let b = 0; b < C; b++) {
        if (a === b) continue;
        for (let ai = 0; ai < M; ai++) {
          const trueItem = sol[b]![entityOf(sol, { cat: a, item: ai })]!;
          for (let k = 0; k < M; k++) {
            if (k === trueItem) continue;
            pool.push({ type: "eitherOr", a: { cat: a, item: ai }, options: [{ cat: b, item: trueItem }, { cat: b, item: k }] });
          }
        }
      }
    }
    out.push(...shuffle(pool, rng).slice(0, sample));
  }

  if (opts.allowAdvanced.includes("comparative")) {
    const pool: StructuredClue[] = [];
    for (const O of opts.orderedCats) {
      for (let a = 0; a < C; a++) {
        for (let b = 0; b < C; b++) {
          if (a === O || b === O) continue;
          for (let ai = 0; ai < M; ai++) {
            for (let bi = 0; bi < M; bi++) {
              const g: Ref = { cat: a, item: ai };
              const l: Ref = { cat: b, item: bi };
              if (entityOf(sol, g) === entityOf(sol, l)) continue;
              const clue: StructuredClue = { type: "comparative", greater: g, lesser: l, orderedCat: O };
              if (clueIsTrue(sol, clue)) pool.push(clue);
            }
          }
        }
      }
    }
    out.push(...shuffle(pool, rng).slice(0, sample));
  }

  return out;
}
