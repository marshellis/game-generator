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
  /** JSON output dir, relative to the generator/ root. */
  contentDir: string;
  /** Map an abstract grade → this game's own knobs. Only the game knows its knobs. */
  difficultyFor(grade: string): unknown;
  generate(opts: GenerateOpts): GeneratedItem;
  /** Optional measured difficulty, to verify difficultyFor lands in the grade's band. */
  score?(data: unknown): Load;
}
