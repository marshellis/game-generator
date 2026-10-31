// generator/src/games/math-packet/module.ts
import { GRADES } from "../../grades";
import { GRADES as MATH_GRADES } from "./grades";
import { generatePacket } from "./generate";
import { validateMathPacket } from "./validate";
import type { GameModule, Load } from "../framework";
import type { Packet } from "./types";

export const mathPacketModule: GameModule = {
  id: "math-packet",
  title: "Math Worksheets",
  emoji: "➕",
  skill: "math.worksheet",
  grades: GRADES,
  contentDir: "../site/src/content/packets",
  difficultyFor: (grade) => MATH_GRADES[grade],
  validate: validateMathPacket,
  generate: ({ difficulty, seed, date }) => {
    const p = generatePacket({ difficulty, seed, date });
    return { id: p.id, data: p };
  },
  score: (data) => (data as Packet).load as Load,
};
