// generator/src/games/kenken/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generateKenKen } from "./generate";
import type { GameModule, Load } from "../framework";
import type { KenKen, Op } from "./types";

const OP_TIER: Record<Op, number> = { "=": 0, "+": 1, "-": 2, "*": 3, "/": 4 };

export const kenkenModule: GameModule = {
  id: "kenken",
  title: "KenKen",
  grades: GRADES,
  contentDir: "../site/src/content/kenkens",
  difficultyFor: (grade) => PRESETS[grade],
  generate: ({ difficulty, seed, date }) => {
    const k = generateKenKen({ difficulty, seed, date });
    return { id: k.id, data: k };
  },
  score: (data): Load => {
    const k = data as KenKen;
    const maxTier = Math.max(...k.cages.map((cg) => OP_TIER[cg.op]));
    return { maxTier, steps: k.cages.length, score: k.difficultyRating, stars: k.difficultyRating };
  },
};
