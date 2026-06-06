# Sudoku Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sudoku (game 4) — unique-solution, no-guess, grade-banded 4×4/6×6/9×9 — with a technique-tiered logical solver driving difficulty, a tap+number-pad web player, print + answer pages, wired into the catalog framework.

**Architecture:** New `generator/src/games/sudoku/` module (types, solver, generate, difficulty, module) registered in `registry.ts`. A tiered logical solver (naked singles → hidden singles → naked pairs) plus a backtracking uniqueness counter make difficulty principled and guarantee one logically-reachable solution. Site renders an N×N grid with box borders, a tap player with conflict highlighting, and the standard routes.

**Tech Stack:** TypeScript, Vitest, tsx (generator); Astro + Tailwind v4 (site).

**Reference spec:** `docs/superpowers/specs/2026-06-06-sudoku-game-design.md`

## Conventions
- Run generator commands from `generator/`, site from `site/`.
- Grid: `0` = blank. `size = boxW * boxH` (4×4→2×2, 6×6→3×2, 9×9→3×3). Box top-left for cell
  `(r,c)` is `(Math.floor(r/boxH)*boxH, Math.floor(c/boxW)*boxW)`.
- Sudoku id: `${date}-sudoku-${difficulty}-${seed}` (difficulty in the id avoids same-seed
  collisions across grades, since the slug is constant).

## File Structure
```
generator/src/games/sudoku/types.ts
generator/src/games/sudoku/solver.ts      # units, buildCands, cellCands, solveLogical, countSolutions, solvedValid
generator/src/games/sudoku/difficulty.ts  # PRESETS g1-8 + resolveDifficulty
generator/src/games/sudoku/generate.ts    # buildFullGrid + generateSudoku
generator/src/games/sudoku/module.ts      # GameModule adapter (+ score)
generator/src/registry.ts                 # + sudokuModule
site/src/content/config.ts                # + sudokus collection
site/src/games/sudoku/grid.ts             # peers + conflict helpers
site/src/games/sudoku/player.ts           # tap player
site/src/components/Sudoku.astro          # grid + number pad
site/src/pages/sudoku/index.astro
site/src/pages/sudoku/grade/[grade].astro
site/src/pages/sudoku/[id].astro
site/src/pages/sudoku/[id]/print.astro
site/src/pages/sudoku/[id]/answer.astro
site/src/pages/index.astro                # + Sudoku card
```

---

## Task 1: Types

**Files:** Create `generator/src/games/sudoku/types.ts`; Test `generator/test/sudoku-types.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import type { Sudoku, Cell } from "../src/games/sudoku/types";

describe("sudoku types", () => {
  it("constructs", () => {
    const c: Cell = { r: 0, c: 0 };
    const s: Sudoku = {
      id: "x", title: "Sudoku", gameType: "sudoku", gradeLabel: "grade 1", difficulty: "g1",
      size: 4, boxW: 2, boxH: 2, givens: [[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
      solution: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]], maxTier: 1, difficultyRating: 1,
      seed: 1, createdAt: "2026-06-06T00:00:00.000Z",
    };
    expect(s.size).toBe(4); expect(c.r).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`cd generator && npx vitest run test/sudoku-types.test.ts`)

- [ ] **Step 3: Implement**
```ts
// generator/src/games/sudoku/types.ts
export interface Cell { r: number; c: number; }

export interface Sudoku {
  id: string;
  title: string;
  gameType: "sudoku";
  gradeLabel: string;
  difficulty: string;
  size: number;             // 4 | 6 | 9
  boxW: number;             // box width in cells
  boxH: number;             // box height in cells
  givens: number[][];       // size×size, 0 = blank
  solution: number[][];     // size×size completed grid
  maxTier: number;          // hardest technique tier required (1..3)
  difficultyRating: number; // 1–5
  seed: number;
  createdAt: string;
}
```

- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/sudoku/types.ts generator/test/sudoku-types.test.ts
git commit -m "feat(sudoku): types"
```

---

## Task 2: Solver (the core)

