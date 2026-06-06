// generator/src/games/kenken/types.ts
export type Op = "+" | "-" | "*" | "/" | "=";
export interface Cell { r: number; c: number; }
export interface Cage { cells: Cell[]; op: Op; target: number; }

export interface KenKen {
  id: string;
  title: string;
  gameType: "kenken";
  gradeLabel: string;
  difficulty: string;
  size: number;             // 3..6
  cages: Cage[];            // partition of all size*size cells
  solution: number[][];     // size×size Latin square
  difficultyRating: number; // 1–5
  seed: number;
  createdAt: string;
}
