# Sudoku Game — Design Spec

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan
**Game:** Sudoku (game 4), the first game built on the catalog framework.

## Summary

Classic number-placement Sudoku, grade-banded: **4×4 (g1–2) → 6×6 (g3–4) → 9×9 (g5–8)**.
Each puzzle has a **unique solution reachable by logic alone (no guessing)**. Difficulty is
**technique-based**: a tiered logical solver decides the hardest technique a puzzle needs, and
the generator only removes givens while the puzzle stays solvable within the grade's allowed
techniques. Web play is **tap-cell + number-pad** with live conflict highlighting; plus the
standard printable + answer key. Plugs into the catalog framework as a new `module.ts` +
registry entry (no CLI changes).

## Goals
- Unique-solution, no-guess Sudoku at every grade.
- **Principled, measured difficulty**: hardest-technique tier + given count, calibrated to
  `docs/grade-appropriateness.md` via the shared grade bands; exposed through `score()` (`Load`).
- Touch-friendly web player; clean print + answer pages.
- Slots into the framework: one `module.ts`, one registry line, participates in `generate:all`.

## Non-Goals (v1)
- Pencil/candidate marks in the player (later upgrade).
- Advanced human techniques (X-wing, swordfish, coloring) — capped at pairs; too hard for kids.
- Picture/symbol mode for the youngest (numbers only in v1).
- Variant Sudokus (killer, diagonal, samurai).

## Architecture (`generator/src/games/sudoku/`)

```
types.ts        # Sudoku, Cell, technique tiers
solver.ts       # logical tiered solver + uniqueness checker
generate.ts     # full-grid build + hole-digging
difficulty.ts   # grade → { boxW, boxH, maxTier } presets
serialize.ts    # slug/id (or reuse pattern)
module.ts       # GameModule adapter (+ score)
```

### Data model
```ts
interface Sudoku {
  id: string;
  title: string;            // "Sudoku" (size shown in UI/list)
  gameType: "sudoku";
  gradeLabel: string;
  difficulty: string;       // "g1".."g8"
  size: number;             // 4, 6, or 9
  boxW: number;             // box width in cells (4→2, 6→3, 9→3)
  boxH: number;             // box height in cells (4→2, 6→2, 9→3)
  givens: number[][];       // size×size; 0 = blank, else the clue digit
  solution: number[][];     // size×size; the unique completed grid
  maxTier: number;          // hardest technique tier required (1..3)
  difficultyRating: number; // 1–5
  seed: number;
  createdAt: string;
}
```
Box geometry: 4×4 → 2×2 boxes; 6×6 → boxes 3 wide × 2 tall; 9×9 → 3×3. There are
`size/boxW` box-columns and `size/boxH` box-rows.

### Technique-tiered solver (`solver.ts`)
- `solveLogical(givens, boxW, boxH, maxTier)` → `{ solved: boolean, grid, hardestTier }`.
  Applies, in a loop until stuck, only techniques up to `maxTier`:
  - **T1 — naked singles** (a cell with one candidate).
  - **T2 — hidden singles** (a digit with one possible cell in a row/col/box).
  - **T3 — naked/hidden pairs** (two cells/digits locking candidates in a unit).
  Tracks the hardest tier actually used.
- `countSolutions(givens, boxW, boxH, limit=2)` → number, via backtracking (early-exit at 2)
  to guarantee **uniqueness** independent of the logical solver.
- `solvedValid(grid)` helper: every row/col/box is a permutation of 1..size.

### Generation (`generate.ts`)
1. Resolve grade preset (`boxW, boxH, maxTier`).
2. **Build a full solution** by seeded randomized backtracking fill.
3. **Dig holes:** shuffle cell order (seeded); for each, tentatively clear it (and, for a
   symmetric feel, optionally its 180° partner) and keep the removal only if
   `countSolutions == 1` AND `solveLogical(..., maxTier).solved`. Otherwise restore.
