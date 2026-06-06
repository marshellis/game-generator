# KenKen Game — Design Spec

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan
**Game:** KenKen (game 5), on the catalog framework.

## Summary

KenKen (math × logic): fill an **N×N Latin square** (each row/col holds 1..N once) divided
into **cages**, where each cage's cells must combine via its arithmetic operation to hit a
target. Grade-banded **3×3 (g1–2) → 4×4 (g3–4) → 5×5 (g5–6) → 6×6 (g7–8)** with operations
phasing in by grade (`+` → `+ −` → `+ − ×` → all four). Every puzzle has a **unique
solution** (guaranteed by backtracking); grids/ops are kept small so puzzles are reasonable
to deduce. Tap + number-pad web player with conflict highlighting; standard print + answer.
Plugs into the framework as a `module.ts` + one registry line (no CLI edits).

## Goals
- Unique-solution KenKen at every grade; reinforces arithmetic (bridges to the math game).
- Operations phased by grade; `−`/`÷` only on 2-cell cages; `÷` only when it divides evenly.
- Measured difficulty via `score()` (`Load`) from size + operation tier, calibrated to `grades.ts`.
- Tap player, clean print + answer; framework-native (one registry line).

## Non-Goals (v1)
- A formal no-guess logical solver (uniqueness only; small grids keep it deducible).
- Pencil marks; non-square or "no-op" KenKen variants; negative/fraction targets.

## Architecture (`generator/src/games/kenken/`)
```
types.ts        # KenKen, Cage, Cell
solver.ts       # countSolutions (Latin + cage constraints)
generate.ts     # latin square → cage partition → op/target assign → uniqueness re-roll
difficulty.ts   # grade → { size, ops, maxCageSize } presets
module.ts       # GameModule adapter (+ score)
```

### Data model
```ts
type Op = "+" | "-" | "*" | "/" | "=";   // "=" = single-cell given
interface Cell { r: number; c: number; }
interface Cage { cells: Cell[]; op: Op; target: number; }
interface KenKen {
  id: string;
  title: string;            // "KenKen"
  gameType: "kenken";
  gradeLabel: string;
  difficulty: string;       // "g1".."g8"
  size: number;             // 3..6
  cages: Cage[];            // partition of all size*size cells
  solution: number[][];     // size×size Latin square
  difficultyRating: number; // 1–5
  seed: number;
  createdAt: string;
}
```
Cage label in UI: `target` + op symbol (`+ − × ÷`); single-cell (`op:"="`) shows just `target`.
The label renders in the cage's **anchor cell** = the cell with smallest `r`, then smallest `c`.

### Solver (`solver.ts`)
- `cageOk(cage, valueAt)` — given a function returning each cell's value (or 0 if blank):
  - `=`: the single cell equals target.
  - `+`: sum of cells == target. `*`: product == target.
  - `-`: exactly 2 cells, `abs(a-b)` == target.
  - `/`: exactly 2 cells, `max/min` == target and `max % min == 0`.
  - For partial (some blanks) used during search: a feasibility check that can't already be
    violated (e.g., running sum ≤ target for `+`); full check only when all cells filled.
- `countSolutions(size, cages, limit=2)` — backtrack cell by cell (row-major) placing 1..N
  that (a) keep rows/cols Latin and (b) don't violate any fully-filled cage; count complete
  fills, early-exit at `limit`. Independent uniqueness guarantee.
- `latinValid(grid, size)` — every row and column is a permutation of 1..size.

### Generation (`generate.ts`)
1. Resolve preset `{ size, ops, maxCageSize }`.
2. **Latin square:** build a valid random N×N Latin square via seeded randomized backtracking.
3. **Partition into cages:** start with every cell ungrouped; repeatedly pick an ungrouped
   cell, grow a cage by randomly annexing orthogonally-adjacent ungrouped cells up to a random
   size in `1..maxCageSize` (seeded). Guarantees a full partition (leftover singletons allowed).
4. **Assign op + target** per cage from the solution values:
   - size 1 → `op:"="`, target = the value.
   - size 2 → choose from allowed ops; `-` → `abs(a-b)`; `/` → only if `max%min==0`, target
     `max/min`; `+` → sum; `*` → product. (If a chosen op is invalid for the values, fall
     back to `+`.)
   - size ≥ 3 → choose `+` or `*` (whichever are allowed), target = sum/product.
