/** A category of things, e.g. {name:"Kid", items:["Ann","Ben","Cal"]}. */
export interface Category {
  name: string;
  /** Ordered categories (ages, positions) enable comparative clues. items[] is in rank order, index = rank. */
  ordered?: boolean;
  items: string[];
}

/** Points at a specific item within a specific category, by index. */
export interface Ref {
  cat: number;
  item: number;
}

export type StructuredClue =
  | { type: "is"; a: Ref; b: Ref }
  | { type: "isNot"; a: Ref; b: Ref }
  /** Entity of `a` matches exactly one of `options` (both options share one category != a.cat). */
  | { type: "eitherOr"; a: Ref; options: [Ref, Ref] }
  /** Entity of `greater` has a strictly higher rank in `orderedCat` than entity of `lesser`. */
  | { type: "comparative"; greater: Ref; lesser: Ref; orderedCat: number };

/**
 * Solution[c][e] = item index in category c assigned to entity e.
 * Entities are indexed by the anchor category (category 0); Solution[0][e] === e.
 */
export type Solution = number[][];

export interface Clue {
  id: string;
  structured: StructuredClue;
  text: string;
}

export interface Puzzle {
  id: string;
  title: string;
  themeBlurb: string;
  gameType: "logic-grid";
  gradeLabel: string;
  difficulty: string;
  categories: Category[];
  solution: Solution;
  clues: Clue[];
  seed: number;
  createdAt: string;
}
