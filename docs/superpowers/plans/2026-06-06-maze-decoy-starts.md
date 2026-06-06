# Maze Decoy Starts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As mazes get harder, render several identical start icons clustered next to the real start where only one threads into the maze; the rest are sealed dead-end pockets. Count and corridor depth scale by grade.

**Architecture:** Pure generator-side mechanic flowing through the existing game-catalog framework. We carve the main perfect maze over "grid minus reserved decoy cells" (so it stays a connected, unique-solution spanning tree), then carve the reserved cells into short sealed vertical stubs against the real start. The decoy cells never connect to the maze body, so only the real start reaches `end`. Renderer/player learn to show and begin from multiple entrances; the answer key is unchanged.

**Tech Stack:** TypeScript, Vitest (generator + site), Astro + SVG (site). Maze module under `generator/src/games/maze/`; site render in `site/src/components/Maze.astro` and client island `site/src/games/maze/player.ts`.

---

## File structure

**Generator (`generator/`)**
- Modify `src/games/maze/difficulty.ts` — add `decoys` + `decoyDepth` knobs to `Difficulty` and all 8 presets.
- Modify `src/games/maze/carve.ts` — `carveMaze` accepts an optional `blocked` cell set (default empty → byte-identical to today).
- Create `src/games/maze/decoys.ts` — pure `planDecoys` (geometry/clamp) + `carveDecoyPockets` (open the stubs).
- Modify `src/games/maze/types.ts` — add `decoyStarts: Cell[]` to `Maze`.
- Modify `src/games/maze/generate.ts` — plan decoys, carve main with `blocked`, carve pockets, rating contribution, emit `decoyStarts`.
- Modify `src/games/maze/module.ts` — add the optional framework `score()`.

**Generator tests (`generator/test/`)**
- Create `maze-carve-blocked.test.ts` — empty-blocked equivalence + sealing.
- Create `maze-decoys.test.ts` — `planDecoys`/`carveDecoyPockets` units.
- Modify `maze-difficulty.test.ts` — preset knobs.
- Modify `maze-property.test.ts` — per-grade×seed decoy invariants.
- Modify `maze-module.test.ts` — `score()`.

**Site (`site/`)**
- Modify `src/games/maze/grid.ts` — add `isEntryPoint` helper.
- Modify `test/maze-grid.test.ts` — test `isEntryPoint`.
- Modify `src/content/config.ts` — `decoyStarts` in the maze Zod schema (default `[]`).
- Modify `src/components/Maze.astro` — render an icon at each decoy.
- Modify `src/games/maze/player.ts` — begin a trail from any entrance.
- Modify `src/pages/maze/[id].astro`, `src/pages/maze/[id]/print.astro`, `src/pages/maze/[id]/answer.astro` — pass `decoyStarts` through.

**Content**
- Regenerate the per-grade starter mazes so the live catalog shows decoys (g1–g2 unchanged by design).

---

## Decoy geometry (reference for all tasks)

The real start is fixed at `(0,0)`. For `count` decoys of depth `depth`:
- Decoy `i` (0-based) lives in **column `1 + i`**, top row: entrance cell `(0, 1+i)`.
- Its corridor runs **down**: cells `(1,1+i) … (depth,1+i)`.
- All entrance + corridor cells are **reserved** (blocked from the main carve). Each stub opens only vertically within its own column, so it is an isolated dead-end sealed from the main maze and from the other stubs.
- Clamp: `count → min(count, cols-1)` (columns `1..count` must be in-bounds) and `depth → min(depth, rows-1)`. Our presets never hit the clamp; it guards tiny grids.

This keeps the main region (everything except the small top-left block, including `(0,0)` via `(1,0)`) connected, so the main maze remains a unique-solution spanning tree.

---

## Task 1: Difficulty presets gain `decoys` + `decoyDepth`

**Files:**
- Modify: `generator/src/games/maze/difficulty.ts`
- Test: `generator/test/maze-difficulty.test.ts`

- [ ] **Step 1: Write the failing tests** — append inside the `describe("maze difficulty", …)` block in `generator/test/maze-difficulty.test.ts`:

