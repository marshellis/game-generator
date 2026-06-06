// generator/src/games/word-search/types.ts
export interface Pos { r: number; c: number; }

export interface PlacedWord {
  word: string;             // uppercase A–Z, the word as it reads start → end
  start: Pos;
  end: Pos;
}

export interface WordSearch {
  id: string;
  title: string;
  gameType: "word-search";
  gradeLabel: string;
  difficulty: string;
  size: number;             // rows = cols = size
  theme: string;            // display name of the word bank, e.g. "Animals"
  grid: string[][];         // size×size, each cell one uppercase letter A–Z
  words: PlacedWord[];      // hidden words with their exact coordinates
  maxDirections: number;    // how many placement directions were allowed (difficulty proxy)
  difficultyRating: number; // 1–5
  seed: number;
  createdAt: string;
}
