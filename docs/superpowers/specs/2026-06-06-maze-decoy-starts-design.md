# Maze Decoy Starts — Design Spec

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan
**Game:** Maze (extends `docs/superpowers/specs/2026-06-05-maze-game-design.md`)

## Summary

As mazes get harder, give them **multiple starting points clustered next to each other** —
but only **one is real**. The decoy starts are short, sealed-off dead-end pockets right
beside the true start; following one leads nowhere. The solver's added task is to figure
out **which entrance actually threads into the maze**. The number of decoys and how deep
each false corridor runs both scale by grade, derived from the shared grade-band table
(`generator/src/grades.ts`) rather than eyeballed.

This is a pure generator-side mechanic that flows through the existing game-catalog
framework — no new framework concepts, no module-contract changes.

## Why this is grade-appropriate (derived, not guessed)

Choosing the right entrance among several is a **disjunction** ("the start is *either* this
door *or* that one"). The shared `GRADE_BANDS` table defines `maxReasoningTier` as
`assertion(1) < negation(2) < disjunction(3) < transitive(4) < conditional(5)` and unlocks
**tier 3 (disjunction) at g3**. It also carries `workingMemory` ("how many things held at
once") — exactly "how many entrances to evaluate." So:

- **Decoys unlock at g3** (the grade disjunction unlocks). g1–g2 keep a single, obvious start
  ("needs visual scaffolds").
- **Decoy count climbs with `workingMemory`.**
- **Corridor depth climbs with `maxReasoningTier`** — a 1-cell stub is dismissed instantly;
  a deep corridor demands real look-ahead before committing.

| Grade | maxTier / WM (GRADE_BANDS) | `decoys` (total entrances) | `decoyDepth` |
|---|---|---|---|
| 1 | 2 / 3 | 0 (1) | 0 |
| 2 | 2 / 3 | 0 (1) | 0 |
| 3 | 3 / 4 | 1 (2) | 1 |
| 4 | 3 / 4 | 1 (2) | 1 |
| 5 | 4 / 4 | 2 (3) | 2 |
| 6 | 4 / 5 | 3 (4) | 2 |
| 7 | 5 / 5 | 4 (5) | 3 |
| 8 | 5 / 5 | 5 (6) | 4 |

`decoyDepth` = max cells a false corridor may extend before terminating (a budget, not a
guarantee — a pocket may be shorter if space is tight).

## The core constraint that shapes the design

Our mazes are **perfect mazes** — a spanning tree where *every* cell connects to every
other. A decoy that is just another cell of the same maze would still reach the goal, so it
would not be a real decoy. **For "only one real entrance" to hold, the decoy starts must be
sealed-off pockets — disconnected from the maze body that reaches `end`.**

Chosen approach (**A — sealed corner cluster**): carve the main maze over **grid minus the
decoy cells**, so the main maze is still a valid unique-solution perfect maze; then carve the
reserved decoy cells as **isolated dead-end pockets** clustered against the real start. The
real start is the one entrance wired into the main maze.

Rejected alternatives:
- **B — perimeter wall doors.** Cleaner visually but our maze has no explicit border-opening
  model (start is a *cell*, not a wall gap); larger renderer rework for no added value.
- **C — render-only fake icons.** Rejected: a kid tracing on paper would find the "decoy"
  reaches the goal too. The decoy must be structurally real and structurally dead.

## Data model

Add one optional field to the `Maze` type (`generator/src/games/maze/types.ts`) and the
content-collection Zod schema (`site/src/content/config.ts`):

```ts
decoyStarts: { r: number, c: number }[]   // default [] — existing content stays valid
```

`start` remains the single **real** start. `solution`, `end`, the solver, and the answer key
are unchanged — they all key off `start`. Old maze JSON without `decoyStarts` parses fine
(schema default `[]`).

## Difficulty knobs (maze-local, per the GameModule contract)

The framework's contract: shared `GRADE_BANDS` are abstract; **each game owns its knobs** via
`difficultyFor(grade)`. So the new knobs live in the maze `Difficulty` preset
(`generator/src/games/maze/difficulty.ts`), with values derived from the band table above:

```ts
export interface Difficulty {
  id: string;
  cols: number;
  rows: number;
  braid: number;
  decoys: number;      // NEW — count of sealed decoy entrances (table above)
  decoyDepth: number;  // NEW — max corridor length per decoy pocket
  readingLevel: string;
}
```

`PRESETS` g1–g8 gain `decoys`/`decoyDepth` per the table. The **maze module adapter
(`module.ts`) needs no change** — it passes `difficulty` straight through to `generateMaze`.

## Generation (extends `generateMaze`)

After the existing carve + start/end + braid steps, insert a decoy step. New pure helper
`placeDecoyStarts(open, rows, cols, start, solution, count, depth, rng)` in a new file
`generator/src/games/maze/decoys.ts`:

1. If `count === 0`, return `[]` and leave `open` untouched (g1–g2, g3 path: identical to
   today for count 0).
2. **Reserve** a cluster of `count` cells adjacent to / near the real `start`, none of which
   are on the `solution` path, preferring cells that hug the start corner so icons sit side
   by side. (Reservation is computed up front; see "Approach A" note on ordering below.)
3. **Seal** each reserved decoy cell from the main maze: close every wall between a decoy
   cell and a non-decoy cell (clear those bits symmetrically on both sides).
4. **Carve** the decoy cells into one or more short dead-end pockets *internal* to the
   reserved set, extending up to `decoyDepth` cells, so each decoy icon sits at the mouth of
   a small blind alley that does **not** reconnect to the main maze.
5. Return the list of decoy **entrance** cells (the mouths bearing icons).

**Ordering / safety (decided in the plan, asserted by tests):** the clean, provably-safe
construction is to **reserve the decoy cells before carving the main maze** — carve the main
perfect maze over `grid \ decoyCells` (a connected region as long as the cluster is a small
corner block), then carve the pockets separately. This guarantees the main maze stays a
single spanning tree with a unique `start→end` solution and the decoys are unreachable from
`end`. The implementation plan will choose between "reserve-before-carve" (preferred) and
"peel-after-carve"; the **invariants below are the contract** either way.

### Invariants (test contract)

For every generated maze across grades × seeds:
- `decoyStarts.length === preset.decoys`.
- Every decoy entrance is **distinct** from `start`, **not** on `solution`, and within grid
  bounds.
- Every decoy entrance is **unreachable from `end`** (BFS over open walls) — i.e. truly
  sealed; the only entrance that reaches `end` is the real `start`.
- The **main maze is unchanged in character**: still a connected spanning tree over the
  non-decoy cells with exactly one `start→end` path (uniqueness preserved for g3+).
- Decoy entrances are **clustered near the real start** (within a small Chebyshev radius —
  exact bound set in the plan).
- `decoys === 0` ⇒ `decoyStarts === []` and `open` byte-for-byte identical to pre-feature
  output for the same seed (g1–g2 regression guard).
- Wall openings remain symmetric everywhere.

## Difficulty rating + framework `score()`

- `ratingFor` gains a decoy contribution: more decoys and deeper pockets → higher 1–5 rating.
- Add the optional **`score(data)`** to the maze module (`module.ts`) — the framework's
  mechanism for verifying a generated item lands in the grade's `targetScore` band. It maps
  maze data → `{ maxTier, steps, score, stars }`: `maxTier` reflects the disjunction load
  (3 when decoys present, else lower), `steps` ≈ solution length, `score`/`stars` blend grid
  size + path length + decoy load. This is the "we're using the new system" hook and lets
  catalog review audit difficulty.

## Rendering (`site/src/components/Maze.astro`)

- Draw the start icon (`theme.startIcon`) on the **real start and on every `decoyStarts`
  cell** — visually identical (that is the point; nothing distinguishes the real one).
- The **answer key** (`/maze/[id]/answer`) is unchanged: it draws the single true `solution`
  from the real `start`. (It implicitly reveals the real entrance — correct for an answer
  key.)
- No new props; the component reads `decoyStarts` off the maze data (default `[]`).

## Interactive player (`site/src/games/maze/player.ts`)

- The set of **entry points** becomes `[start, ...decoyStarts]`. A trail may begin on any
  entrance icon.
- Movement rules are unchanged (adjacent + open wall, backtrack on second-to-last). A trail
  begun from a decoy simply **dead-ends** inside the sealed pocket — it can never reach
  `end`, exactly like on paper.
- Success is still "trail head reaches `end`" — only reachable from the real start.
- **Clear** resets the trail and lets the solver pick a different entrance. Reveal still draws
  the stored `solution` from the real start.
- `localStorage` trail persistence unchanged; if a stored trail's first cell is no longer a
  valid entrance (shouldn't happen), fall back to empty.

## Content regeneration

Regenerate the **g3–g8** starter mazes (single-game CLI or `generate:all`) so the live
catalog shows the feature. g1–g2 outputs are unaffected by design. Regeneration uses the
existing seed conventions; commit the regenerated JSON.

## Testing

- **`decoys.ts` unit tests (Vitest, property tests across grades × seeds):** every invariant
  in the test-contract list above. Especially: decoys unreachable from `end`; main maze
  remains a unique-solution spanning tree; `decoys === 0` is byte-identical to today.
- **`maze-difficulty.test.ts`:** presets carry `decoys`/`decoyDepth`; both non-decreasing by
  grade; g1–g2 are 0; g5 ≥ 2.
- **`maze-module.test.ts`:** `score()` present and returns a `Load`; generated items still
  valid; `difficultyFor` returns the new knobs.
- **Schema:** content-collection accepts mazes with and without `decoyStarts`.
- **Site helpers:** `grid.ts` entry-point handling (begin-from-any-entrance) unit-tested
  without the DOM.
- **Manual/browse QA:** a g6 maze renders multiple identical start icons; tracing a decoy
  dead-ends; tracing the real one wins; print + answer pages render; reveal shows the true
  path.

## Risks & mitigations

- **Disconnection bug** (sealing a decoy orphans part of the main maze): eliminated by
  reserve-before-carve (carve main maze over grid minus decoys); asserted by the
  "main maze fully reachable from start, unique solution" test.
- **No room for the cluster on small grids:** g1–g2 have 0 decoys; g3 (10×10) easily fits 1
  shallow pocket in the corner. Helper clamps `count`/`depth` to available corner space and a
  test covers the smallest decoy grade.
- **Decoy too obviously fake** (1-cell stub at the lowest decoy grades): acceptable — g3 is
  the gentle introduction; depth scales up so higher grades demand real look-ahead.
- **Player confusion** (which icon do I start from?): intended difficulty, not a bug; the
  themed blurb can hint ("only one path leads to the cheese") — copy tweak, not structural.
