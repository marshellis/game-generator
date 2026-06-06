// generator/src/games/word-search/difficulty.ts
import type { Pos } from "./types";

/** The eight directions a word can run, named. dr/dc step from start toward end. */
export const DIRS: Record<string, Pos> = {
  E: { r: 0, c: 1 },   // across →
  S: { r: 1, c: 0 },   // down ↓
  SE: { r: 1, c: 1 },  // diagonal ↘
  NE: { r: -1, c: 1 }, // diagonal ↗
  W: { r: 0, c: -1 },  // backwards ←
  N: { r: -1, c: 0 },  // upwards ↑
  NW: { r: -1, c: -1 },// diagonal ↖
  SW: { r: 1, c: -1 }, // diagonal ↙
};

export interface Difficulty {
  id: string;
  size: number;        // grid is size×size
  wordCount: number;   // how many words to hide
  dirs: string[];      // allowed direction keys (subset of DIRS)
  readingLevel: string;
}

// Grade ramp: little kids get small grids with only across/down; older kids get
// bigger grids, diagonals, then backwards/upward words too.
export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", size: 8,  wordCount: 6,  dirs: ["E", "S"],                          readingLevel: "grade 1" },
  g2: { id: "g2", size: 8,  wordCount: 7,  dirs: ["E", "S"],                          readingLevel: "grade 2" },
  g3: { id: "g3", size: 9,  wordCount: 8,  dirs: ["E", "S", "SE"],                    readingLevel: "grade 3" },
  g4: { id: "g4", size: 9,  wordCount: 8,  dirs: ["E", "S", "SE"],                    readingLevel: "grade 4" },
  g5: { id: "g5", size: 10, wordCount: 9,  dirs: ["E", "S", "SE", "NE"],              readingLevel: "grade 5" },
  g6: { id: "g6", size: 10, wordCount: 10, dirs: ["E", "S", "SE", "NE"],              readingLevel: "grade 6" },
  g7: { id: "g7", size: 11, wordCount: 10, dirs: ["E", "S", "SE", "NE", "W", "N"],    readingLevel: "grade 7" },
  g8: { id: "g8", size: 12, wordCount: 11, dirs: ["E", "S", "SE", "NE", "W", "N", "NW", "SW"], readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown word-search difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
