// generator/src/games/maze/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generateMaze } from "./generate";
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
};
