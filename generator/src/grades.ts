/**
 * Game-agnostic meaning of each grade, derived from docs/grade-appropriateness.md.
 * Game KNOBS do not live here — each game's difficultyFor() maps these abstract
 * dials to its own knobs. This is the file we edit as difficulty understanding improves.
 */
export interface GradeBand {
  grade: string;                 // "g1".."g8"
  workingMemory: number;         // how many things in play at once (dominant lever)
  maxReasoningTier: 1 | 2 | 3 | 4 | 5; // assertion<negation<disjunction<transitive<conditional
  targetScore: [number, number]; // difficulty-score band an item should land in
  readingLevel: string;
}

export const GRADES: string[] = ["g1","g2","g3","g4","g5","g6","g7","g8"];

export const GRADE_BANDS: Record<string, GradeBand> = {
  g1: { grade: "g1", workingMemory: 3, maxReasoningTier: 2, targetScore: [1, 2], readingLevel: "grade 1" },
  g2: { grade: "g2", workingMemory: 3, maxReasoningTier: 2, targetScore: [1, 2], readingLevel: "grade 2" },
  g3: { grade: "g3", workingMemory: 4, maxReasoningTier: 3, targetScore: [2, 3], readingLevel: "grade 3" },
  g4: { grade: "g4", workingMemory: 4, maxReasoningTier: 3, targetScore: [2, 3], readingLevel: "grade 4" },
  g5: { grade: "g5", workingMemory: 4, maxReasoningTier: 4, targetScore: [3, 4], readingLevel: "grade 5" },
  g6: { grade: "g6", workingMemory: 5, maxReasoningTier: 4, targetScore: [3, 4], readingLevel: "grade 6" },
  g7: { grade: "g7", workingMemory: 5, maxReasoningTier: 5, targetScore: [4, 5], readingLevel: "grade 7" },
  g8: { grade: "g8", workingMemory: 5, maxReasoningTier: 5, targetScore: [4, 5], readingLevel: "grade 8" },
};

export function resolveBand(grade: string): GradeBand {
  const b = GRADE_BANDS[grade];
  if (!b) throw new Error(`unknown grade: ${grade}`);
  return b;
}
