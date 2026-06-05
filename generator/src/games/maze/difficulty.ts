export interface Difficulty {
  id: string;
  cols: number;
  rows: number;
  /** Fraction of dead-ends to open into loops (0 = perfect maze). Youngest only. */
  braid: number;
  readingLevel: string;
}

// Size is the dominant lever (docs/grade-appropriateness.md). Braid only g1–g2.
export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", cols: 6, rows: 6, braid: 0.5, readingLevel: "grade 1" },
  g2: { id: "g2", cols: 8, rows: 8, braid: 0.3, readingLevel: "grade 2" },
  g3: { id: "g3", cols: 10, rows: 10, braid: 0, readingLevel: "grade 3" },
  g4: { id: "g4", cols: 12, rows: 12, braid: 0, readingLevel: "grade 4" },
  g5: { id: "g5", cols: 14, rows: 14, braid: 0, readingLevel: "grade 5" },
  g6: { id: "g6", cols: 16, rows: 16, braid: 0, readingLevel: "grade 6" },
  g7: { id: "g7", cols: 18, rows: 18, braid: 0, readingLevel: "grade 7" },
  g8: { id: "g8", cols: 20, rows: 20, braid: 0, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown maze difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
