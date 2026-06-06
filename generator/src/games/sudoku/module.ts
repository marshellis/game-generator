// generator/src/games/sudoku/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generateSudoku } from "./generate";
import type { GameModule, Load } from "../framework";
import type { Sudoku } from "./types";

export const sudokuModule: GameModule = {
  id: "sudoku",
  title: "Sudoku",
  grades: GRADES,
  contentDir: "../site/src/content/sudokus",
  difficultyFor: (grade) => PRESETS[grade],
  generate: ({ difficulty, seed, date }) => {
    const s = generateSudoku({ difficulty, seed, date });
    return { id: s.id, data: s };
  },
  score: (data): Load => {
    const s = data as Sudoku;
    const blanks = s.givens.flat().filter((v) => v === 0).length;
    return { maxTier: s.maxTier, steps: blanks, score: s.difficultyRating, stars: s.difficultyRating };
  },
};
