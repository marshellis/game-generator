# Maze Game — Design Spec

**Date:** 2026-06-05
**Status:** Approved (design), pending implementation plan
**Game:** Maze (game 3 on the Marshellis Games platform)

## Summary

Add **themed get-X-to-Y mazes** as the third game. Each maze is a small story —
"help the mouse reach the cheese" — that a kid solves by **dragging a finger/mouse to
trace a path** through the corridors on the web, or prints as a worksheet (with a
separate solution page). Mazes are auto-generated with a guaranteed **unique solution**,
grade-banded 1–8, and built on the existing per-game scaffolding.

## Goals

- A fun, **touch-first** web maze (drag to trace the path) plus a clean printable.
- **Unique solution** per maze for grades 3+ (clean answer key, satisfying dead-ends).
  Grades 1–2 may braid for gentleness; they still ship a valid shortest-path solution.
- **Grade-banded difficulty 1–8**, calibrated to `docs/grade-appropriateness.md` (size is
  the dominant lever; spatial planning improves with age).
- Reuse the shared scaffolding (`GameHeader`, print/answer route split, content
  collections, per-game generator module, `core/rng`).
- Serves the **youngest grades** with visual, low-reading fun the other two games don't.

## Non-Goals (v1)

- Collectibles / multi-waypoint mazes (breaks the single-clean-path guarantee — later upgrade).
- Non-rectangular mazes (hex/circular).
- Timed/scored modes, accounts, multiplayer.

## Architecture

Follows the established pattern (one module per game):

```
generator/src/games/maze/
  types.ts        # Maze, Cell, Theme types
  generate.ts     # generateMaze() pipeline
  difficulty.ts   # grade presets (size + braiding)
  themes.ts       # themed get-X-to-Y packs + themes/*.json
  themes/*.json
  serialize.ts    # id/slug
  (reuses ../../core/rng)
site/
  src/content/config.ts          # + "mazes" collection (Zod schema)
  src/components/Maze.astro       # SVG render (walls + start/end icons)
  src/games/maze/grid.ts          # pure helpers (adjacency, path validation, cellAt)
  src/games/maze/player.ts        # drag-trace client island
  src/pages/maze/index.astro              # grade picker
  src/pages/maze/grade/[grade].astro      # puzzle list
  src/pages/maze/[id].astro               # play (uses GameHeader)
  src/pages/maze/[id]/print.astro         # blank maze
  src/pages/maze/[id]/answer.astro        # maze with solution path
  src/pages/index.astro          # + Mazes game card
```

`cli.ts` gains `--game maze`.

## Data model

One JSON file per maze (validated by an Astro content-collection Zod schema):

```ts
{
  id: string,             // e.g. "2026-06-05-mouse-and-the-cheese-3"
  title: string,          // themed, e.g. "The Mouse and the Cheese"
  themeBlurb: string,     // "Help the mouse find the cheese!"
  gameType: "maze",
  gradeLabel: string,     // "grade 3"
  difficulty: string,     // preset id "g3"
  cols: number,
  rows: number,
  // open[r][c] = bitmask of open directions from that cell: N=1,E=2,S=4,W=8
  open: number[][],
  start: { r: number, c: number },
  end: { r: number, c: number },
  theme: { startIcon: string, endIcon: string },  // emoji
  solution: { r: number, c: number }[],           // unique start→end path, inclusive
  difficultyRating: number,                        // computed score (cells, path len, branches)
  seed: number,
  createdAt: string,
}
```

Open-direction bitmasks are symmetric (if cell A opens E into B, B opens W into A) — the
generator guarantees this; a test asserts it.

## Generation pipeline (`generateMaze`)

1. Resolve difficulty preset (cols, rows, braid factor) from grade + overrides.
2. Pick a theme (seeded, like logic-grid `pickTheme`).
3. **Carve a perfect maze** with a randomized depth-first search (recursive backtracker)
   over the seeded RNG: start at a cell, repeatedly move to a random unvisited neighbor
   knocking down the wall between, backtrack when stuck. Result: a spanning tree — exactly
   one path between any two cells.
4. **Place start/end:** start at a fixed corner; end at the cell **farthest** from start
   (BFS) so the solution is a satisfying length (or a fixed opposite corner — farthest is
   preferred for a better path).