**Files:** Create `generator/src/games/sudoku/solver.ts`; Test `generator/test/sudoku-solver.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { units, cellCands, solveLogical, countSolutions, solvedValid } from "../src/games/sudoku/solver";

// A solved 4×4 (boxes 2×2)
const SOLVED = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];

describe("sudoku solver", () => {
  it("units: rows+cols+boxes = 3*size unit lists of size cells", () => {
    const u = units(4, 2, 2);
    expect(u.length).toBe(12);
    expect(u.every((x) => x.length === 4)).toBe(true);
  });
  it("solvedValid accepts a valid grid and rejects a broken one", () => {
    expect(solvedValid(SOLVED, 4, 2, 2)).toBe(true);
    const bad = SOLVED.map((r) => r.slice()); bad[0]![0] = 2; // dup in row/col
    expect(solvedValid(bad, 4, 2, 2)).toBe(false);
  });
  it("solveLogical solves a naked-singles 4×4 at tier 1", () => {
    const givens = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,0]]; // one blank
    const res = solveLogical(givens, 4, 2, 2, 1);
    expect(res.solved).toBe(true);
    expect(res.hardestTier).toBe(1);
    expect(res.grid).toEqual(SOLVED);
  });
  it("countSolutions: 1 for a complete grid, >=2 for an empty grid", () => {
    expect(countSolutions(SOLVED, 4, 2, 2, 2)).toBe(1);
    const empty = Array.from({ length: 4 }, () => new Array(4).fill(0));
    expect(countSolutions(empty, 4, 2, 2, 2)).toBeGreaterThanOrEqual(2);
  });
  it("cellCands lists legal digits for a blank", () => {
    const g = [[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    expect(cellCands(g, 0, 1, 4, 2, 2).sort()).toEqual([2,3,4]); // not 1 (row) — col/box empty
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/sudoku/solver.ts
import type { Cell } from "./types";

export function units(size: number, boxW: number, boxH: number): Cell[][] {
  const u: Cell[][] = [];
  for (let r = 0; r < size; r++) { const row: Cell[] = []; for (let c = 0; c < size; c++) row.push({ r, c }); u.push(row); }
  for (let c = 0; c < size; c++) { const col: Cell[] = []; for (let r = 0; r < size; r++) col.push({ r, c }); u.push(col); }
  for (let br = 0; br < size / boxH; br++) for (let bc = 0; bc < size / boxW; bc++) {
    const box: Cell[] = [];
    for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) box.push({ r: br * boxH + dr, c: bc * boxW + dc });
    u.push(box);
  }
  return u;
}

export function cellCands(grid: number[][], r: number, c: number, size: number, boxW: number, boxH: number): number[] {
  const used = new Set<number>();
  for (let k = 0; k < size; k++) { used.add(grid[r]![k]!); used.add(grid[k]![c]!); }
  const br = Math.floor(r / boxH) * boxH, bc = Math.floor(c / boxW) * boxW;
  for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) used.add(grid[br + dr]![bc + dc]!);
  const out: number[] = [];
  for (let d = 1; d <= size; d++) if (!used.has(d)) out.push(d);
  return out;
}

function buildCands(grid: number[][], size: number, boxW: number, boxH: number): Set<number>[][] {
  const cands: Set<number>[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => new Set<number>()));
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (grid[r]![c]! === 0) cands[r]![c] = new Set(cellCands(grid, r, c, size, boxW, boxH));
  }
  return cands;
}

const isFull = (grid: number[][]): boolean => grid.every((row) => row.every((v) => v !== 0));

export function solvedValid(grid: number[][], size: number, boxW: number, boxH: number): boolean {
  const ok = (cells: Cell[]): boolean => {
    const seen = new Set<number>();
    for (const { r, c } of cells) { const v = grid[r]![c]!; if (v < 1 || v > size || seen.has(v)) return false; seen.add(v); }
    return seen.size === size;
  };
  return units(size, boxW, boxH).every(ok);
}

function placeHiddenSingle(grid: number[][], cands: Set<number>[][], us: Cell[][]): boolean {
  for (const unit of us) {
    for (let d = 1; d <= unit.length; d++) {
      let only: Cell | null = null, cnt = 0;
      for (const { r, c } of unit) if (grid[r]![c]! === 0 && cands[r]![c]!.has(d)) { cnt++; only = { r, c }; }
      if (cnt === 1 && only) { grid[only.r]![only.c] = d; return true; }
    }
  }
  return false;
}

function applyNakedPairs(pruned: Set<number>[][], us: Cell[][], grid: number[][]): void {
  for (const unit of us) {
    const twos = unit.filter(({ r, c }) => grid[r]![c]! === 0 && pruned[r]![c]!.size === 2);
    for (let i = 0; i < twos.length; i++) for (let j = i + 1; j < twos.length; j++) {
      const a = pruned[twos[i]!.r]![twos[i]!.c]!, b = pruned[twos[j]!.r]![twos[j]!.c]!;
      if ([...a].sort().join(",") !== [...b].sort().join(",")) continue;
      for (const { r, c } of unit) {
        if ((r === twos[i]!.r && c === twos[i]!.c) || (r === twos[j]!.r && c === twos[j]!.c)) continue;
        if (grid[r]![c]! !== 0) continue;
        for (const d of a) pruned[r]![c]!.delete(d);
      }
    }
  }
}

export interface LogicalResult { solved: boolean; grid: number[][]; hardestTier: number; }

/** Solve using only techniques up to maxTier. Places one cell per iteration. */
export function solveLogical(givens: number[][], size: number, boxW: number, boxH: number, maxTier: number): LogicalResult {
  const grid = givens.map((r) => r.slice());
  const us = units(size, boxW, boxH);
  let hardest = 0;
  while (!isFull(grid)) {
    const cands = buildCands(grid, size, boxW, boxH);
    // contradiction
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      if (grid[r]![c]! === 0 && cands[r]![c]!.size === 0) return { solved: false, grid, hardestTier: hardest };
    // T1 naked single
    let placed = false;
    for (let r = 0; r < size && !placed; r++) for (let c = 0; c < size; c++)
      if (grid[r]![c]! === 0 && cands[r]![c]!.size === 1) { grid[r]![c] = [...cands[r]![c]!][0]!; hardest = Math.max(hardest, 1); placed = true; break; }
    if (placed) continue;
    // T2 hidden single
    if (maxTier >= 2 && placeHiddenSingle(grid, cands, us)) { hardest = Math.max(hardest, 2); continue; }
    // T3 naked pairs → prune → single
    if (maxTier >= 3) {
      const pruned = cands.map((row) => row.map((s) => new Set(s)));
      applyNakedPairs(pruned, us, grid);
      for (let r = 0; r < size && !placed; r++) for (let c = 0; c < size; c++)
        if (grid[r]![c]! === 0 && pruned[r]![c]!.size === 1) { grid[r]![c] = [...pruned[r]![c]!][0]!; hardest = Math.max(hardest, 3); placed = true; break; }
      if (!placed && placeHiddenSingle(grid, pruned, us)) { hardest = Math.max(hardest, 3); placed = true; }
      if (placed) continue;
    }
    return { solved: false, grid, hardestTier: hardest };
  }
  return { solved: true, grid, hardestTier: hardest };
}

/** Count solutions by backtracking (MRV), stopping at `limit`. */
export function countSolutions(givens: number[][], size: number, boxW: number, boxH: number, limit = 2): number {
  const grid = givens.map((r) => r.slice());
  let count = 0;
  const bt = (): void => {
    if (count >= limit) return;
    let best: Cell | null = null, bestCands: number[] | null = null;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (grid[r]![c]! !== 0) continue;
      const cs = cellCands(grid, r, c, size, boxW, boxH);
      if (cs.length === 0) return;
      if (!bestCands || cs.length < bestCands.length) { best = { r, c }; bestCands = cs; }
    }
    if (!best) { count++; return; }
    for (const d of bestCands!) { grid[best.r]![best.c] = d; bt(); grid[best.r]![best.c] = 0; if (count >= limit) return; }
  };
  bt();
  return count;
}
```

