import { makeRng } from "../../core/rng";
import { resolveDifficulty, type Difficulty } from "./difficulty";
import { loadThemePacks, pickTheme, sliceTheme } from "./themes";
import { generateSolution } from "./solution";
import { enumerateClues } from "./clues";
import { reduceClues } from "./reduce";
import { uniqueSolutionExists, isNoGuessSolvable } from "./solver";
import { TemplatePhraser, type Phraser } from "./phrasing";
import { slugify, makePuzzleId } from "./serialize";
import type { Puzzle } from "./types";

export interface GenerateOptions {
  difficulty: string;
  seed: number;
  date: string; // ISO date, e.g. "2026-06-04"
  overrides?: Partial<Difficulty>;
  gradeLabel?: string;
  phraser?: Phraser;
}

export function generatePuzzle(opts: GenerateOptions): Puzzle {
  const diff = resolveDifficulty(opts.difficulty, opts.overrides);
  const rng = makeRng(opts.seed);
  const needOrdered = diff.advanced.includes("comparative");

  const theme = sliceTheme(
    pickTheme(loadThemePacks(), diff.categories, diff.items, needOrdered),
    diff.categories,
    diff.items,
    needOrdered,
  );

  const C = diff.categories;
  const M = diff.items;
  const orderedCats = new Set<number>();
  const comparatives: Record<number, string> = {};
  theme.categories.forEach((c, i) => {
    if (c.ordered) orderedCats.add(i);
    if (c.comparative) comparatives[i] = c.comparative;
  });
  // The "people" category whose items are named directly in clues.
  let subjectCat = theme.categories.findIndex((c) => c.subject);
  if (subjectCat < 0) subjectCat = theme.categories.findIndex((c) => !c.ordered);
  if (subjectCat < 0) subjectCat = 0;

  const sol = generateSolution(C, M, rng);
  const all = enumerateClues(sol, { allowAdvanced: diff.advanced, orderedCats }, rng);
  const structured = reduceClues(C, M, all, { redundancy: diff.redundancy }, rng);

  // Safety: the reducer guarantees these, but assert to fail loud on regressions.
  if (!uniqueSolutionExists(C, M, structured) || !isNoGuessSolvable(C, M, structured)) {
    throw new Error("generated puzzle failed solvability validation");
  }

  const phraser = opts.phraser ?? new TemplatePhraser();
  const ctx = {
    categories: theme.categories,
    readingLevel: diff.readingLevel,
    themeBlurb: theme.blurb,
    subjectCat,
    comparatives,
  };
  const clues = structured.map((s, i) => ({
    id: `c${i + 1}`,
    structured: s,
    text: phraser.phrase(s, ctx),
  }));

  const slug = slugify(theme.title);
  return {
    id: makePuzzleId(opts.date, slug, opts.seed),
    title: theme.title,
    themeBlurb: theme.blurb,
    gameType: "logic-grid",
    gradeLabel: opts.gradeLabel ?? diff.readingLevel,
    difficulty: diff.id,
    // Strip authoring-only fields (subject/comparative); publish clean categories.
    categories: theme.categories.map((c) => ({ name: c.name, ordered: c.ordered, items: c.items })),
    solution: sol,
    clues,
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
