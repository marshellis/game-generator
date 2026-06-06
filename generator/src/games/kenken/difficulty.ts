// generator/src/games/kenken/difficulty.ts
import type { Op } from "./types";

export interface Difficulty {
  id: string;
  size: number;
  ops: Op[];        // arithmetic ops allowed (never includes "="; that's implicit for single cells)
  maxCageSize: number;
  readingLevel: string;
}

export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", size: 3, ops: ["+"], maxCageSize: 2, readingLevel: "grade 1" },
  g2: { id: "g2", size: 3, ops: ["+"], maxCageSize: 2, readingLevel: "grade 2" },
  g3: { id: "g3", size: 4, ops: ["+", "-"], maxCageSize: 3, readingLevel: "grade 3" },
  g4: { id: "g4", size: 4, ops: ["+", "-"], maxCageSize: 3, readingLevel: "grade 4" },
  g5: { id: "g5", size: 5, ops: ["+", "-", "*"], maxCageSize: 3, readingLevel: "grade 5" },
  g6: { id: "g6", size: 5, ops: ["+", "-", "*"], maxCageSize: 3, readingLevel: "grade 6" },
  g7: { id: "g7", size: 6, ops: ["+", "-", "*", "/"], maxCageSize: 4, readingLevel: "grade 7" },
  g8: { id: "g8", size: 6, ops: ["+", "-", "*", "/"], maxCageSize: 4, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown kenken difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
