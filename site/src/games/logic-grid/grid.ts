export interface PuzzleData {
  id: string;
  title: string;
  themeBlurb: string;
  gameType: "logic-grid";
  gradeLabel: string;
  difficulty: string;
  categories: { name: string; ordered?: boolean; items: string[] }[];
  solution: number[][];
  clues: { id: string; text: string }[];
  seed: number;
  createdAt: string;
}

/** One row per anchor entity, mapping each category name to its solved item. */
export function answerKey(p: PuzzleData): Record<string, string>[] {
  const M = p.categories[0]!.items.length;
  const rows: Record<string, string>[] = [];
  for (let e = 0; e < M; e++) {
    const row: Record<string, string> = {};
    for (let c = 0; c < p.categories.length; c++) {
      const cat = p.categories[c]!;
      row[cat.name] = cat.items[p.solution[c]![e]!]!;
    }
    rows.push(row);
  }
  return rows;
}

/** Unordered category pairs that each get a sub-grid in the display. */
export function categoryPairs(p: PuzzleData): [number, number][] {
  const pairs: [number, number][] = [];
  for (let a = 0; a < p.categories.length; a++)
    for (let b = a + 1; b < p.categories.length; b++) pairs.push([a, b]);
  return pairs;
}
