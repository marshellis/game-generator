// generator/src/games/maze/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generateMaze } from "./generate";
import type { Maze } from "./types";
import type { GameModule } from "../framework";

export const mazeModule: GameModule = {
  id: "maze",
  title: "Mazes",
  grades: GRADES,
  contentDir: "../site/src/content/mazes",
  difficultyFor: (grade) => PRESETS[grade],
  generate: ({ difficulty, seed, date }) => {
    const m = generateMaze({ difficulty, seed, date });
    return { id: m.id, data: m };
  },
  // Measured difficulty so catalog review can check the grade band.
  // Picking the right entrance among several is a disjunction (tier 3).
  score: (data) => {
    const m = data as Maze;
    const maxTier = m.decoyStarts.length > 0 ? 3 : 2;
    return { maxTier, steps: m.solution.length, score: m.difficultyRating, stars: m.difficultyRating };
  },
};