```ts
  it("decoys: zero for youngest, present from g3, non-decreasing", () => {
    expect(PRESETS.g1!.decoys).toBe(0);
    expect(PRESETS.g2!.decoys).toBe(0);
    expect(PRESETS.g3!.decoys).toBeGreaterThanOrEqual(1);
    expect(PRESETS.g5!.decoys).toBeGreaterThanOrEqual(2); // "5th grade can have multiple"
    let prev = 0;
    for (let g = 1; g <= 8; g++) {
      const d = PRESETS[`g${g}`]!;
      expect(d.decoys).toBeGreaterThanOrEqual(prev);
      prev = d.decoys;
    }
  });
  it("decoyDepth is non-decreasing and >=1 wherever there are decoys", () => {
    let prev = 0;
    for (let g = 1; g <= 8; g++) {
      const d = PRESETS[`g${g}`]!;
      if (d.decoys > 0) expect(d.decoyDepth).toBeGreaterThanOrEqual(1);
      expect(d.decoyDepth).toBeGreaterThanOrEqual(prev);
      prev = d.decoyDepth;
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd generator && npx vitest run test/maze-difficulty.test.ts`
Expected: FAIL — `PRESETS.g3.decoys` is `undefined`.

- [ ] **Step 3: Implement** — replace the whole contents of `generator/src/games/maze/difficulty.ts` with:

```ts
export interface Difficulty {
  id: string;
  cols: number;
  rows: number;
  /** Fraction of dead-ends to open into loops (0 = perfect maze). Youngest only. */
  braid: number;
  /** Count of sealed decoy entrances clustered by the real start. Disjunction load — see grades.ts (tier 3 unlocks g3). */
  decoys: number;
  /** Max corridor length per decoy pocket. Scales look-ahead demand with reasoning tier. */
  decoyDepth: number;
  readingLevel: string;
}

// Size is the dominant lever (docs/grade-appropriateness.md). Braid only g1–g2.
// decoys/decoyDepth derived from src/grades.ts GRADE_BANDS: disjunction (tier 3) unlocks at g3,
// count climbs with workingMemory, depth climbs with maxReasoningTier.
export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", cols: 6,  rows: 6,  braid: 0.5, decoys: 0, decoyDepth: 0, readingLevel: "grade 1" },
  g2: { id: "g2", cols: 8,  rows: 8,  braid: 0.3, decoys: 0, decoyDepth: 0, readingLevel: "grade 2" },
  g3: { id: "g3", cols: 10, rows: 10, braid: 0,   decoys: 1, decoyDepth: 1, readingLevel: "grade 3" },
  g4: { id: "g4", cols: 12, rows: 12, braid: 0,   decoys: 1, decoyDepth: 1, readingLevel: "grade 4" },
  g5: { id: "g5", cols: 14, rows: 14, braid: 0,   decoys: 2, decoyDepth: 2, readingLevel: "grade 5" },
  g6: { id: "g6", cols: 16, rows: 16, braid: 0,   decoys: 3, decoyDepth: 2, readingLevel: "grade 6" },
  g7: { id: "g7", cols: 18, rows: 18, braid: 0,   decoys: 4, decoyDepth: 3, readingLevel: "grade 7" },
  g8: { id: "g8", cols: 20, rows: 20, braid: 0,   decoys: 5, decoyDepth: 4, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown maze difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd generator && npx vitest run test/maze-difficulty.test.ts`