5. **Optional braiding (g1–g2 only):** remove a small % of dead-end walls to add loops,
   making it gentler. NOTE: braiding can create multiple paths; for braided grades the
   `solution` is the BFS shortest path (still a valid, checkable answer) and uniqueness is
   relaxed by design for those grades only. Grades 3+ stay perfect (unique).
6. **Compute `solution`** as the path start→end (tree path for perfect mazes; BFS shortest
   for braided).
7. **difficultyRating** = a simple function of cell count + solution length + branch-point
   count, for sorting/labeling.
8. Serialize → JSON into `site/src/content/mazes/`.

## Difficulty bands (calibrated to `docs/grade-appropriateness.md`)

Size is the dominant lever; grow it monotonically. Braiding only for the youngest.

| Grade | cols × rows | Braiding | Notes |
|---|---|---|---|
| 1 | 6 × 6 | light | short, few dead-ends |
| 2 | 8 × 8 | light | |
| 3 | 10 × 10 | none (perfect) | |
| 4 | 12 × 12 | none | |
| 5 | 14 × 14 | none | |
| 6 | 16 × 16 | none | |
| 7 | 18 × 18 | none | |
| 8 | 20 × 20 | none | longest, most dead-ends |

Every knob overridable on the CLI (`--cols`, `--rows`).

## Web interaction (drag-trace, `player.ts`)

- Render maze as **SVG** with a `viewBox` so it scales to container width (mobile-friendly).
- **Pointer Events** (unified mouse/touch/stylus). The maze root sets `touch-action: none`
  so dragging draws the path instead of scrolling the page.
- Begin on the **start** cell. On pointermove, map client coords → cell (`cellAt`). Extend
  the trail to a target cell only if it is **orthogonally adjacent to the trail head** and
  the **wall between is open**. If the target is the **second-to-last** trail cell, **pop**
  (backtrack). Ignore everything else (jumps, walls).
- Render the trail as a thick rounded polyline through cell centers.
- Reaching the **end** cell → success state (confetti + `#result` message via GameHeader).
- **Reveal solution** (GameHeader reveal toggle): draw the stored `solution`; toggling off
  restores the player's traced path; reveal is **not** persisted. **Clear**: empty trail +
  remove localStorage.
- Progress (the traced path) persists in `localStorage` (`maze:<id>`), versioned key.
- **Accessibility fallback:** tapping a cell orthogonally adjacent to the trail head (wall
  open) steps the trail one cell; tapping the head's previous cell backtracks.

## Print

Reuse the route split (like logic-grid / math):
- `/maze/[id]/print` — blank maze (walls + start/end icons), "Print → Save as PDF".
- `/maze/[id]/answer` — same maze with the `solution` path drawn.

`Maze.astro` takes `interactive` and `showSolution` props so the same component serves play,
print, and answer.

## Testing

- **Generator (Vitest, property tests across grades × seeds):**
  - Perfect-maze grades produce a valid spanning tree: every cell reachable from start;
    cell count == passages + 1 (tree invariant); wall openings symmetric.
  - `solution` is a real path: consecutive cells orthogonally adjacent with the connecting
    wall open; starts at `start`, ends at `end`.
  - Deterministic for a given seed.
  - Presets g1–8 exist; cols/rows monotonically non-decreasing by grade.
- **Site (Vitest):** pure helpers in `games/maze/grid.ts` — `cellAt`, adjacency, and
  `isValidStep` — unit-tested without the DOM.
- **Manual/browse QA:** drag a path on desktop + emulated touch; reveal; clear; print +
  answer pages render.

## Reused scaffolding (and any improvements)

- `GameHeader.astro` for crumbs/title/blurb/Print/Answer/Reveal — used as-is. If the maze
  needs a "Clear" affordance the header doesn't expose, add a small generic slot to
  `GameHeader` rather than forking it (minimal, benefits all games).
- `core/rng`, content-collection pattern, print/answer route split, `print.css`,
  `difficultyRating` convention — all reused.

## Risks & mitigations

- **Drag UX on mobile** is the make-or-break: `touch-action: none` + Pointer Events +
  generous cell hit-targets; QA on emulated touch before ship.
- **Braiding vs uniqueness:** only the youngest grades braid; the spec explicitly relaxes
  uniqueness there and still ships a valid BFS solution. Grades 3+ remain unique.
- **Large grids / SVG size:** 20×20 is small for SVG; viewBox scaling keeps the DOM light.
```