5. **Uniqueness:** if `countSolutions(size, cages, 2) !== 1`, re-roll the partition+assignment
   (new rng draws) up to a bounded number of attempts; keep the first unique one.
6. `difficultyRating` from size + highest op tier present + average cage size.
7. Deterministic for a seed. `id = ${date}-kenken-${difficulty}-${seed}`.

### Difficulty presets (`difficulty.ts`, calibrated to `grades.ts`)
| Grade | size | ops | maxCageSize |
|---|---|---|---|
| g1 | 3 | `+` | 2 |
| g2 | 3 | `+` | 2 |
| g3 | 4 | `+ −` | 3 |
| g4 | 4 | `+ −` | 3 |
| g5 | 5 | `+ − ×` | 3 |
| g6 | 5 | `+ − ×` | 3 |
| g7 | 6 | `+ − × ÷` | 4 |
| g8 | 6 | `+ − × ÷` | 4 |

### Module (`module.ts`)
`GameModule` `id:"kenken"`, `grades: GRADES`, `contentDir:"../site/src/content/kenkens"`,
`difficultyFor` → preset, `generate` → wraps `generateKenKen`, `score(data)` → `Load` from
size + op tier + cage stats. Appended to `registry.ts` (one line).

## Site
- `kenkens` content collection in `config.ts`.
- `KenKen.astro` — N×N grid. **Cage borders:** a cell edge is thick when the orthogonal
  neighbor across it belongs to a different cage (or the grid edge). Each cage's **anchor cell**
  shows a small `target+op` label (top-left). Givens for single-cell cages may be shown faint
  or left blank for the player to confirm — v1: leave all non-anchor cells blank and show only
  the cage label (player fills everything). Props `interactive`, `showSolution`.
- `games/kenken/grid.ts` — pure helpers: `cageBorders(size, cellToCage)` → per-cell
  thick-edge flags; `conflicts(grid, size)` → row/col duplicate keys. Unit-tested.
- `games/kenken/player.ts` — tap a cell to select, number pad 1..size + erase; live conflict
  highlight (row/col dupes). **Check**: grid full + Latin valid + every cage satisfies its
  target → "🎉 Solved!"; else report blanks / conflicts / "a cage doesn't add up". Reveal
  (show solution, restore on toggle), Clear, `localStorage` (`kenken:<id>`).
- Routes: `/kenken` (grade picker), `/kenken/grade/[grade]`, `/kenken/[id]` (GameHeader:
  showCheck, revealNoun="solution"), `/kenken/[id]/print`, `/kenken/[id]/answer`. Home card.

## Testing
- **solver:** `latinValid` accepts/rejects correctly; `cageOk` for each op (incl. `-`/`/` 2-cell
  rules); `countSolutions` returns 1 for a crafted unique puzzle and ≥2 for an under-constrained
  one.
- **generate:** unique solution (`countSolutions==1`); `latinValid(solution)`; cages partition
  all cells exactly once; every cage's op/target matches its solution values; ops within the
  grade's allowed set; `-`/`/` only on 2-cell cages; `/` targets divide evenly; deterministic by
  seed; size matches preset.
- **property:** across grades × seeds — unique + valid Latin + cage/target consistency + ops
  respected.
- **site:** `grid.ts` `cageBorders` (a 2-cage layout has thick edges exactly on the boundary)
  and `conflicts` unit-tested.
- Existing suites stay green; `generate:all` includes KenKen afterward.

## Reused scaffolding
Framework `GameModule`/registry/catalog, `core/rng`, `GameHeader`, print/answer route split,
content-collection pattern, `Load` shape, the Sudoku player/grid patterns (tap + pad +
conflict highlight) as a close template.

## Risks & mitigations
- **Uniqueness re-roll cost:** small grids (≤6) + bounded attempts converge fast; cap attempts
  and, as a fallback, shrink `maxCageSize` (more single-cell givens → easier to make unique).
  Property tests use a few seeds per grade for quick CI.
- **Cage partition leaving awkward shapes:** allow singleton leftovers; that only adds given
  cells, never breaks validity.
- **Op assignment picking an invalid op** (e.g., `/` not dividing): explicit fallback to `+`.
- **Cage-border rendering** is the visual foot-gun: derive borders purely from the
  cell→cage map and unit-test it.
```
