# Game Catalog Framework — Design Spec

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan
**Scope:** Sub-project 1 of 3 (framework first; then Sudoku, then KenKen as separate cycles).

## Summary

Introduce a shared contract every game implements so the whole catalog can be regenerated
with one command — "fire it off across all games." Two layers:

1. A game-agnostic **grade band table** (`grades.ts`) — the single source of truth for what
   each grade *means* in the abstract (derived from `docs/grade-appropriateness.md`).
2. A per-game **`GameModule`** that maps a grade band to its own concrete knobs
   (`difficultyFor`) and generates an item (`generate`). A **registry** lists every module; a
   **catalog orchestrator** + CLI (`generate:all`) runs across all of them.

Regeneration is **additive** and **re-runnable** (not bit-reproducible): each run appends new
items with fresh seeds; existing content (incl. hand-authored logic-grid flavor) is never
clobbered. Adding a new game = write its generator + a `module.ts` and register it; it then
participates in every catalog run automatically.

## Goals
- One command regenerates a fresh set across all games: `npm run generate:all -- --per-grade N`.
- A formal, shared answer to "how does a grade pick knobs for a given game": shared abstract
  bands + per-game translation.
- New games plug in by implementing one contract; nothing else changes.
- Additive + re-runnable: every run adds new valid items; no wipes, no clobbering.

