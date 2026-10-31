import { uniqueSolutionExists } from "./solver";
import type { Puzzle, StructuredClue } from "./types";

/** Re-verify a logic grid: clues give exactly one solution, the stored solution is a real assignment that satisfies every clue. */
export function validateLogicGrid(data: unknown): string[] {
  const pz = data as Puzzle, p: string[] = [];
  const C = pz.categories.length, M = pz.categories[0]?.items.length ?? 0;
  if (!pz.clues.length) p.push("no clues");
  for (const c of pz.clues) if (!c.text.trim()) p.push(`clue ${c.id} has no text`);
  if (!uniqueSolutionExists(C, M, pz.clues.map((c) => c.structured))) p.push("clues do not give exactly one solution");

  const sol = pz.solution;
  for (let c = 0; c < C; c++) if (new Set(sol[c]).size !== M || sol[c]!.some((i) => i < 0 || i >= M)) p.push(`category ${c} is not a permutation`);
  if (!p.length) {
    const ent = (r: { cat: number; item: number }) => sol[r.cat]!.indexOf(r.item);
    const holds = (k: StructuredClue): boolean => {
      switch (k.type) {
        case "is": return ent(k.a) === ent(k.b);
        case "isNot": return ent(k.a) !== ent(k.b);
        case "eitherOr": return (ent(k.a) === ent(k.options[0])) !== (ent(k.a) === ent(k.options[1]));
        case "comparative": return sol[k.orderedCat]![ent(k.greater)]! > sol[k.orderedCat]![ent(k.lesser)]!;
      }
    };
    for (const c of pz.clues) if (!holds(c.structured)) p.push(`clue ${c.id} is false in the stored solution`);
  }
  return p;
}
