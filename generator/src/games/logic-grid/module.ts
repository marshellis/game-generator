// generator/src/games/logic-grid/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generatePuzzle } from "./generate";
import type { GameModule } from "../framework";

export const logicGridModule: GameModule = {
  id: "logic-grid",
  title: "Logic Grid",
  grades: GRADES,
  contentDir: "../site/src/content/puzzles",
  difficultyFor: (grade) => PRESETS[grade],
  generate: ({ difficulty, seed, date }) => {
    const p = generatePuzzle({ difficulty, seed, date });
    return { id: p.id, data: p };
  },
};
