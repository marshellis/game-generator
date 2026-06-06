// generator/src/games/sudoku/difficulty.ts
export interface Difficulty {
  id: string;
  boxW: number;
  boxH: number;
  maxTier: number; // 1 naked single, 2 +hidden single, 3 +naked pairs
  readingLevel: string;
}

export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", boxW: 2, boxH: 2, maxTier: 1, readingLevel: "grade 1" },
  g2: { id: "g2", boxW: 2, boxH: 2, maxTier: 1, readingLevel: "grade 2" },
  g3: { id: "g3", boxW: 3, boxH: 2, maxTier: 2, readingLevel: "grade 3" },
  g4: { id: "g4", boxW: 3, boxH: 2, maxTier: 2, readingLevel: "grade 4" },
  g5: { id: "g5", boxW: 3, boxH: 3, maxTier: 2, readingLevel: "grade 5" },
  g6: { id: "g6", boxW: 3, boxH: 3, maxTier: 2, readingLevel: "grade 6" },
  g7: { id: "g7", boxW: 3, boxH: 3, maxTier: 3, readingLevel: "grade 7" },
  g8: { id: "g8", boxW: 3, boxH: 3, maxTier: 3, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown sudoku difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