- [ ] **Step 4: Run, expect PASS** (5 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/sudoku/solver.ts generator/test/sudoku-solver.test.ts
git commit -m "feat(sudoku): technique-tiered logical solver + uniqueness counter"
```

---

## Task 3: Difficulty presets

**Files:** Create `generator/src/games/sudoku/difficulty.ts`; Test `generator/test/sudoku-difficulty.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { PRESETS, resolveDifficulty } from "../src/games/sudoku/difficulty";

describe("sudoku difficulty", () => {
  it("has g1..g8 with sizes 4→6→9 and tiers non-decreasing", () => {
    expect(PRESETS.g1!.boxW * PRESETS.g1!.boxH).toBe(4);
    expect(PRESETS.g3!.boxW * PRESETS.g3!.boxH).toBe(6);
    expect(PRESETS.g5!.boxW * PRESETS.g5!.boxH).toBe(9);
    let t = 0;
    for (let g = 1; g <= 8; g++) { const p = PRESETS[`g${g}`]!; expect(p.maxTier).toBeGreaterThanOrEqual(t); t = p.maxTier; }
  });
  it("resolveDifficulty throws on unknown", () => {
    expect(() => resolveDifficulty("z9")).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/sudoku/difficulty.ts
export interface Difficulty {
  id: string;
  boxW: number;
  boxH: number;
  maxTier: number; // 1 naked single, 2 +hidden single, 3 +naked pairs
  readingLevel: string;
}

export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", boxW: 2, boxH: 2, maxTier: 1, readingLevel: "grade 1" },
  g2: { id: "g2", boxW: 2, boxH: 2, maxTier: 1, readingLevel: "grade 2" },
  g3: { id: "g3", boxW: 3, boxH: 2, maxTier: 2, readingLevel: "grade 3" },
  g4: { id: "g4", boxW: 3, boxH: 2, maxTier: 2, readingLevel: "grade 4" },
  g5: { id: "g5", boxW: 3, boxH: 3, maxTier: 2, readingLevel: "grade 5" },
  g6: { id: "g6", boxW: 3, boxH: 3, maxTier: 2, readingLevel: "grade 6" },
  g7: { id: "g7", boxW: 3, boxH: 3, maxTier: 3, readingLevel: "grade 7" },
  g8: { id: "g8", boxW: 3, boxH: 3, maxTier: 3, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown sudoku difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
```

- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/sudoku/difficulty.ts generator/test/sudoku-difficulty.test.ts
git commit -m "feat(sudoku): grade difficulty presets"
```

---

## Task 4: Generate

**Files:** Create `generator/src/games/sudoku/generate.ts`; Test `generator/test/sudoku-generate.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { generateSudoku } from "../src/games/sudoku/generate";
import { countSolutions, solveLogical, solvedValid } from "../src/games/sudoku/solver";

describe("generateSudoku", () => {
  it("g1 (4x4): unique, no-guess within tier, givens ⊆ solution", () => {
    const s = generateSudoku({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect(s.size).toBe(4);
    expect(solvedValid(s.solution, 4, 2, 2)).toBe(true);
    expect(countSolutions(s.givens, 4, 2, 2, 2)).toBe(1);
    expect(solveLogical(s.givens, 4, 2, 2, 1).solved).toBe(true);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
      if (s.givens[r]![c]! !== 0) expect(s.givens[r]![c]).toBe(s.solution[r]![c]);
    expect(s.id).toBe("2026-06-06-sudoku-g1-1");
  });
  it("g5 (9x9): unique and solvable within its tier", () => {
    const s = generateSudoku({ difficulty: "g5", seed: 2, date: "2026-06-06" });
    expect(s.size).toBe(9);
    expect(countSolutions(s.givens, 9, 3, 3, 2)).toBe(1);
    expect(solveLogical(s.givens, 9, 3, 3, s.maxTier).solved).toBe(true);
  });
  it("is deterministic for a seed", () => {
    expect(JSON.stringify(generateSudoku({ difficulty: "g3", seed: 7, date: "2026-06-06" })))
      .toEqual(JSON.stringify(generateSudoku({ difficulty: "g3", seed: 7, date: "2026-06-06" })));
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/sudoku/generate.ts
import { makeRng, shuffle, type Rng } from "../../core/rng";
import { resolveDifficulty } from "./difficulty";
import { cellCands, countSolutions, solveLogical } from "./solver";
import type { Cell, Sudoku } from "./types";

function buildFullGrid(size: number, boxW: number, boxH: number, rng: Rng): number[][] {
  const grid = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const bt = (): boolean => {
    let best: Cell | null = null, bestCands: number[] | null = null;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (grid[r]![c]! !== 0) continue;
      const cs = cellCands(grid, r, c, size, boxW, boxH);
      if (cs.length === 0) return false;
      if (!bestCands || cs.length < bestCands.length) { best = { r, c }; bestCands = cs; }
    }
    if (!best) return true;
    for (const d of shuffle(bestCands!.slice(), rng)) {
      grid[best.r]![best.c] = d;
      if (bt()) return true;
      grid[best.r]![best.c] = 0;
    }
    return false;
  };
  bt();
  return grid;
}

export interface GenerateSudokuOptions { difficulty: string; seed: number; date: string; }

export function generateSudoku(opts: GenerateSudokuOptions): Sudoku {
  const d = resolveDifficulty(opts.difficulty);
  const size = d.boxW * d.boxH;
  const rng = makeRng(opts.seed);
  const solution = buildFullGrid(size, d.boxW, d.boxH, rng);

  const givens = solution.map((r) => r.slice());
  const cells: Cell[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cells.push({ r, c });
  for (const { r, c } of shuffle(cells, rng)) {
    const saved = givens[r]![c]!;
    if (saved === 0) continue;
    givens[r]![c] = 0;
    const unique = countSolutions(givens, size, d.boxW, d.boxH, 2) === 1;
    const logical = solveLogical(givens, size, d.boxW, d.boxH, d.maxTier).solved;
    if (!unique || !logical) givens[r]![c] = saved; // restore: removal made it ambiguous or too hard
  }

  const res = solveLogical(givens, size, d.boxW, d.boxH, d.maxTier);
  const sizeBonus = size >= 9 ? 2 : size >= 6 ? 1 : 0;
  const difficultyRating = Math.min(5, Math.max(1, res.hardestTier + sizeBonus));

  return {
    id: `${opts.date}-sudoku-${d.id}-${opts.seed}`,
    title: "Sudoku",
    gameType: "sudoku",
    gradeLabel: d.readingLevel,
    difficulty: d.id,
    size, boxW: d.boxW, boxH: d.boxH,
    givens, solution,
    maxTier: res.hardestTier,
    difficultyRating,
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
```

- [ ] **Step 4: Run, expect PASS** (3 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/sudoku/generate.ts generator/test/sudoku-generate.test.ts
git commit -m "feat(sudoku): full-grid build + hole-digging generator"
```

---

## Task 5: Property tests

**Files:** Test `generator/test/sudoku-property.test.ts`

- [ ] **Step 1: Write the test**
```ts
import { describe, it, expect } from "vitest";
import { generateSudoku } from "../src/games/sudoku/generate";
import { countSolutions, solveLogical, solvedValid } from "../src/games/sudoku/solver";

describe("property: every generated sudoku is valid", () => {
  for (const g of ["g1","g2","g3","g4","g5","g6","g7","g8"]) {
    for (let seed = 1; seed <= 2; seed++) {
      it(`${g} seed ${seed}: unique + no-guess + valid`, () => {
        const s = generateSudoku({ difficulty: g, seed, date: "2026-06-06" });
        expect(solvedValid(s.solution, s.size, s.boxW, s.boxH)).toBe(true);
        expect(countSolutions(s.givens, s.size, s.boxW, s.boxH, 2)).toBe(1);
        const res = solveLogical(s.givens, s.size, s.boxW, s.boxH, s.maxTier);
        expect(res.solved).toBe(true);
        // givens are a subset of solution
        for (let r = 0; r < s.size; r++) for (let c = 0; c < s.size; c++)
          if (s.givens[r]![c]! !== 0) expect(s.givens[r]![c]).toBe(s.solution[r]![c]);
      });
    }
  }
});
```

- [ ] **Step 2: Run, expect PASS** (16 tests). Then `cd generator && npm test` — all green.
- [ ] **Step 3: Commit**
```bash
git add generator/test/sudoku-property.test.ts
git commit -m "test(sudoku): property tests across grades and seeds"
```

---

## Task 6: Module + register

**Files:** Create `generator/src/games/sudoku/module.ts`; Modify `generator/src/registry.ts`; Test `generator/test/sudoku-module.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { sudokuModule } from "../src/games/sudoku/module";
import { REGISTRY, getModule } from "../src/registry";

describe("sudoku module", () => {
  it("declares id/contentDir/grades", () => {
    expect(sudokuModule.id).toBe("sudoku");
    expect(sudokuModule.contentDir).toBe("../site/src/content/sudokus");
    expect(sudokuModule.grades.length).toBe(8);
  });
  it("generate returns a valid item; score returns a Load", () => {
    const item = sudokuModule.generate({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect((item.data as any).gameType).toBe("sudoku");
    expect((item.data as any).id).toBe(item.id);
    const load = sudokuModule.score!(item.data);
    expect(typeof load.score).toBe("number");
    expect(load.stars).toBeGreaterThanOrEqual(1);
  });
  it("is in the registry", () => {
    expect(REGISTRY.map((m) => m.id)).toContain("sudoku");
    expect(getModule("sudoku").id).toBe("sudoku");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — create `module.ts`:
```ts
// generator/src/games/sudoku/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generateSudoku } from "./generate";
import type { GameModule, Load } from "../framework";
import type { Sudoku } from "./types";

export const sudokuModule: GameModule = {
  id: "sudoku",
  title: "Sudoku",
  grades: GRADES,
  contentDir: "../site/src/content/sudokus",
  difficultyFor: (grade) => PRESETS[grade],
  generate: ({ difficulty, seed, date }) => {
    const s = generateSudoku({ difficulty, seed, date });
    return { id: s.id, data: s };
  },
  score: (data): Load => {
    const s = data as Sudoku;
    const blanks = s.givens.flat().filter((v) => v === 0).length;
    return { maxTier: s.maxTier, steps: blanks, score: s.difficultyRating, stars: s.difficultyRating };
  },
};
```
Then MODIFY `generator/src/registry.ts`: add the import and append to `REGISTRY`:
```ts
import { sudokuModule } from "./games/sudoku/module";
```
```ts
export const REGISTRY: GameModule[] = [logicGridModule, mathPacketModule, mazeModule, sudokuModule];
```

- [ ] **Step 4: Run, expect PASS** (3 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/sudoku/module.ts generator/src/registry.ts generator/test/sudoku-module.test.ts
git commit -m "feat(sudoku): GameModule adapter + register (no CLI edits needed)"
```

---

## Task 7: Content collection

**Files:** Modify `site/src/content/config.ts`

- [ ] **Step 1: Add the `sudokus` collection** (before the `collections` export) and add `sudokus` to it:
```ts
const sudokus = defineCollection({
  type: "data",
  schema: z.object({
    id: z.string(),
    title: z.string(),
    gameType: z.literal("sudoku"),
    gradeLabel: z.string(),
    difficulty: z.string(),
    size: z.number(),
    boxW: z.number(),
    boxH: z.number(),
    givens: z.array(z.array(z.number())),
    solution: z.array(z.array(z.number())),
    maxTier: z.number(),
    difficultyRating: z.number(),
    seed: z.number(),
    createdAt: z.string(),
  }),
});
```
Update: `export const collections = { puzzles, packets, mazes, sudokus };`

- [ ] **Step 2: Generate one sudoku, then build to validate**
```bash
cd generator && npm run generate -- --game sudoku --difficulty g1 --seed 1 --date 2026-06-06
cd ../site && npm run build
```
Expected: build succeeds (the sudoku JSON validates).

- [ ] **Step 3: Commit**
```bash
git add site/src/content/config.ts site/src/content/sudokus/
git commit -m "feat(site): sudokus content collection"
```

---

## Task 8: Grid helpers (client)

**Files:** Create `site/src/games/sudoku/grid.ts`; Test `site/test/sudoku-grid.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { conflicts } from "../src/games/sudoku/grid";

describe("sudoku grid helpers", () => {
  const boxW = 2, boxH = 2, size = 4;
  it("flags a cell that duplicates within its row", () => {
    const g = [[1,1,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    const set = conflicts(g, size, boxW, boxH);
    expect(set.has("0,0")).toBe(true);
    expect(set.has("0,1")).toBe(true);
  });
  it("flags a box duplicate and leaves clean cells alone", () => {
    const g = [[2,0,0,0],[0,2,0,0],[0,0,0,0],[0,0,0,0]]; // both in top-left box
    const set = conflicts(g, size, boxW, boxH);
    expect(set.has("0,0")).toBe(true);
    expect(set.has("1,1")).toBe(true);
    expect(set.has("3,3")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`cd site && npx vitest run test/sudoku-grid.test.ts`)

- [ ] **Step 3: Implement**
```ts
// site/src/games/sudoku/grid.ts
/** Returns the set of "r,c" keys whose digit duplicates within its row, column, or box. */
export function conflicts(grid: number[][], size: number, boxW: number, boxH: number): Set<string> {
  const bad = new Set<string>();
  const scan = (cells: { r: number; c: number }[]) => {
    const byVal = new Map<number, { r: number; c: number }[]>();
    for (const { r, c } of cells) {
      const v = grid[r]![c]!;
      if (v === 0) continue;
      (byVal.get(v) ?? byVal.set(v, []).get(v)!).push({ r, c });
    }
    for (const list of byVal.values()) if (list.length > 1) for (const { r, c } of list) bad.add(`${r},${c}`);
  };
  for (let r = 0; r < size; r++) scan(Array.from({ length: size }, (_, c) => ({ r, c })));
  for (let c = 0; c < size; c++) scan(Array.from({ length: size }, (_, r) => ({ r, c })));
  for (let br = 0; br < size / boxH; br++) for (let bc = 0; bc < size / boxW; bc++) {
    const cells: { r: number; c: number }[] = [];
    for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) cells.push({ r: br * boxH + dr, c: bc * boxW + dc });
    scan(cells);
  }
  return bad;
}
```

- [ ] **Step 4: Run, expect PASS** (2 tests)
- [ ] **Step 5: Commit**
```bash
git add site/src/games/sudoku/grid.ts site/test/sudoku-grid.test.ts
git commit -m "feat(site): sudoku conflict-detection helper"
```

---

## Task 9: Sudoku component

**Files:** Create `site/src/components/Sudoku.astro`

- [ ] **Step 1: Create the component**
```astro
---
interface Props {
  size: number; boxW: number; boxH: number;
  givens: number[][]; solution: number[][];
  interactive?: boolean; showSolution?: boolean;
}
const { size, boxW, boxH, givens, solution, interactive = false, showSolution = false } = Astro.props;
const cellBorder = (r: number, c: number) => {
  const right = (c + 1) % boxW === 0 && c < size - 1 ? "3px" : "1px";
  const bottom = (r + 1) % boxH === 0 && r < size - 1 ? "3px" : "1px";
  return `border-right:${right} solid #1e293b;border-bottom:${bottom} solid #1e293b;` +
    `border-top:${r === 0 ? "3px" : "0"} solid #1e293b;border-left:${c === 0 ? "3px" : "0"} solid #1e293b;`;
};
---
<div class="sudoku" data-size={size} data-boxw={boxW} data-boxh={boxH}>
  <div class="grid mx-auto w-full max-w-md select-none" style={`display:grid;grid-template-columns:repeat(${size},1fr)`}>
    {givens.map((row, r) => row.map((g, c) => {
      const given = g !== 0;
      const shown = showSolution ? solution[r]![c] : (given ? g : "");
      return (
        <div
          data-r={r} data-c={c} data-given={given ? "1" : "0"}
          class:list={["sudoku-cell flex aspect-square items-center justify-center text-lg font-semibold sm:text-xl",
            given ? "bg-slate-50 text-slate-900" : "bg-white text-brand-700",
            interactive && !given ? "cursor-pointer" : ""]}
          style={cellBorder(r, c)}
        >{shown}</div>
      );
    }))}
  </div>

  {interactive && (
    <div class="pad mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-2">
      {Array.from({ length: size }, (_, i) => i + 1).map((n) => (
        <button data-n={n} class="num h-10 w-10 rounded-lg border border-slate-300 bg-white text-lg font-bold text-slate-700 transition hover:bg-slate-50">{n}</button>
      ))}
      <button data-n="0" class="num h-10 w-14 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-500 transition hover:bg-slate-50">Erase</button>
    </div>
  )}
</div>
```

- [ ] **Step 2: Build** (`cd site && npm run build`) — compiles (used by Task 10 page).
- [ ] **Step 3: Commit**
```bash
git add site/src/components/Sudoku.astro
git commit -m "feat(site): Sudoku grid + number pad component"
```

---

## Task 10: Play page

**Files:** Create `site/src/pages/sudoku/[id].astro`

- [ ] **Step 1: Create**
```astro
---
import { getCollection, getEntry } from "astro:content";
import Base from "../../layouts/Base.astro";
import GameHeader from "../../components/GameHeader.astro";
import Sudoku from "../../components/Sudoku.astro";
export async function getStaticPaths() {
  const items = await getCollection("sudokus");
  return items.map((s) => ({ params: { id: s.data.id } }));
}
const { id } = Astro.params;
const s = (await getEntry("sudokus", id!))!.data;
---
<Base title={`${s.title} ${s.size}×${s.size} — Marshellis Games`}>
  <GameHeader
    crumbs={[
      { label: "All games", href: "/" },
      { label: "Sudoku", href: "/sudoku" },
      { label: s.gradeLabel, href: `/sudoku/grade/${s.difficulty}` },
    ]}
    title={`Sudoku ${s.size}×${s.size}`}
    blurb={`Fill the grid so every row, column, and box has 1–${s.size}.`}
    printHref={`/sudoku/${s.id}/print`}
    answerHref={`/sudoku/${s.id}/answer`}
    showCheck={true}
    showClear={true}
    revealNoun="solution"
  />
  <div class="mt-6">
    <Sudoku size={s.size} boxW={s.boxW} boxH={s.boxH} givens={s.givens} solution={s.solution} interactive={true} />
  </div>
  <script type="application/json" id="sudoku-data" set:html={JSON.stringify({ id: s.id, size: s.size, boxW: s.boxW, boxH: s.boxH, givens: s.givens, solution: s.solution })} />
  <script>
    import { initSudoku } from "../../games/sudoku/player.ts";
    initSudoku(JSON.parse(document.getElementById("sudoku-data")!.textContent!));
  </script>
</Base>
```

- [ ] **Step 2: Build** — run after Task 11 (player exists). Create player first or build at Task 11.
- [ ] **Step 3: Commit**
```bash
git add "site/src/pages/sudoku/[id].astro"
git commit -m "feat(site): sudoku play page"
```

---

## Task 11: Player island

**Files:** Create `site/src/games/sudoku/player.ts`

- [ ] **Step 1: Implement**
```ts
// site/src/games/sudoku/player.ts
import { conflicts } from "./grid";

interface SudokuData { id: string; size: number; boxW: number; boxH: number; givens: number[][]; solution: number[][]; }
const storageKey = (id: string) => `sudoku:${id}`;

export function initSudoku(data: SudokuData): void {
  const root = document.querySelector<HTMLElement>(".sudoku");
  if (!root) return;
  const result = document.querySelector<HTMLElement>("#result");
  const cellEls = Array.from(root.querySelectorAll<HTMLElement>(".sudoku-cell"));
  const numEls = Array.from(root.querySelectorAll<HTMLButtonElement>(".num"));
  const checkBtn = document.querySelector<HTMLButtonElement>("#check");
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const revealBtn = document.querySelector<HTMLButtonElement>("#reveal");

  const { size, boxW, boxH, givens, solution } = data;
  const values = givens.map((r) => r.slice());
  let selected: { r: number; c: number } | null = null;
  let revealed = false;

  const at = (r: number, c: number) => cellEls.find((e) => +e.dataset.r! === r && +e.dataset.c! === c)!;

  const load = () => {
    try {
      const raw = localStorage.getItem(storageKey(data.id));
      if (raw) { const v = JSON.parse(raw) as number[][]; if (Array.isArray(v) && v.length === size) for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (givens[r]![c]! === 0) values[r]![c] = v[r]![c]!; }
    } catch { /* ignore */ }
  };
  const save = () => localStorage.setItem(storageKey(data.id), JSON.stringify(values));

  const render = () => {
    const grid = revealed ? solution : values;
    const bad = revealed ? new Set<string>() : conflicts(values, size, boxW, boxH);
    for (const el of cellEls) {
      const r = +el.dataset.r!, c = +el.dataset.c!;
      const given = el.dataset.given === "1";
      const v = grid[r]![c]!;
      el.textContent = v === 0 ? "" : String(v);
      el.classList.toggle("bg-red-100", bad.has(`${r},${c}`));
      el.classList.toggle("text-red-600", bad.has(`${r},${c}`));
      el.classList.toggle("ring-2", !revealed && selected?.r === r && selected?.c === c);
      el.classList.toggle("ring-brand-500", !revealed && selected?.r === r && selected?.c === c);
      if (!given && !revealed) el.classList.add("cursor-pointer");
    }
  };

  cellEls.forEach((el) => el.addEventListener("click", () => {
    if (revealed || el.dataset.given === "1") return;
    selected = { r: +el.dataset.r!, c: +el.dataset.c! };
    render();
  }));

  numEls.forEach((btn) => btn.addEventListener("click", () => {
    if (revealed || !selected) return;
    const n = +btn.dataset.n!;
    if (givens[selected.r]![selected.c]! !== 0) return;
    values[selected.r]![selected.c] = n;
    save();
    if (result) result.textContent = "";
    render();
  }));

  checkBtn?.addEventListener("click", () => {
    if (revealed) return;
    let blanks = 0;
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (values[r]![c]! === 0) blanks++;
    const bad = conflicts(values, size, boxW, boxH);
    if (blanks > 0) { if (result) result.textContent = `${blanks} cell${blanks===1?"":"s"} to go.`; return; }
    if (bad.size > 0) { if (result) result.textContent = "Some numbers repeat — keep trying!"; return; }
    if (result) result.textContent = "🎉 Solved!";
  });

  clearBtn?.addEventListener("click", () => {
    if (revealed) { if (result) result.textContent = "Hide the solution first."; return; }
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (givens[r]![c]! === 0) values[r]![c] = 0;
    selected = null; localStorage.removeItem(storageKey(data.id));
    if (result) result.textContent = "";
    render();
  });

  revealBtn?.addEventListener("click", () => {
    revealed = !revealed;
    revealBtn.setAttribute("aria-pressed", revealed ? "true" : "false");
    if (result) result.textContent = revealed ? "Showing the solution." : "";
    render();
  });

  load();
  render();
}
```

- [ ] **Step 2: Build** (`cd site && npm run build`) — expect success; play page bundles the island.
- [ ] **Step 3: Manual QA** (`cd site && npm run preview`, browse): select a blank, tap a number, conflicts flash red, Check reports progress then "🎉 Solved!", Reveal toggles, Clear empties, reload persists.
- [ ] **Step 4: Commit**
```bash
git add site/src/games/sudoku/player.ts
git commit -m "feat(site): sudoku tap player with conflict highlighting"
```

---

## Task 12: Print + answer pages

**Files:** Create `site/src/pages/sudoku/[id]/print.astro` and `answer.astro`

- [ ] **Step 1: Create `print.astro`**
```astro
---
import { getCollection, getEntry } from "astro:content";
import Sudoku from "../../../components/Sudoku.astro";
import "../../../styles/global.css";
import "../../../styles/print.css";
export async function getStaticPaths() {
  const items = await getCollection("sudokus");
  return items.map((s) => ({ params: { id: s.data.id } }));
}
const { id } = Astro.params;
const s = (await getEntry("sudokus", id!))!.data;
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Sudoku {s.size}×{s.size}</title></head>
  <body class="bg-white p-6 text-slate-900">
    <p class="no-print mb-4 text-sm text-slate-500">
      <a href={`/sudoku/${s.id}`} class="text-brand-600 no-underline hover:underline">← Back</a>
      · Print → Save as PDF · <a href={`/sudoku/${s.id}/answer`} class="text-brand-600 no-underline hover:underline">Solution →</a>
    </p>
    <h1 class="text-2xl font-extrabold">Sudoku {s.size}×{s.size}</h1>
    <p class="mt-1 mb-4 text-slate-600">Fill the grid so every row, column, and box has 1–{s.size}.</p>
    <Sudoku size={s.size} boxW={s.boxW} boxH={s.boxH} givens={s.givens} solution={s.solution} />
  </body>
</html>
```

- [ ] **Step 2: Create `answer.astro`** (identical except heading + `showSolution`):
```astro
---
import { getCollection, getEntry } from "astro:content";
import Sudoku from "../../../components/Sudoku.astro";
import "../../../styles/global.css";
import "../../../styles/print.css";
export async function getStaticPaths() {
  const items = await getCollection("sudokus");
  return items.map((s) => ({ params: { id: s.data.id } }));
}
const { id } = Astro.params;
const s = (await getEntry("sudokus", id!))!.data;
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Sudoku {s.size}×{s.size} — solution</title></head>
  <body class="bg-white p-6 text-slate-900">
    <p class="no-print mb-4 text-sm text-slate-500">
      <a href={`/sudoku/${s.id}`} class="text-brand-600 no-underline hover:underline">← Back</a>
      · Print → Save as PDF · <a href={`/sudoku/${s.id}/print`} class="text-brand-600 no-underline hover:underline">Blank →</a>
    </p>
    <h1 class="text-2xl font-extrabold">Solution — Sudoku {s.size}×{s.size}</h1>
    <Sudoku size={s.size} boxW={s.boxW} boxH={s.boxH} givens={s.givens} solution={s.solution} showSolution={true} />
  </body>
</html>
```

- [ ] **Step 3: Build** — expect print/answer pages render.
- [ ] **Step 4: Commit**
```bash
git add "site/src/pages/sudoku/[id]/print.astro" "site/src/pages/sudoku/[id]/answer.astro"
git commit -m "feat(site): sudoku print + answer pages"
```

---

## Task 13: Grade picker + list

**Files:** Create `site/src/pages/sudoku/index.astro` and `grade/[grade].astro`

- [ ] **Step 1: Create `sudoku/index.astro`**
```astro
---
import Base from "../../layouts/Base.astro";
import { getCollection } from "astro:content";
const items = await getCollection("sudokus");
const byGrade = new Map<string, { label: string; count: number }>();
for (const s of items) {
  const e = byGrade.get(s.data.difficulty) ?? { label: s.data.gradeLabel, count: 0 };
  e.count++; byGrade.set(s.data.difficulty, e);
}
const gradeNum = (g: string) => Number(g.replace(/\D/g, "")) || 0;
const grades = [...byGrade.entries()].sort((a, b) => gradeNum(a[0]) - gradeNum(b[0]));
---
<Base title="Sudoku — Marshellis Games">
  <nav class="mb-4 text-sm text-slate-500"><a href="/" class="text-slate-500 no-underline hover:underline">← All games</a></nav>
  <div class="flex items-center gap-3"><span class="text-3xl">🔢</span><h1 class="text-3xl font-extrabold tracking-tight">Sudoku</h1></div>
  <p class="mt-2 text-slate-500">Choose a grade level.</p>
  <ul class="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
    {grades.map(([g, info]) => (
      <li>
        <a href={`/sudoku/grade/${g}`} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span class="text-xs font-semibold uppercase tracking-wider text-brand-600">{g}</span>
          <span class="mt-1 text-lg font-bold capitalize text-slate-900">{info.label}</span>
          <span class="mt-3 text-sm text-slate-500">{info.count} puzzle{info.count === 1 ? "" : "s"}</span>
        </a>
      </li>
    ))}
  </ul>
</Base>
```

- [ ] **Step 2: Create `sudoku/grade/[grade].astro`**
```astro
---
import Base from "../../../layouts/Base.astro";
import { getCollection } from "astro:content";
export async function getStaticPaths() {
  const items = await getCollection("sudokus");
  const grades = [...new Set(items.map((s) => s.data.difficulty))];
  return grades.map((g) => {
    const inGrade = items.filter((s) => s.data.difficulty === g).sort((a, b) => (a.data.createdAt < b.data.createdAt ? 1 : -1));
    return { params: { grade: g }, props: { items: inGrade, label: inGrade[0]!.data.gradeLabel } };
  });
}
const { items, label } = Astro.props;
---
<Base title={`${label} — Sudoku`}>
  <nav class="mb-4 text-sm text-slate-500">
    <a href="/" class="text-slate-500 no-underline hover:underline">All games</a><span class="px-1">/</span>
    <a href="/sudoku" class="text-slate-500 no-underline hover:underline">Sudoku</a><span class="px-1">/</span>
    <span class="capitalize text-slate-700">{label}</span>
  </nav>
  <h1 class="text-3xl font-extrabold capitalize tracking-tight">{label}</h1>
  <p class="mt-2 text-slate-500">Pick a puzzle.</p>
  <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {items.map((s) => (
      <li>
        <a href={`/sudoku/${s.data.id}`} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span class="text-base font-bold text-slate-900">Sudoku {s.data.size}×{s.data.size}</span>
          <span class="mt-1 text-sm text-slate-500">{"★".repeat(s.data.difficultyRating)}{"☆".repeat(5 - s.data.difficultyRating)}</span>
          <span class="mt-3 text-xs font-medium text-slate-400">#{s.data.seed}</span>
        </a>
      </li>
    ))}
  </ul>
</Base>
```

- [ ] **Step 3: Build** — expect `/sudoku/` + grade pages.
- [ ] **Step 4: Commit**
```bash
git add "site/src/pages/sudoku/index.astro" "site/src/pages/sudoku/grade/[grade].astro"
git commit -m "feat(site): sudoku grade picker + list"
```

---

## Task 14: Home card

**Files:** Modify `site/src/pages/index.astro`

- [ ] **Step 1:** In the frontmatter add:
```ts
const sudokus = await getCollection("sudokus");
const sudokuCount = sudokus.length;
const sudokuGrades = Math.max(...sudokus.map((s) => Number(s.data.difficulty.replace(/\D/g, ""))));
```
- [ ] **Step 2:** Add a `<li>` card to the `<ul>` (mirror the existing cards):
```astro
    <li>
      <a href="/sudoku" class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md">
        <div class="text-4xl">🔢</div>
        <div class="mt-3 text-xl font-bold text-slate-900">Sudoku</div>
        <p class="mt-1 text-sm text-slate-500">Fill the grid with 1–N. Tap to play, or print it out.</p>
        <div class="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400">
          <span class="rounded-full bg-slate-100 px-2 py-0.5">{sudokuCount} puzzles</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5">Grades 1–{sudokuGrades}</span>
        </div>
        <span class="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-all group-hover:gap-2">Play now <span aria-hidden="true">→</span></span>
      </a>
    </li>
```
- [ ] **Step 3: Build** — home shows four games.
- [ ] **Step 4: Commit**
```bash
git add site/src/pages/index.astro
git commit -m "feat(site): add Sudoku card to home"
```

---

## Task 15: Starter set + full green

**Files:** `site/src/content/sudokus/*.json`

- [ ] **Step 1: Generate one sudoku per grade** (the framework makes this a one-liner; seeds vary by grade so ids are unique):
```bash
cd generator
for g in 1 2 3 4 5 6 7 8; do npm run generate -- --game sudoku --difficulty g$g --seed $g --date 2026-06-06; done
```
Expected: 8 files `site/src/content/sudokus/2026-06-06-sudoku-g{1..8}-{1..8}.json`.

- [ ] **Step 2: Build + both suites**
```bash
cd site && npm run build
cd ../generator && npm test && cd ../site && npm test
```
Expected: build OK; all tests PASS.

- [ ] **Step 3: Commit**
```bash
cd /Users/jjackson/emdash/repositories/game-generator
git add site/src/content/sudokus/
git commit -m "content: starter sudoku set grades 1-8"
```

---

## Self-Review Notes
- **Spec coverage:** sizes/tiers (T3), solver tiers + uniqueness (T2), no-guess generation (T4), property (T5), module+register w/ score (T6), collection (T7), conflict helper (T8), grid+pad component (T9), play page (T10), tap player + conflict highlight + check/reveal/clear (T11), print/answer (T12), grade pages (T13), home card (T14), starter set via the framework (T15). All covered.
- **id uniqueness:** `${date}-sudoku-${difficulty}-${seed}` — distinct per grade even at equal seeds.
- **Type consistency:** `Sudoku` fields identical across generator types, content schema, and the data passed to the player; `boxW`/`boxH` used everywhere for geometry; `conflicts(grid,size,boxW,boxH)` signature matches in helper, test, and player.
- **Framework win:** Task 6 is the only registration needed — no `cli.ts` edit (validated by the existing registry-dispatch refactor).
```