4. Result `givens` + `solution`; `maxTier` = hardest tier the final puzzle requires;
   `difficultyRating` from `maxTier` + blanks ratio.
5. Deterministic for a seed.

### Difficulty presets (`difficulty.ts`, calibrated to `grades.ts`)
| Grade | size (boxW×boxH) | maxTier |
|---|---|---|
| g1 | 4×4 (2×2) | 1 |
| g2 | 4×4 (2×2) | 1 |
| g3 | 6×6 (3×2) | 2 |
| g4 | 6×6 (3×2) | 2 |
| g5 | 9×9 (3×3) | 2 |
| g6 | 9×9 (3×3) | 2 |
| g7 | 9×9 (3×3) | 3 |
| g8 | 9×9 (3×3) | 3 |

### Module (`module.ts`)
`GameModule` with `id:"sudoku"`, `grades: GRADES`, `contentDir:"../site/src/content/sudokus"`,
`difficultyFor` → preset, `generate` → wraps `generateSudoku`, `score(data)` → `Load` derived
from `maxTier` (tier→score) + blank count. Registered in `registry.ts` (one line).

## Site
- `sudokus` content collection in `config.ts`.
- `Sudoku.astro` — SVG/HTML grid: size×size cells, **thick borders on box boundaries**, givens
  rendered bold/locked, blanks empty (interactive) or solution-filled (`showSolution`). Props:
  `interactive`, `showSolution`.
- `games/sudoku/player.ts` — tap a blank cell to select (highlight); a number pad (1..size) +
  erase below; tapping a number fills the selected non-given cell; **live conflict highlight**
  (cell turns red if its digit repeats in row/col/box). **Check** (grid full + matches solution
  → "🎉 Solved!"; else counts conflicts/blanks). **Reveal** toggle (fill solution, restore the
  player's entries on toggle-off; not persisted). **Clear**. Progress in `localStorage`
  (`sudoku:<id>`).
- Routes mirroring the others: `/sudoku` (grade picker), `/sudoku/grade/[grade]`, `/sudoku/[id]`
  (GameHeader: showCheck=true, revealNoun="solution"), `/sudoku/[id]/print`, `/sudoku/[id]/answer`.
  Home card.
- Pure helpers in `games/sudoku/grid.ts` (peers of a cell, conflict detection) unit-tested.

## Testing
- **solver:** solves hand-made 4×4 puzzles to a known solution; `countSolutions` returns 1 for
  a unique puzzle and ≥2 for an under-constrained grid; `hardestTier` reports the right tier on
  puzzles crafted to need exactly singles vs hidden-singles vs pairs.
- **generate:** unique solution (`countSolutions==1`); `givens` are a subset of `solution`;
  `solveLogical(givens, maxTier).solved` true; `solvedValid(solution)`; deterministic by seed;
  size/box geometry matches the grade preset; never produces a guess-required puzzle.
- **property:** across grades × seeds — valid + unique + solvable-within-tier + correct size.
- **site:** `grid.ts` conflict detection unit-tested (row/col/box peers).
- Existing generator + site suites stay green; `generate:all` includes Sudoku afterward.

## Reused scaffolding
- Framework `GameModule`/registry/catalog (Sudoku is the first net-new game on it),
  `core/rng`, `GameHeader`, print/answer route split, content-collection pattern, `Load` shape.

## Risks & mitigations
- **9×9 generation cost:** hole-digging re-runs the solver per removal. Keep tiers shallow
  (≤3), early-exit uniqueness at 2 solutions, and cap removal attempts; 9×9 with singles/pairs
  is fast. Property tests use a few seeds per grade to keep CI quick.
- **Solver correctness is load-bearing** (it guarantees no-guess): cover each tier with
  targeted unit tests plus the independent backtracking uniqueness check.
- **6×6 box geometry** (non-square boxes) is the easy place for an off-by-one: explicit
  `boxW`/`boxH` everywhere, asserted in tests.
```