Expected: PASS (all maze-difficulty tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/maze/difficulty.ts generator/test/maze-difficulty.test.ts
git commit -m "feat(maze): decoys + decoyDepth difficulty knobs (grade-band derived)"
```

---

## Task 2: `carveMaze` accepts a `blocked` cell set

**Files:**
- Modify: `generator/src/games/maze/carve.ts`
- Test: `generator/test/maze-carve-blocked.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `generator/test/maze-carve-blocked.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { carveMaze } from "../src/games/maze/carve";
import { makeRng } from "../src/core/rng";
import { E } from "../src/games/maze/types";

describe("carveMaze with blocked cells", () => {
  it("empty blocked set is byte-identical to no argument", () => {
    for (const seed of [1, 2, 7, 99]) {
      const a = carveMaze(8, 8, makeRng(seed));
      const b = carveMaze(8, 8, makeRng(seed), new Set());
      expect(b).toEqual(a);
    }
  });

  it("blocked cells stay sealed (open=0, no neighbor opens into them)", () => {
    const blocked = new Set(["0,1", "1,1"]); // a 1-wide, 2-deep stub next to (0,0)
    const open = carveMaze(6, 6, makeRng(5), blocked);
    expect(open[0]![1]).toBe(0);
    expect(open[1]![1]).toBe(0);
    expect(open[0]![0]! & E).toBe(0); // (0,0) does not open east into the blocked cell
    expect(open[0]![2]! & 8).toBe(0); // (0,2) does not open west (W=8) into it
  });

  it("the main region (grid minus blocked) is fully connected", () => {
    const blocked = new Set(["0,1", "1,1"]);
    const open = carveMaze(6, 6, makeRng(5), blocked);
    // BFS from (0,0) over open walls
    const seen = new Set<string>(["0,0"]);
    const q = [{ r: 0, c: 0 }];
    const dirs = [[ -1,0,1],[0,1,2],[1,0,4],[0,-1,8]] as const; // dr,dc,bit
    for (let i = 0; i < q.length; i++) {
      const { r, c } = q[i]!;
      for (const [dr, dc, bit] of dirs) {
        if (!(open[r]![c]! & bit)) continue;
        const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
        if (nr < 0 || nr >= 6 || nc < 0 || nc >= 6 || seen.has(k)) continue;
        seen.add(k); q.push({ r: nr, c: nc });
      }
    }
    expect(seen.size).toBe(36 - 2); // every non-blocked cell reached
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd generator && npx vitest run test/maze-carve-blocked.test.ts`
Expected: FAIL — `carveMaze` ignores the 4th argument; blocked cells get carved.

- [ ] **Step 3: Implement** — replace the whole contents of `generator/src/games/maze/carve.ts` with:

```ts
import { shuffle, type Rng } from "../../core/rng";
import { DIRS } from "./types";

/**
 * Carve a perfect maze (spanning tree) with an iterative recursive-backtracker.
 * `blocked` cells (keyed "r,c") are treated as pre-visited: the carve never enters
 * them and never opens a wall into them, so they stay sealed (open=0). With an empty
 * set this is byte-identical to the unblocked carve.
 */
export function carveMaze(cols: number, rows: number, rng: Rng, blocked: Set<string> = new Set()): number[][] {
  const open: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (const k of blocked) {
    const [r, c] = k.split(",").map(Number) as [number, number];
    if (r >= 0 && r < rows && c >= 0 && c < cols) visited[r]![c] = true;
  }
  const stack: { r: number; c: number }[] = [{ r: 0, c: 0 }];
  visited[0]![0] = true;

  while (stack.length) {
    const cur = stack[stack.length - 1]!;
    let moved = false;
    for (const d of shuffle([...DIRS], rng)) {
      const nr = cur.r + d.dr, nc = cur.c + d.dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr]![nc]) continue;
      open[cur.r]![cur.c]! |= d.bit;
      open[nr]![nc]! |= d.opp;
      visited[nr]![nc] = true;
      stack.push({ r: nr, c: nc });
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }
  return open;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd generator && npx vitest run test/maze-carve-blocked.test.ts test/maze-carve.test.ts`
Expected: PASS (new blocked tests + the existing carve tests still green).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/maze/carve.ts generator/test/maze-carve-blocked.test.ts
git commit -m "feat(maze): carveMaze supports blocked cells (sealed, byte-identical when empty)"
```

---

## Task 3: `decoys.ts` — plan + carve the pockets (pure)

**Files:**
- Create: `generator/src/games/maze/decoys.ts`
- Test: `generator/test/maze-decoys.test.ts` (create)

- [ ] **Step 1: Write the failing test** — create `generator/test/maze-decoys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planDecoys, carveDecoyPockets } from "../src/games/maze/decoys";
import { N, S } from "../src/games/maze/types";

describe("planDecoys", () => {
  it("returns no entrances and empty blocked for count 0", () => {
    const { entrances, blocked } = planDecoys(10, 10, 0, 0);
    expect(entrances).toEqual([]);
    expect(blocked.size).toBe(0);
  });

  it("places entrances on the top row right of the start, with corridor cells blocked", () => {
    const { entrances, blocked } = planDecoys(14, 14, 2, 2);
    expect(entrances).toEqual([{ r: 0, c: 1 }, { r: 0, c: 2 }]);
    // each decoy reserves entrance + depth corridor cells = depth+1 cells
    expect(blocked.size).toBe(2 * (2 + 1));
    expect(blocked.has("0,1")).toBe(true);
    expect(blocked.has("1,1")).toBe(true);
    expect(blocked.has("2,1")).toBe(true);
    expect(blocked.has("0,2")).toBe(true);
    expect(blocked.has("0,0")).toBe(false); // never blocks the real start
  });

  it("clamps count and depth to fit the grid", () => {
    const { entrances, blocked } = planDecoys(3, 2, 9, 9); // cols-1=2 cols available, rows-1=1 deep
    expect(entrances.length).toBe(2);           // columns 1,2 only
    expect(blocked.size).toBe(2 * (1 + 1));      // depth clamped to rows-1=1
  });
});

