export interface Difficulty {
  id: string;
  cols: number;
  rows: number;
  /** Fraction of dead-ends to open into loops (0 = perfect maze). Youngest only. */
  braid: number;
  /** Count of sealed decoy entrances clustered by the real start. Disjunction load — see grades.ts (tier 3 unlocks g3). */
  decoys: number;
  /** Max corridor length per decoy pocket. Scales look-ahead demand with reasoning tier. */
  decoyDepth: number;
  /** Minimum length of an off-solution dead-end branch; shorter stubs are sealed so wrong
   * turns aren't obvious at a glance. 0 disables pruning (youngest/braided grades). */
  minWrongPath: number;
  readingLevel: string;
}

// Size is the dominant lever (docs/grade-appropriateness.md). Braid only g1–g2.
// decoys/decoyDepth derived from src/grades.ts GRADE_BANDS: disjunction (tier 3) unlocks at g3,
// count climbs with workingMemory, depth climbs with maxReasoningTier.
// INVARIANT: braid and decoys are mutually exclusive per grade (braid>0 only g1–g2,
// decoys>0 only g3+). braid() is decoy-unaware and could puncture a sealed pocket, so do
// NOT set both >0 on the same preset without first making braid() skip reserved cells.
// minWrongPath only applies to perfect-maze grades (g3+); braided grades keep it 0 so
// pruneShortDeadEnds (which assumes loop-free dead-end branches) never runs on a loop.
export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", cols: 6,  rows: 6,  braid: 0.5, decoys: 0, decoyDepth: 0, minWrongPath: 0, readingLevel: "grade 1" },
  g2: { id: "g2", cols: 8,  rows: 8,  braid: 0.3, decoys: 0, decoyDepth: 0, minWrongPath: 0, readingLevel: "grade 2" },
  g3: { id: "g3", cols: 10, rows: 10, braid: 0,   decoys: 1, decoyDepth: 2, minWrongPath: 3, readingLevel: "grade 3" },
  g4: { id: "g4", cols: 12, rows: 12, braid: 0,   decoys: 1, decoyDepth: 2, minWrongPath: 3, readingLevel: "grade 4" },
  g5: { id: "g5", cols: 14, rows: 14, braid: 0,   decoys: 2, decoyDepth: 3, minWrongPath: 4, readingLevel: "grade 5" },
  g6: { id: "g6", cols: 16, rows: 16, braid: 0,   decoys: 3, decoyDepth: 3, minWrongPath: 4, readingLevel: "grade 6" },
  g7: { id: "g7", cols: 18, rows: 18, braid: 0,   decoys: 4, decoyDepth: 4, minWrongPath: 5, readingLevel: "grade 7" },
  g8: { id: "g8", cols: 20, rows: 20, braid: 0,   decoys: 5, decoyDepth: 5, minWrongPath: 6, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown maze difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
