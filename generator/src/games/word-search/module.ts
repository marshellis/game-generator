// generator/src/games/word-search/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generateWordSearch } from "./generate";
import { validateWordSearch } from "./validate";
import type { GameModule, Load } from "../framework";
import type { WordSearch } from "./types";

export const wordSearchModule: GameModule = {
  id: "word-search",
  title: "Word Search",
  emoji: "🔎",
  skill: "language.wordsearch",
  grades: GRADES,
  contentDir: "../site/src/content/wordsearches",
  difficultyFor: (grade) => PRESETS[grade],
  validate: validateWordSearch,
  generate: ({ difficulty, seed, date }) => {
    const w = generateWordSearch({ difficulty, seed, date });
    return { id: w.id, data: w };
  },
  score: (data): Load => {
    const w = data as WordSearch;
    return { maxTier: w.maxDirections, steps: w.words.length, score: w.difficultyRating, stars: w.difficultyRating };
  },
};
