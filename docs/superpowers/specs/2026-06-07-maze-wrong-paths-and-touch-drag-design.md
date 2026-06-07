# Maze improvements: longer wrong paths + forgiving touch drag

Date: 2026-06-07
Status: approved

Two independent improvements to the Maze game.

## Problem 1 — wrong paths are too short

Off-solution dead-end branches frequently run only 1–2 cells, so a solver can
instantly tell a turn is wrong. Branch-depth analysis of a g7 maze gave wrong-branch
depths of `55, 17, 13, 12, 8, 3, 2, 1, 1` — the trivial stubs are the problem. The
decoy fake-start corridors are also short by design (depth 1–4).

Decision (from brainstorm): do **both** — prune short stubs *and* deepen decoys —
with the minimum wrong-path length **scaled by grade**.

### A. Prune short dead-end stubs

New module `generator/src/games/maze/prune.ts`:

```
pruneShortDeadEnds(open, rows, cols, minLen, protectedSet): void
```

- A *stub* is the maximal corridor from a dead-end (cell with exactly one opening)
  back to the first junction (cell with ≥3 openings) or a protected cell.
- Walk inward from each off-solution dead-end, counting cells, until reaching a
  junction or a protected cell. If the stub length `< minLen`, seal every stub cell:
  set `open[r][c] = 0` and clear the matching wall bit on the neighbor on the
  junction side.
- `protectedSet` = start, end, every solution cell, and every decoy/blocked cell.
  Protected cells are never sealed, so the start→end solution stays connected.
- Iterate in passes until a pass seals nothing, capped at `maxPasses` (8). Sealing a
  stub at a true junction (≥3 openings) never creates a new dead-end at that junction,
  so convergence is fast; passes handle stubs that share a junction.
- `minLen <= 0` is a no-op (g1–g2).

Pipeline order in `generate.ts`: carve → farthest end → braid → solutionPath →
**pruneShortDeadEnds** → carveDecoyPockets. Pruning runs after the solution is fixed
(so solution cells are known and protected) and before decoy pockets are carved (decoy
cells are still `open=0` blocked, so prune skips them; pockets are opened afterward).

### B. Deeper decoys

Bump `decoyDepth` in `difficulty.ts`.

### New `minWrongPath` knob (on `Difficulty`), scaled by grade

| grade | g1 | g2 | g3 | g4 | g5 | g6 | g7 | g8 |
|-------|----|----|----|----|----|----|----|----|
| `minWrongPath` | 0 | 0 | 3 | 3 | 4 | 4 | 5 | 6 |
| `decoyDepth` (old) | 0 | 0 | 1 | 1 | 2 | 2 | 3 | 4 |
| `decoyDepth` (new) | 0 | 0 | 2 | 2 | 3 | 3 | 4 | 5 |

g1–g2 remain braided and untouched (`minWrongPath=0`, no decoys).

### Rendering

`site/src/components/Maze.astro`: fill any cell with `open[r][c] === 0` as a solid
wall-colored rect. Such cells only exist as a result of pruning (a perfect maze gives
every cell ≥1 opening, and decoy cells get vertical openings from `carveDecoyPockets`),
so this renders sealed stubs as intentional wall mass rather than empty boxed rooms.

## Problem 2 — touch drag doesn't work around corners / is hard to grab

Root cause: `extendTo` in `site/src/games/maze/player.ts` only accepts a cell exactly
one valid step from the head. A finger drag fires `pointermove` sparsely; between events
the finger crosses 2–3 cells and at corners moves diagonally, producing a non-adjacent
cell that `isValidStep` rejects, so the trail won't follow. You also can only *grab* by
touching the exact tiny head cell or an entry icon.

### Path-fill drag

New helper in `grid.ts`:

```
corridorPath(open, from, to, maxLen): Cell[] | null
```

BFS through open passages from `from` to `to`; returns the step cells (excluding
`from`, including `to`) if a path exists within `maxLen`, else `null`. In a perfect
maze the path between two cells is unique, so this is exactly the traced corridor.

`player.ts` gains `dragTo(target)`:

1. If `target` is already on the trail at index `i < len-1` → truncate the trail to
   `i+1` (drag-back-to-undo, works around corners). No length cap on undo.
2. Otherwise `corridorPath(open, head, target, MAX_STEP)`; if found, apply each step
   through the existing single-step logic (handles push, per-step backtrack, win).
   `MAX_STEP = 6`.

`pointermove` calls `dragTo`. The single-step body is factored into `extendStep` and
reused by `dragTo`, the click fallback, and arrow keys.

### Grab the trail anywhere

`pointerdown`:
- cell on the trail (including head) → truncate to that cell and start dragging (grab
  the fat trail line, an easy touch target);
- cell is an entry point → restart trail there and start dragging;
- otherwise ignore.

## Testing

- `generator/src/games/maze/prune.test.ts`: hand-built grid with a known short stub and
  a long branch — short stub sealed (`open=0`), long branch intact, protected/solution
  cells untouched; for generated g5/g7 mazes across seeds, no off-solution dead-end stub
  shorter than `minWrongPath` remains and start still connects to end.
- `site` test for `corridorPath`: unique corridor returned within cap; `null` beyond cap
  or when blocked.
- Existing generator + site suites (CI `test` job) must stay green.
