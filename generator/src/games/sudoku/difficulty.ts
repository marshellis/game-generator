// generator/src/games/sudoku/difficulty.ts
export interface Difficulty {
  id: string;
  boxW: number;
  boxH: number;
  maxTier: number; // 1 naked single, 2 +hidden single, 3 +naked pairs
  /** Floor on clues kept: hole-digging stops here so there are always several obvious
   *  moves (kid-gentle). Higher = easier. */
  minGivens: number;
  readingLevel: string;
}

// Gentle curve: lower grades stay naked-singles-only (always an obvious next move) AND keep
// plenty of givens; hidden singles only enter at g7+. Size is the headline lever (4→6→9),
// then givens thin out and technique deepens. Tuned after a g5 felt too sparse/hard.
export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", boxW: 2, boxH: 2, maxTier: 1, minGivens: 8, readingLevel: "grade 1" },
  g2: { id: "g2", boxW: 2, boxH: 2, maxTier: 1, minGivens: 7, readingLevel: "grade 2" },
  g3: { id: "g3", boxW: 3, boxH: 2, maxTier: 1, minGivens: 18, readingLevel: "grade 3" },
  g4: { id: "g4", boxW: 3, boxH: 2, maxTier: 1, minGivens: 15, readingLevel: "grade 4" },
  g5: { id: "g5", boxW: 3, boxH: 3, maxTier: 1, minGivens: 40, readingLevel: "grade 5" },
  g6: { id: "g6", boxW: 3, boxH: 3, maxTier: 1, minGivens: 34, readingLevel: "grade 6" },
  g7: { id: "g7", boxW: 3, boxH: 3, maxTier: 2, minGivens: 32, readingLevel: "grade 7" },
  g8: { id: "g8", boxW: 3, boxH: 3, maxTier: 2, minGivens: 30, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown sudoku difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
