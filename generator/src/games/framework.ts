// generator/src/games/framework.ts
/** Measured difficulty of a generated item (shared shape; math-packet already uses it). */
export interface Load { maxTier: number; steps: number; score: number; stars: number; }

export interface GenerateOpts { difficulty: string; seed: number; date: string; }
export interface GeneratedItem { id: string; data: unknown; }

/** The contract every game implements so the catalog can drive it uniformly. */
export interface GameModule {
  id: string;
  title: string;
  grades: string[];
  /** One emoji for cards and headers. */
  emoji: string;
  /** Learning skill id (site/src/lib/family/skills.ts) that finishing one of these practises. */
  skill: string;
  /** JSON output dir, relative to the generator/ root. */
  contentDir: string;
  /** Map an abstract grade → this game's own knobs. Only the game knows its knobs. */
  difficultyFor(grade: string): unknown;
  generate(opts: GenerateOpts): GeneratedItem;
  /**
   * Independently re-verify a generated item from its OUTPUT alone (solvable, unique, consistent) and
   * return problems; [] = good. Must not reuse the generator's own bookkeeping. `generateCatalog` refuses
   * to write an item that fails, and the conformance suite runs it over every game x grade x seed.
   */
  validate(data: unknown): string[];
  /** Optional measured difficulty, to verify difficultyFor lands in the grade's band. */
  score?(data: unknown): Load;
}
