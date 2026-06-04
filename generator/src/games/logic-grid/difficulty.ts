export interface Difficulty {
  id: string;
  categories: number;
  items: number;
  advanced: ("eitherOr" | "comparative")[];
  redundancy: number;
  readingLevel: string;
}

export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", categories: 3, items: 3, advanced: [], redundancy: 2, readingLevel: "grade 1" },
  g2: { id: "g2", categories: 3, items: 3, advanced: [], redundancy: 1, readingLevel: "grade 2" },
  g3: { id: "g3", categories: 3, items: 4, advanced: [], redundancy: 1, readingLevel: "grade 3" },
  g4: { id: "g4", categories: 4, items: 4, advanced: ["eitherOr"], redundancy: 1, readingLevel: "grade 4" },
  g5: { id: "g5", categories: 4, items: 4, advanced: ["eitherOr", "comparative"], redundancy: 0, readingLevel: "grade 5" },
  g6: { id: "g6", categories: 4, items: 5, advanced: ["eitherOr", "comparative"], redundancy: 0, readingLevel: "grade 6" },
  g7: { id: "g7", categories: 5, items: 5, advanced: ["eitherOr", "comparative"], redundancy: 0, readingLevel: "grade 7" },
  g8: { id: "g8", categories: 5, items: 6, advanced: ["eitherOr", "comparative"], redundancy: 0, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