## Non-Goals (this sub-project)
- Building Sudoku / KenKen (separate cycles; this framework is what they slot into).
- Bit-for-bit reproducibility (explicitly not wanted).
- Auto-search of knobs to hit a target score (future; the optional `score()` enables it later).
- Rewriting the existing games' internal difficulty logic — retrofit is thin adapters; their
  current presets stay (they're already calibrated).

## Architecture

### Layer 1 — shared grade bands (`generator/src/grades.ts`)
The abstract, game-agnostic meaning of each grade. Game knobs are NOT here.
```ts
export interface GradeBand {
  grade: string;                 // "g1".."g8"
  workingMemory: number;         // how many things in play at once (dominant lever, per research)
  maxReasoningTier: 1|2|3|4|5;   // assertion<negation<disjunction<transitive<conditional
  targetScore: [number, number]; // difficulty-score band an item should land in
  readingLevel: string;          // e.g. "grade 3"
}
export const GRADE_BANDS: Record<string, GradeBand>; // g1..g8
export const GRADES: string[];                        // ["g1".."g8"]
```
Calibrated to `docs/grade-appropriateness.md`. This is the file we edit when we "get more
sophisticated"; every game and the catalog read from it.

### Layer 2 — the per-game contract (`generator/src/games/framework.ts`)
```ts
/** Measured difficulty (reuses the math game's existing shape). */
export interface Load { maxTier: number; steps: number; score: number; stars: number; }

export interface GenerateOpts { difficulty: string; seed: number; date: string; }
export interface GeneratedItem { id: string; data: unknown; }

export interface GameModule {
  id: string;                              // "logic-grid" | "math-packet" | "maze" | ...
  title: string;
  grades: string[];                        // usually GRADES
  contentDir: string;                      // path relative to generator/ root
  /** Map an abstract grade band → this game's concrete knobs. Only the game knows its knobs. */
  difficultyFor(grade: string): unknown;   // returns the game's own preset/knobs object
  generate(opts: GenerateOpts): GeneratedItem;
  /** Optional: measured difficulty, so difficultyFor can be verified against the band. */
  score?(data: unknown): Load;
}
```
`difficultyFor` is where each game answers "given this grade, which knobs?" — it consults the
shared `GradeBand` and returns its own preset. For existing games this wraps their current
`difficulty.ts`; for new games it maps the band fields to knobs directly.

### Registry (`generator/src/registry.ts`)
```ts
export const REGISTRY: GameModule[]; // [logicGrid, mathPacket, maze, ...]
export function getModule(id: string): GameModule;
```
Each game exports its adapter from `generator/src/games/<game>/module.ts`.

### Catalog orchestrator (`generator/src/catalog.ts`)
```ts
export interface CatalogOpts { perGrade: number; date: string; seedBase: number; registry?: GameModule[]; }
export function deriveSeed(seedBase: number, gameId: string, grade: string, i: number): number;
export function generateCatalog(opts: CatalogOpts): { written: string[] };
```
For each module × grade × `i in 0..perGrade-1`: `seed = deriveSeed(...)`,
`item = module.generate({difficulty: grade, seed, date})`, write
`<contentDir>/<item.id>.json` (append; create dir if missing). Returns the list of files
written. `seedBase` defaults (in the CLI) to a clock-derived value so each run is new;
`--seed-base N` makes a single run controllable for debugging.

### CLI (`generator/src/cli.ts`, refactored)
- Single game (unchanged UX): `--game <id> --difficulty gN --seed S` → routes through the
  registry (`getModule(id).generate(...)`), DRY with the catalog path.
- New: `--all [--per-grade N] [--date YYYY-MM-DD] [--seed-base N]` → `generateCatalog`.
- `package.json` script: `"generate:all": "tsx src/cli.ts --all"`.

## Data flow (generate:all)
```
grades.ts (abstract bands)
        │ read by
        ▼
module.difficultyFor(grade) → game knobs ──▶ module.generate({grade,seed,date}) → {id,data}
        ▲                                                    │ append
   registry lists all modules                                ▼
generateCatalog loops modules × grades × perGrade   site/src/content/<dir>/<id>.json
```

## Retrofit of existing games (thin, low-churn)
Add `generator/src/games/<game>/module.ts` for each, wrapping existing functions. Do NOT
rewrite their internals (esp. math-packet — owned by a parallel workstream).
- **logic-grid:** `difficultyFor` returns existing `PRESETS[grade]`; `generate` wraps
  `generatePuzzle`; `contentDir = "../site/src/content/puzzles"`.
- **math-packet:** `difficultyFor` returns its existing preset; `generate` wraps
  `generatePacket`; `score` reuses its existing `Load`; `contentDir = "../site/src/content/packets"`.
- **maze:** `difficultyFor` returns `PRESETS[grade]`; `generate` wraps `generateMaze`;
  `contentDir = "../site/src/content/mazes"`.
`grades.ts` is introduced as the source of truth; existing per-game presets stay but are
understood to be calibrated against it. New games map from it directly.

## Testing
- `grades.ts`: bands g1–g8 exist; `workingMemory` and `maxReasoningTier` are non-decreasing
  by grade; `targetScore` low ≤ high.
- `framework.ts`/registry: `REGISTRY` contains all games; `getModule` resolves/throws;
  every module exposes id/grades/contentDir and a working `generate` returning a valid
  `{id, data}` for each of its grades.
- `deriveSeed`: deterministic for fixed inputs; varies by seedBase, game, grade, and index.
- `generateCatalog`: writing to a temp dir, produces `perGrade × grades` files per module,
  all with unique ids; additive (a second run with a different seedBase adds, never
  overwrites). Use dependency-injected `registry`/output root so the test doesn't touch the
  real site content.
- Existing generator + site suites stay green.

## Reused scaffolding
- `core/rng` for `deriveSeed`/generation; existing per-game `generate*` and `difficulty.ts`;
  the math game's `Load` shape (promoted to the shared `framework.ts`); content-collection
  dirs unchanged.

## Risks & mitigations
- **Parallel agent churn (math-packet):** keep the math adapter a pure wrapper; no internal
  edits. Pull/rebase before pushing.
- **CLI refactor regressions:** keep the existing `--game` flags working identically; cover
  with the existing CLI tests plus a new registry-dispatch test.
- **Seed collisions on same-day re-runs:** `deriveSeed` mixes `seedBase` (clock-derived) so
  repeated runs diverge; id = date+slug+seed keeps files unique.
```
