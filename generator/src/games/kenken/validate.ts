import { cageSatisfied, countSolutions, latinValid } from "./solver";
import type { KenKen } from "./types";

/** Re-verify a KenKen: Latin-square solution, cages partition the board and are satisfied, one solution. */
export function validateKenKen(data: unknown): string[] {
  const k = data as KenKen, p: string[] = [];
  if (!latinValid(k.solution, k.size)) p.push("solution is not a Latin square");
  const seen = new Set<string>();
  for (const cg of k.cages) for (const c of cg.cells) {
    const key = `${c.r},${c.c}`;
    if (seen.has(key)) p.push(`cell ${key} is in two cages`);
    seen.add(key);
    if (c.r < 0 || c.c < 0 || c.r >= k.size || c.c >= k.size) p.push(`cell ${key} is off the board`);
  }
  if (seen.size !== k.size * k.size) p.push("cages do not cover the board");
  for (const cg of k.cages) if (!cageSatisfied(cg, k.solution)) p.push(`cage ${JSON.stringify(cg)} is not satisfied by the solution`);
  if (!p.length && countSolutions(k.size, k.cages, 2) !== 1) p.push("puzzle does not have exactly one solution");
  return p;
}
