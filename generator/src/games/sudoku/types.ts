// generator/src/games/sudoku/types.ts
export interface Cell { r: number; c: number; }

export interface Sudoku {
  id: string;
  title: string;
  gameType: "sudoku";
  gradeLabel: string;
  difficulty: string;
  size: number;             // 4 | 6 | 9
  boxW: number;             // box width in cells
  boxH: number;             // box height in cells
  givens: number[][];       // size×size, 0 = blank
  solution: number[][];     // size×size completed grid
  maxTier: number;          // hardest technique tier required (1..3)
  difficultyRating: number; // 1–5
  seed: number;
  createdAt: string;
}