describe("carveDecoyPockets", () => {
  it("opens each entrance straight down through its corridor and nothing else", () => {
    const cols = 14, rows = 14, depth = 2;
    const { entrances } = planDecoys(cols, rows, 2, depth);
    const open: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
    carveDecoyPockets(open, entrances, depth, rows);
    for (const e of entrances) {
      // vertical links S/N down the column for `depth` steps
      for (let r = 0; r < depth; r++) {
        expect(open[r]![e.c]! & S).toBe(S);
        expect(open[r + 1]![e.c]! & N).toBe(N);
      }
      // bottom of the corridor is a dead end (no further S)
      expect(open[depth]![e.c]! & S).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd generator && npx vitest run test/maze-decoys.test.ts`
Expected: FAIL — module `../src/games/maze/decoys` not found.

- [ ] **Step 3: Implement** — create `generator/src/games/maze/decoys.ts`:

```ts
import { N, S, type Cell } from "./types";

const key = (r: number, c: number) => `${r},${c}`;

/**
 * Plan a cluster of sealed decoy entrances next to the real start (0,0).
 * Decoy i sits at (0, 1+i) with a corridor running down to (depth, 1+i).
 * Returns the entrance cells (where icons go) and the full set of reserved
 * (blocked) cells to keep out of the main carve. Pure; consumes no RNG.
 */
export function planDecoys(
  cols: number,
  rows: number,
  count: number,
  depth: number,
): { entrances: Cell[]; blocked: Set<string> } {
  const n = Math.max(0, Math.min(count, cols - 1));
  const d = Math.max(0, Math.min(depth, rows - 1));
  const entrances: Cell[] = [];
  const blocked = new Set<string>();
  for (let i = 0; i < n; i++) {
    const c = 1 + i;
    entrances.push({ r: 0, c });
    for (let r = 0; r <= d; r++) blocked.add(key(r, c));
  }
  return { entrances, blocked };
}

/**
 * Carve each decoy entrance into a straight vertical dead-end of length `depth`.
 * Mutates `open`. Only touches the reserved decoy columns, so the pockets stay
 * sealed from the main maze. Pure w.r.t. RNG.
 */
export function carveDecoyPockets(open: number[][], entrances: Cell[], depth: number, rows: number): void {
  const d = Math.max(0, Math.min(depth, rows - 1));
  for (const e of entrances) {
    for (let r = 0; r < d; r++) {
      open[r]![e.c]! |= S;
      open[r + 1]![e.c]! |= N;
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd generator && npx vitest run test/maze-decoys.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/maze/decoys.ts generator/test/maze-decoys.test.ts
git commit -m "feat(maze): pure decoy planner + pocket carver"
```

---

## Task 4: Wire decoys into `generateMaze` + `Maze` type + rating

**Files:**
- Modify: `generator/src/games/maze/types.ts` (add `decoyStarts`)
- Modify: `generator/src/games/maze/generate.ts`
- Test: `generator/test/maze-property.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `generator/test/maze-property.test.ts` (after the existing `describe`), a new block that asserts the decoy invariants per grade × seed:

```ts
import { PRESETS } from "../src/games/maze/difficulty";

const reachable = (open: number[][], rows: number, cols: number, from: any) => {
  const seen = new Set<string>([`${from.r},${from.c}`]);
  const q = [from];
  const dirs = [[-1, 0, N], [0, 1, E], [1, 0, S], [0, -1, W]] as const;
  for (let i = 0; i < q.length; i++) {
    const { r, c } = q[i]!;
    for (const [dr, dc, bit] of dirs) {
      if (!(open[r]![c]! & bit)) continue;
      const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || seen.has(k)) continue;
      seen.add(k); q.push({ r: nr, c: nc });
    }
  }
  return seen;
};

describe("property: decoy starts are sealed and the main maze is intact", () => {
  for (const g of ["g1","g2","g3","g4","g5","g6","g7","g8"]) {
    for (let seed = 0; seed < 4; seed++) {
      it(`${g} seed ${seed}: decoys sealed, main spans non-decoy cells`, () => {
        const p = PRESETS[g]!;
        const m = generateMaze({ difficulty: g, seed, date: "2026-06-05" });

        // count matches the preset (presets never hit the clamp)
        expect(m.decoyStarts.length).toBe(p.decoys);

        const startKey = `${m.start.r},${m.start.c}`;
        const solKeys = new Set(m.solution.map((c) => `${c.r},${c.c}`));
        const fromStart = reachable(m.open, m.rows, m.cols, m.start);

        for (const d of m.decoyStarts) {
          const k = `${d.r},${d.c}`;
          expect(k).not.toBe(startKey);          // distinct from the real start
          expect(solKeys.has(k)).toBe(false);     // never on the solution
          expect(fromStart.has(k)).toBe(false);   // sealed: unreachable from the real start (hence from end)
        }

        // main region = grid minus the reserved decoy cells (entrance + depth corridor each)
        const decoyCells = p.decoys * (p.decoyDepth + 1);
        expect(fromStart.size).toBe(m.rows * m.cols - decoyCells);
      });
    }
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd generator && npx vitest run test/maze-property.test.ts`
Expected: FAIL — `m.decoyStarts` is `undefined`.

- [ ] **Step 3a: Add the field to the type** — in `generator/src/games/maze/types.ts`, add `decoyStarts` to the `Maze` interface, right after the `start`/`end` lines:

```ts
  start: Cell;
  end: Cell;
  /** Extra start icons clustered by the real start; sealed dead-ends. [] when none. */
  decoyStarts: Cell[];
```

- [ ] **Step 3b: Wire generation** — replace the whole contents of `generator/src/games/maze/generate.ts` with:

```ts
import { makeRng } from "../../core/rng";
import { resolveDifficulty, type Difficulty } from "./difficulty";
import { loadThemes, pickTheme } from "./themes";
import { carveMaze } from "./carve";
import { farthestCell, solutionPath, braid } from "./solve";
import { planDecoys, carveDecoyPockets } from "./decoys";
import { slugify, makeMazeId } from "./serialize";
import { type Maze } from "./types";

export interface GenerateMazeOptions {
  difficulty: string;
  seed: number;
  date: string;
  overrides?: Partial<Difficulty>;
  gradeLabel?: string;
}

function ratingFor(
  cols: number,
  rows: number,
  solLen: number,
  open: number[][],
  decoyLoad: number,
): number {
  let branches = 0;
  for (const row of open) for (const m of row) {
    if ([1, 2, 4, 8].filter((b) => m & b).length >= 3) branches++;
  }
  const score = cols * rows + solLen + branches + decoyLoad;
  return Math.min(5, Math.max(1, Math.round(score / 120)));
}

export function generateMaze(opts: GenerateMazeOptions): Maze {
  const diff = resolveDifficulty(opts.difficulty, opts.overrides);
  const rng = makeRng(opts.seed);
  const theme = pickTheme(loadThemes(), rng);

  // Plan decoys first so the main maze is carved around the reserved cells.
  // planDecoys/carveDecoyPockets consume no RNG, so count-0 grades stay byte-identical.
  const { entrances, blocked } = planDecoys(diff.cols, diff.rows, diff.decoys, diff.decoyDepth);

  const open = carveMaze(diff.cols, diff.rows, rng, blocked);
  const start = { r: 0, c: 0 };
  const end = farthestCell(open, diff.rows, diff.cols, start);
  if (diff.braid > 0) braid(open, diff.rows, diff.cols, diff.braid, rng);
  const solution = solutionPath(open, diff.rows, diff.cols, start, end);

  // Carve the sealed dead-end pockets last (main maze + solution already fixed).
  carveDecoyPockets(open, entrances, diff.decoyDepth, diff.rows);

  const decoyLoad = diff.decoys * (diff.decoyDepth + 1);

  return {
    id: makeMazeId(opts.date, slugify(theme.title), opts.seed),
    title: theme.title,
    themeBlurb: theme.blurb,
    gameType: "maze",
    gradeLabel: opts.gradeLabel ?? diff.readingLevel,
    difficulty: diff.id,
    cols: diff.cols,
    rows: diff.rows,
    open,
    start,
    end,
    decoyStarts: entrances,
    theme: { startIcon: theme.startIcon, endIcon: theme.endIcon },
    solution,
    difficultyRating: ratingFor(diff.cols, diff.rows, solution.length, open, decoyLoad),
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd generator && npx vitest run test/maze-property.test.ts test/maze-generate.test.ts`
Expected: PASS — decoy invariants hold across all grades × seeds, and the existing generate/solvability/symmetry tests stay green (decoy pockets are symmetric vertical links; g1–g2 unchanged).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/maze/types.ts generator/src/games/maze/generate.ts generator/test/maze-property.test.ts
git commit -m "feat(maze): generate sealed decoy starts; emit decoyStarts + decoy rating load"
```

---

## Task 5: Maze module `score()` (framework band verification)

**Files:**
- Modify: `generator/src/games/maze/module.ts`
- Test: `generator/test/maze-module.test.ts`

- [ ] **Step 1: Write the failing tests** — append inside the `describe("maze module", …)` block in `generator/test/maze-module.test.ts`:

```ts
  it("exposes score() returning a Load shape", () => {
    expect(typeof mazeModule.score).toBe("function");
    const item = mazeModule.generate({ difficulty: "g5", seed: 1, date: "2026-06-06" });
    const load = mazeModule.score!(item.data);
    expect(load).toEqual({
      maxTier: expect.any(Number),
      steps: expect.any(Number),
      score: expect.any(Number),
      stars: expect.any(Number),
    });
    expect(load.steps).toBeGreaterThan(0);
  });
  it("score() reports disjunction tier (3) when decoys are present", () => {
    const withDecoys = mazeModule.generate({ difficulty: "g5", seed: 1, date: "2026-06-06" });
    const noDecoys = mazeModule.generate({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect(mazeModule.score!(withDecoys.data).maxTier).toBe(3);
    expect(mazeModule.score!(noDecoys.data).maxTier).toBeLessThan(3);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd generator && npx vitest run test/maze-module.test.ts`
Expected: FAIL — `mazeModule.score` is `undefined`.

- [ ] **Step 3: Implement** — replace the whole contents of `generator/src/games/maze/module.ts` with:

```ts
// generator/src/games/maze/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generateMaze } from "./generate";
import type { Maze } from "./types";
import type { GameModule } from "../framework";

export const mazeModule: GameModule = {
  id: "maze",
  title: "Mazes",
  grades: GRADES,
  contentDir: "../site/src/content/mazes",
  difficultyFor: (grade) => PRESETS[grade],
  generate: ({ difficulty, seed, date }) => {
    const m = generateMaze({ difficulty, seed, date });
    return { id: m.id, data: m };
  },
  // Measured difficulty so catalog review can check the grade band.
  // Picking the right entrance among several is a disjunction (tier 3).
  score: (data) => {
    const m = data as Maze;
    const maxTier = m.decoyStarts.length > 0 ? 3 : 2;
    return { maxTier, steps: m.solution.length, score: m.difficultyRating, stars: m.difficultyRating };
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd generator && npx vitest run test/maze-module.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/maze/module.ts generator/test/maze-module.test.ts
git commit -m "feat(maze): module score() reports disjunction tier for band verification"
```

---

## Task 6: Content schema accepts `decoyStarts`

**Files:**
- Modify: `site/src/content/config.ts`

- [ ] **Step 1: Edit the maze schema** — in `site/src/content/config.ts`, inside the `mazes` collection `schema`, add the `decoyStarts` line right after `end: cell,`:

```ts
    start: cell,
    end: cell,
    decoyStarts: z.array(cell).default([]),
```

The `.default([])` keeps any pre-feature maze JSON (no `decoyStarts` field) valid.

- [ ] **Step 2: Verify the schema compiles via build**

Run: `cd site && npm run build`
Expected: build succeeds (existing content — some without `decoyStarts` — still validates because of the default).

- [ ] **Step 3: Commit**

```bash
git add site/src/content/config.ts
git commit -m "feat(site): maze content schema accepts decoyStarts (default [])"
```

---

## Task 7: `isEntryPoint` grid helper (site)

**Files:**
- Modify: `site/src/games/maze/grid.ts`
- Test: `site/test/maze-grid.test.ts`

- [ ] **Step 1: Write the failing test** — append inside the `describe("maze grid helpers", …)` block in `site/test/maze-grid.test.ts`, and add `isEntryPoint` to the import line at the top:

Change the import to:
```ts
import { N, E, S, W, isOpen, isValidStep, cellKey, isEntryPoint } from "../src/games/maze/grid";
```

Add the test:
```ts
  it("isEntryPoint matches the real start or any decoy", () => {
    const entries = [{ r: 0, c: 0 }, { r: 0, c: 1 }];
    expect(isEntryPoint(entries, { r: 0, c: 0 })).toBe(true);
    expect(isEntryPoint(entries, { r: 0, c: 1 })).toBe(true);
    expect(isEntryPoint(entries, { r: 1, c: 0 })).toBe(false);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd site && npx vitest run test/maze-grid.test.ts`
Expected: FAIL — `isEntryPoint` is not exported.

- [ ] **Step 3: Implement** — append to `site/src/games/maze/grid.ts`:

```ts
/** True iff `c` is one of the entry points (real start or a decoy start). */
export function isEntryPoint(entries: Cell[], c: Cell): boolean {
  return entries.some((e) => e.r === c.r && e.c === c.c);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd site && npx vitest run test/maze-grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/src/games/maze/grid.ts site/test/maze-grid.test.ts
git commit -m "feat(site): isEntryPoint helper for multi-entrance mazes"
```

---

## Task 8: `Maze.astro` renders decoy icons

**Files:**
- Modify: `site/src/components/Maze.astro`

- [ ] **Step 1: Add the prop** — in the frontmatter `interface Props`, add `decoyStarts` after `start`/`end`:

```ts
  start: Cell; end: Cell;
  decoyStarts?: Cell[];
```

And add it to the destructured props (with a default), updating that line to:

```ts
const { cols, rows, open, start, end, decoyStarts = [], theme, interactive = false, showSolution = false, solution = [] } = Astro.props;
```

- [ ] **Step 2: Render an icon at each decoy** — in the SVG, immediately **before** the existing start `<text>` element, add:

```astro
    {decoyStarts.map((c) => (
      <text x={mid(c.c)} y={mid(c.r)} font-size={CS * 0.7} text-anchor="middle" dominant-baseline="central">{theme.startIcon}</text>
    ))}
```

(Decoys use the same `startIcon` — they must be visually indistinguishable from the real start.)

- [ ] **Step 3: Verify the build**

Run: `cd site && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add site/src/components/Maze.astro
git commit -m "feat(site): render decoy start icons in Maze.astro"
```

---

## Task 9: `player.ts` begins a trail from any entrance

**Files:**
- Modify: `site/src/games/maze/player.ts`

- [ ] **Step 1: Extend `MazeData` + import the helper** — update the import and `MazeData` interface at the top of `site/src/games/maze/player.ts`:

```ts
import { type Cell, isValidStep, isEntryPoint } from "./grid";

interface MazeData {
  id: string; cols: number; rows: number; open: number[][];
  start: Cell; end: Cell; solution: Cell[];
  decoyStarts?: Cell[];
}
```

- [ ] **Step 2: Build the entry-point list** — right after `const same = (a, b) => …;`, add:

```ts
  const entries: Cell[] = [data.start, ...(data.decoyStarts ?? [])];
```

- [ ] **Step 3: Allow starting the trail from any entrance** — in the `pointerdown` handler, replace the start-drag condition so a press on any entrance (re)starts the trail there:

Replace:
```ts
    // start dragging only from the current head
    if (same(cell, trail[trail.length - 1]!)) { dragging = true; svg.setPointerCapture(ev.pointerId); }
```
with:
```ts
    // continue dragging from the current head, or (re)start a trail at any entrance icon
    if (same(cell, trail[trail.length - 1]!)) {
      dragging = true; svg.setPointerCapture(ev.pointerId);
    } else if (isEntryPoint(entries, cell)) {
      trail = [cell]; render(); save();
      dragging = true; svg.setPointerCapture(ev.pointerId);
      if (result) result.textContent = "";
    }
```

- [ ] **Step 4: Accept any entrance for a restored trail** — in `load()`, replace `same(t[0]!, data.start)` with `isEntryPoint(entries, t[0]!)`:

```ts
      if (raw) { const t = JSON.parse(raw) as Cell[]; if (t.length && isEntryPoint(entries, t[0]!)) trail = t; }
```

(`Clear` still resets to `data.start`, and reveal still draws the stored solution from the real start — leave those as-is. A trail begun on a decoy simply dead-ends in the sealed pocket and can never reach `end`.)

- [ ] **Step 5: Verify the build + site tests**

Run: `cd site && npm run build && npx vitest run`
Expected: build succeeds; site tests pass.

- [ ] **Step 6: Commit**

```bash
git add site/src/games/maze/player.ts
git commit -m "feat(site): maze player can begin a trail from any entrance"
```

---

## Task 10: Pages pass `decoyStarts` through

**Files:**
- Modify: `site/src/pages/maze/[id].astro`
- Modify: `site/src/pages/maze/[id]/print.astro`
- Modify: `site/src/pages/maze/[id]/answer.astro`

- [ ] **Step 1: Play page** — in `site/src/pages/maze/[id].astro`:

Update the `<Maze .../>` tag to pass decoys:
```astro
    <Maze cols={m.cols} rows={m.rows} open={m.open} start={m.start} end={m.end}
          decoyStarts={m.decoyStarts} theme={m.theme} solution={m.solution} interactive={true} />
```

Update the `maze-data` JSON to include `decoyStarts`:
```astro
  <script type="application/json" id="maze-data" set:html={JSON.stringify({ id: m.id, cols: m.cols, rows: m.rows, open: m.open, start: m.start, end: m.end, decoyStarts: m.decoyStarts, solution: m.solution })} />
```

- [ ] **Step 2: Print page** — in `site/src/pages/maze/[id]/print.astro`, update the `<Maze .../>` tag:

```astro
    <Maze cols={m.cols} rows={m.rows} open={m.open} start={m.start} end={m.end} decoyStarts={m.decoyStarts} theme={m.theme} />
```

- [ ] **Step 3: Answer page** — in `site/src/pages/maze/[id]/answer.astro`, update the `<Maze .../>` tag:

```astro
    <Maze cols={m.cols} rows={m.rows} open={m.open} start={m.start} end={m.end} decoyStarts={m.decoyStarts} theme={m.theme}
          showSolution={true} solution={m.solution} />
```

(The answer key still draws only the true `solution` from the real start — it implicitly reveals the correct entrance, which is correct for an answer key.)

- [ ] **Step 4: Verify the build**

Run: `cd site && npm run build`
Expected: build succeeds; maze play/print/answer routes generate.

- [ ] **Step 5: Commit**

```bash
git add "site/src/pages/maze/[id].astro" "site/src/pages/maze/[id]/print.astro" "site/src/pages/maze/[id]/answer.astro"
git commit -m "feat(site): thread decoyStarts through maze play/print/answer pages"
```

---

## Task 11: Regenerate starter content

The committed starter mazes predate decoys. Regenerate the deterministic per-grade set (seeds 1–8, date 2026-06-05) so the live catalog shows the feature. g1–g2 regenerate byte-identical (0 decoys). The non-reproducible catalog set (`2026-06-06-*.json`, generated with an unrecorded seed-base) is removed so the live set is consistent and reproducible. We regenerate **only** maze content (single-game CLI), not `generate:all`, to avoid churning the other games' content.

- [ ] **Step 1: Regenerate the per-grade mazes**

Run:
```bash
cd generator
for g in 1 2 3 4 5 6 7 8; do npm run generate -- --game maze --difficulty g$g --seed $g --date 2026-06-05; done
```
Expected: 8 lines `Wrote …/site/src/content/mazes/2026-06-05-<theme>-<g>.json` (same ids as before — theme is seed-derived and decoys consume no RNG, so filenames are unchanged and the files are overwritten in place).

- [ ] **Step 2: Remove the non-reproducible catalog set**

Run:
```bash
rm site/src/content/mazes/2026-06-06-*.json
```

- [ ] **Step 3: Verify decoy counts per grade landed in the content**

Run:
```bash
cd generator && npx tsx -e '
import { readdirSync, readFileSync } from "node:fs";
import { PRESETS } from "./src/games/maze/difficulty";
const dir = "../site/src/content/mazes";
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const m = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  const want = PRESETS[m.difficulty].decoys;
  if (m.decoyStarts.length !== want) throw new Error(`${f}: ${m.difficulty} expected ${want} decoys, got ${m.decoyStarts.length}`);
  console.log(`${m.difficulty} ${f} → ${m.decoyStarts.length} decoys OK`);
}
console.log("all maze content matches preset decoy counts");
'
```
Expected: one OK line per file (g1/g2 = 0, g3/g4 = 1, g5 = 2, g6 = 3, g7 = 4, g8 = 5) then the summary line.

- [ ] **Step 4: Rebuild the site with the new content**

Run: `cd site && npm run build`
Expected: build succeeds; 8 maze routes.

- [ ] **Step 5: Commit**

```bash
git add site/src/content/mazes
git commit -m "content: regenerate mazes with decoy starts (g3+); drop non-reproducible catalog set"
```

---

## Task 12: Full green — tests, typecheck, build

**Files:** none (verification only)

- [ ] **Step 1: Generator tests + typecheck**

Run: `cd generator && npm test && npm run typecheck`
Expected: all suites PASS; `tsc --noEmit` clean.

- [ ] **Step 2: Site tests + build**

Run: `cd site && npm test && npm run build`
Expected: site tests PASS; build succeeds.

- [ ] **Step 3: Manual/browse QA (recommended)**

Run `cd site && npm run dev`, then for a g6 maze:
- Confirm several identical start icons sit next to each other near the real start.
- Trace from a decoy → the path dead-ends in the pocket, never reaches the goal.
- Trace from the real start → reaching the goal shows "🎉 You made it!".
- `/maze/<id>/print` shows the multi-entrance blank; `/maze/<id>/answer` shows the single true solution.

- [ ] **Step 4: Final commit (if any QA tweaks)** — otherwise nothing to commit; the feature branch is ready for PR per CLAUDE.md (open PR, auto-merge on green CI).

---

## Self-review notes

- **Spec coverage:** data model (`decoyStarts`, Task 4); maze-local knobs (Task 1); sealed-pocket generation approach A (Tasks 2–4); difficulty rating + framework `score()` (Tasks 4–5); renderer (Task 8); player begin-from-any-entrance (Tasks 7, 9); pages (Task 10); schema (Task 6); content regen (Task 11); every test-contract invariant (Tasks 2–4). Scaling table values match the spec (0,0,1,1,2,3,4,5 / depth 0,0,1,1,2,2,3,4).
- **Byte-identical g1–g2:** guaranteed two ways — `carveMaze` empty-blocked equivalence test (Task 2) and decoys/pockets consuming zero RNG (Task 4 ordering note); content regen of g1/g2 overwrites with identical bytes.
- **Type consistency:** `decoyStarts: Cell[]` (generator type, site schema, props, player `MazeData`, JSON payload) used consistently; `planDecoys`/`carveDecoyPockets`/`isEntryPoint` signatures match their call sites.
