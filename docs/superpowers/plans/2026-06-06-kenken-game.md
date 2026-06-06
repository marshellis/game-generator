# KenKen Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KenKen (game 5) — unique-solution Latin-square + arithmetic-cage puzzles, grade-banded 3×3→6×6 with operations phasing in by grade — wired into the catalog framework.

**Architecture:** New `generator/src/games/kenken/` module (types, solver, generate, difficulty, module) registered in `registry.ts`. Generation builds a random Latin square, partitions it into contiguous cages, assigns each cage an op+target from the solution, and re-rolls until a backtracking solver confirms exactly one solution. Site renders an N×N grid with cage borders + labels and a tap player that validates Latin rows/cols + every cage.

**Tech Stack:** TypeScript, Vitest, tsx (generator); Astro + Tailwind v4 (site).

**Reference spec:** `docs/superpowers/specs/2026-06-06-kenken-game-design.md`

## Conventions
- Run generator commands from `generator/`, site from `site/`.
- Grid `0` = blank (player view). `Op` = `"+" | "-" | "*" | "/" | "="` (`=` = single-cell given).
- Op display symbols: `+ → +`, `- → −`, `* → ×`, `/ → ÷`, `= → ""`.
- id: `${date}-kenken-${difficulty}-${seed}`.

## File Structure
```
generator/src/games/kenken/types.ts
generator/src/games/kenken/solver.ts      # latinValid, cageSatisfied, countSolutions
generator/src/games/kenken/difficulty.ts  # PRESETS g1-8 + resolveDifficulty
generator/src/games/kenken/generate.ts    # buildLatin, partition, assignCage, generateKenKen
generator/src/games/kenken/module.ts      # GameModule adapter (+ score)
generator/src/registry.ts                 # + kenkenModule
site/src/content/config.ts                # + kenkens collection
site/src/games/kenken/grid.ts             # conflicts + cageSatisfied (client)
site/src/games/kenken/player.ts           # tap player
site/src/components/KenKen.astro          # grid (cage borders + labels) + number pad
site/src/pages/kenken/index.astro
site/src/pages/kenken/grade/[grade].astro
site/src/pages/kenken/[id].astro
site/src/pages/kenken/[id]/print.astro
site/src/pages/kenken/[id]/answer.astro
site/src/pages/index.astro                # + KenKen card
```

---

## Task 1: Types

**Files:** Create `generator/src/games/kenken/types.ts`; Test `generator/test/kenken-types.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import type { KenKen, Cage, Op, Cell } from "../src/games/kenken/types";

describe("kenken types", () => {
  it("constructs", () => {
    const cell: Cell = { r: 0, c: 0 };
    const cage: Cage = { cells: [cell, { r: 0, c: 1 }], op: "+", target: 3 };
    const k: KenKen = {
      id: "x", title: "KenKen", gameType: "kenken", gradeLabel: "grade 1", difficulty: "g1",
      size: 3, cages: [cage], solution: [[1,2,3],[2,3,1],[3,1,2]], difficultyRating: 1,
      seed: 1, createdAt: "2026-06-06T00:00:00.000Z",
    };
    const op: Op = "/";
    expect(k.size).toBe(3); expect(cage.op).toBe("+"); expect(op).toBe("/");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`cd generator && npx vitest run test/kenken-types.test.ts`)

- [ ] **Step 3: Implement**
```ts
// generator/src/games/kenken/types.ts
export type Op = "+" | "-" | "*" | "/" | "=";
export interface Cell { r: number; c: number; }
export interface Cage { cells: Cell[]; op: Op; target: number; }

export interface KenKen {
  id: string;
  title: string;
  gameType: "kenken";
  gradeLabel: string;
  difficulty: string;
  size: number;             // 3..6
  cages: Cage[];            // partition of all size*size cells
  solution: number[][];     // size×size Latin square
  difficultyRating: number; // 1–5
  seed: number;
  createdAt: string;
}
```

- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/kenken/types.ts generator/test/kenken-types.test.ts
git commit -m "feat(kenken): types"
```

---

## Task 2: Solver

**Files:** Create `generator/src/games/kenken/solver.ts`; Test `generator/test/kenken-solver.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { latinValid, cageSatisfied, countSolutions } from "../src/games/kenken/solver";
import type { Cage } from "../src/games/kenken/types";

describe("kenken solver", () => {
  it("latinValid", () => {
    expect(latinValid([[1,2],[2,1]], 2)).toBe(true);
    expect(latinValid([[1,2],[1,2]], 2)).toBe(false);
  });
  it("cageSatisfied handles each op", () => {
    const grid = [[6,2],[3,4]];
    expect(cageSatisfied({ cells: [{r:0,c:0}], op: "=", target: 6 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "+", target: 8 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "*", target: 12 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "-", target: 4 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "/", target: 3 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "+", target: 9 }, grid)).toBe(false);
  });
  it("countSolutions: 1 for a constrained 2×2, >=2 when under-constrained", () => {
    // 2×2 Latin with a single-cell given pinning the grid:
    const unique: Cage[] = [
      { cells: [{r:0,c:0}], op: "=", target: 1 },
      { cells: [{r:0,c:1}], op: "=", target: 2 },
      { cells: [{r:1,c:0},{r:1,c:1}], op: "+", target: 3 },
    ];
    expect(countSolutions(2, unique, 2)).toBe(1);
    const loose: Cage[] = [
      { cells: [{r:0,c:0},{r:0,c:1}], op: "+", target: 3 },
      { cells: [{r:1,c:0},{r:1,c:1}], op: "+", target: 3 },
    ];
    expect(countSolutions(2, loose, 2)).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/kenken/solver.ts
import type { Cage } from "./types";

export function latinValid(grid: number[][], size: number): boolean {
  for (let i = 0; i < size; i++) {
    const row = new Set<number>(), col = new Set<number>();
    for (let j = 0; j < size; j++) {
      const rv = grid[i]![j]!, cv = grid[j]![i]!;
      if (rv < 1 || rv > size || row.has(rv)) return false;
      if (cv < 1 || cv > size || col.has(cv)) return false;
      row.add(rv); col.add(cv);
    }
  }
  return true;
}

/** True iff the cage's cells are all filled and combine to its target. */
export function cageSatisfied(cage: Cage, grid: number[][]): boolean {
  const vals = cage.cells.map(({ r, c }) => grid[r]![c]!);
  if (vals.some((v) => v === 0)) return false;
  switch (cage.op) {
    case "=": return vals[0] === cage.target;
    case "+": return vals.reduce((a, b) => a + b, 0) === cage.target;
    case "*": return vals.reduce((a, b) => a * b, 1) === cage.target;
    case "-": { if (vals.length !== 2) return false; return Math.abs(vals[0]! - vals[1]!) === cage.target; }
    case "/": {
      if (vals.length !== 2) return false;
      const hi = Math.max(vals[0]!, vals[1]!), lo = Math.min(vals[0]!, vals[1]!);
      return lo !== 0 && hi % lo === 0 && hi / lo === cage.target;
    }
  }
}

/** Count complete Latin fills consistent with every cage, stopping at `limit`. */
export function countSolutions(size: number, cages: Cage[], limit = 2): number {
  const cellCage: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  cages.forEach((cage, i) => cage.cells.forEach(({ r, c }) => { cellCage[r]![c] = i; }));
  const idx = (r: number, c: number) => r * size + c;
  const cageLast = cages.map((cage) => Math.max(...cage.cells.map(({ r, c }) => idx(r, c))));

  const grid: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const rowUsed: boolean[][] = Array.from({ length: size }, () => new Array(size + 1).fill(false));
  const colUsed: boolean[][] = Array.from({ length: size }, () => new Array(size + 1).fill(false));
  let count = 0;

  const bt = (pos: number): void => {
    if (count >= limit) return;
    if (pos === size * size) { count++; return; }
    const r = Math.floor(pos / size), c = pos % size;
    for (let v = 1; v <= size; v++) {
      if (rowUsed[r]![v] || colUsed[c]![v]) continue;
      grid[r]![c] = v; rowUsed[r]![v] = true; colUsed[c]![v] = true;
      const ci = cellCage[r]![c]!;
      const ok = idx(r, c) !== cageLast[ci] || cageSatisfied(cages[ci]!, grid);
      if (ok) bt(pos + 1);
      grid[r]![c] = 0; rowUsed[r]![v] = false; colUsed[c]![v] = false;
      if (count >= limit) return;
    }
  };
  bt(0);
  return count;
}
```

- [ ] **Step 4: Run, expect PASS** (3 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/kenken/solver.ts generator/test/kenken-solver.test.ts
git commit -m "feat(kenken): solver (latin + cage validation + uniqueness counter)"
```

---

## Task 3: Difficulty presets

**Files:** Create `generator/src/games/kenken/difficulty.ts`; Test `generator/test/kenken-difficulty.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { PRESETS, resolveDifficulty } from "../src/games/kenken/difficulty";

describe("kenken difficulty", () => {
  it("sizes ramp 3→4→5→6 and ops widen by grade", () => {
    expect(PRESETS.g1!.size).toBe(3);
    expect(PRESETS.g3!.size).toBe(4);
    expect(PRESETS.g5!.size).toBe(5);
    expect(PRESETS.g7!.size).toBe(6);
    expect(PRESETS.g1!.ops).toEqual(["+"]);
    expect(PRESETS.g7!.ops).toContain("/");
    let prev = 0;
    for (let g = 1; g <= 8; g++) { const p = PRESETS[`g${g}`]!; expect(p.size).toBeGreaterThanOrEqual(prev); prev = p.size; }
  });
  it("throws on unknown", () => expect(() => resolveDifficulty("zz")).toThrow());
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/kenken/difficulty.ts
import type { Op } from "./types";

export interface Difficulty {
  id: string;
  size: number;
  ops: Op[];        // arithmetic ops allowed (never includes "="; that's implicit for single cells)
  maxCageSize: number;
  readingLevel: string;
}

export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", size: 3, ops: ["+"], maxCageSize: 2, readingLevel: "grade 1" },
  g2: { id: "g2", size: 3, ops: ["+"], maxCageSize: 2, readingLevel: "grade 2" },
  g3: { id: "g3", size: 4, ops: ["+", "-"], maxCageSize: 3, readingLevel: "grade 3" },
  g4: { id: "g4", size: 4, ops: ["+", "-"], maxCageSize: 3, readingLevel: "grade 4" },
  g5: { id: "g5", size: 5, ops: ["+", "-", "*"], maxCageSize: 3, readingLevel: "grade 5" },
  g6: { id: "g6", size: 5, ops: ["+", "-", "*"], maxCageSize: 3, readingLevel: "grade 6" },
  g7: { id: "g7", size: 6, ops: ["+", "-", "*", "/"], maxCageSize: 4, readingLevel: "grade 7" },
  g8: { id: "g8", size: 6, ops: ["+", "-", "*", "/"], maxCageSize: 4, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown kenken difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
```

- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/kenken/difficulty.ts generator/test/kenken-difficulty.test.ts
git commit -m "feat(kenken): grade difficulty presets"
```

---

## Task 4: Generate

**Files:** Create `generator/src/games/kenken/generate.ts`; Test `generator/test/kenken-generate.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { generateKenKen } from "../src/games/kenken/generate";
import { latinValid, cageSatisfied, countSolutions } from "../src/games/kenken/solver";

describe("generateKenKen", () => {
  it("g1 3×3: unique, valid latin, cages cover all cells & match solution", () => {
    const k = generateKenKen({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect(k.size).toBe(3);
    expect(latinValid(k.solution, 3)).toBe(true);
    expect(countSolutions(3, k.cages, 2)).toBe(1);
    // every cell covered exactly once
    const seen = new Set<string>();
    for (const cage of k.cages) for (const { r, c } of cage.cells) { expect(seen.has(`${r},${c}`)).toBe(false); seen.add(`${r},${c}`); }
    expect(seen.size).toBe(9);
    // every cage satisfied by the solution; ops within preset (+ only for g1)
    for (const cage of k.cages) {
      expect(cageSatisfied(cage, k.solution)).toBe(true);
      expect(["+", "="]).toContain(cage.op);
    }
    expect(k.id).toBe("2026-06-06-kenken-g1-1");
  });
  it("g7 6×6: unique; − and ÷ only on 2-cell cages", () => {
    const k = generateKenKen({ difficulty: "g7", seed: 3, date: "2026-06-06" });
    expect(k.size).toBe(6);
    expect(countSolutions(6, k.cages, 2)).toBe(1);
    for (const cage of k.cages) {
      if (cage.op === "-" || cage.op === "/") expect(cage.cells.length).toBe(2);
      expect(cageSatisfied(cage, k.solution)).toBe(true);
    }
  });
  it("deterministic by seed", () => {
    expect(JSON.stringify(generateKenKen({ difficulty: "g4", seed: 5, date: "2026-06-06" })))
      .toEqual(JSON.stringify(generateKenKen({ difficulty: "g4", seed: 5, date: "2026-06-06" })));
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/kenken/generate.ts
import { makeRng, shuffle, type Rng } from "../../core/rng";
import { resolveDifficulty } from "./difficulty";
import { countSolutions } from "./solver";
import type { Cage, Cell, KenKen, Op } from "./types";

function buildLatin(size: number, rng: Rng): number[][] {
  const grid: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const bt = (pos: number): boolean => {
    if (pos === size * size) return true;
    const r = Math.floor(pos / size), c = pos % size;
    const opts = shuffle(Array.from({ length: size }, (_, i) => i + 1), rng).filter((v) => {
      for (let k = 0; k < size; k++) { if (grid[r]![k] === v || grid[k]![c] === v) return false; }
      return true;
    });
    for (const v of opts) { grid[r]![c] = v; if (bt(pos + 1)) return true; grid[r]![c] = 0; }
    return false;
  };
  bt(0);
  return grid;
}

const NB = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

function partition(size: number, maxCageSize: number, rng: Rng): Cell[][] {
  const cageOf: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  const cages: Cell[][] = [];
  const all: Cell[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) all.push({ r, c });
  for (const start of shuffle(all.slice(), rng)) {
    if (cageOf[start.r]![start.c] !== -1) continue;
    const want = 1 + Math.floor(rng() * maxCageSize);
    const cage: Cell[] = [start];
    cageOf[start.r]![start.c] = cages.length;
    while (cage.length < want) {
      const front: Cell[] = [];
      for (const { r, c } of cage) for (const [dr, dc] of NB) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && cageOf[nr]![nc] === -1) front.push({ r: nr, c: nc });
      }
      if (front.length === 0) break;
      const pick = front[Math.floor(rng() * front.length)]!;
      if (cageOf[pick.r]![pick.c] !== -1) continue;
      cageOf[pick.r]![pick.c] = cages.length;
      cage.push(pick);
    }
    cages.push(cage);
  }
  return cages;
}

function assignCage(cells: Cell[], solution: number[][], ops: Op[], rng: Rng): { op: Op; target: number } {
  const vals = cells.map(({ r, c }) => solution[r]![c]!);
  if (cells.length === 1) return { op: "=", target: vals[0]! };
  const pick = (cs: Op[]): Op => cs[Math.floor(rng() * cs.length)]!;
  if (cells.length === 2) {
    const hi = Math.max(vals[0]!, vals[1]!), lo = Math.min(vals[0]!, vals[1]!);
    const choices: Op[] = [];
    if (ops.includes("+")) choices.push("+");
    if (ops.includes("*")) choices.push("*");
    if (ops.includes("-")) choices.push("-");
    if (ops.includes("/") && lo !== 0 && hi % lo === 0) choices.push("/");
    const op = pick(choices);
    if (op === "+") return { op, target: vals[0]! + vals[1]! };
    if (op === "*") return { op, target: vals[0]! * vals[1]! };
    if (op === "-") return { op, target: hi - lo };
    return { op, target: hi / lo };
  }
  // size >= 3: + or *
  const choices: Op[] = [];
  if (ops.includes("+")) choices.push("+");
  if (ops.includes("*")) choices.push("*");
  const op = choices.length ? pick(choices) : "+";
  return op === "*"
    ? { op, target: vals.reduce((a, b) => a * b, 1) }
    : { op: "+", target: vals.reduce((a, b) => a + b, 0) };
}

const OP_TIER: Record<Op, number> = { "=": 0, "+": 1, "-": 2, "*": 3, "/": 4 };

export interface GenerateKenKenOptions { difficulty: string; seed: number; date: string; }

export function generateKenKen(opts: GenerateKenKenOptions): KenKen {
  const d = resolveDifficulty(opts.difficulty);
  const size = d.size;
  const rng = makeRng(opts.seed);
  const solution = buildLatin(size, rng);

  let cages: Cage[] | null = null;
  for (let attempt = 0; attempt < 200 && !cages; attempt++) {
    const parts = partition(size, d.maxCageSize, rng);
    const candidate = parts.map((cells) => {
      const { op, target } = assignCage(cells, solution, d.ops, rng);
      return { cells, op, target };
    });
    if (countSolutions(size, candidate, 2) === 1) cages = candidate;
  }
  if (!cages) {
    // fallback: all single-cell givens (always unique)
    cages = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cages.push({ cells: [{ r, c }], op: "=", target: solution[r]![c]! });
  }

  const maxTier = Math.max(...cages.map((cg) => OP_TIER[cg.op]));
  const avgCage = cages.reduce((a, cg) => a + cg.cells.length, 0) / cages.length;
  const difficultyRating = Math.min(5, Math.max(1, Math.round((size - 2) + maxTier / 2 + avgCage / 3)));

  return {
    id: `${opts.date}-kenken-${d.id}-${opts.seed}`,
    title: "KenKen",
    gameType: "kenken",
    gradeLabel: d.readingLevel,
    difficulty: d.id,
    size, cages, solution,
    difficultyRating,
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
```

- [ ] **Step 4: Run, expect PASS** (3 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/kenken/generate.ts generator/test/kenken-generate.test.ts
git commit -m "feat(kenken): latin square + cage partition + op assignment generator"
```

---

## Task 5: Property tests

**Files:** Test `generator/test/kenken-property.test.ts`

- [ ] **Step 1: Write the test**
```ts
import { describe, it, expect } from "vitest";
import { generateKenKen } from "../src/games/kenken/generate";
import { latinValid, cageSatisfied, countSolutions } from "../src/games/kenken/solver";
import { PRESETS } from "../src/games/kenken/difficulty";

describe("property: every generated kenken is valid", () => {
  for (const g of ["g1","g2","g3","g4","g5","g6","g7","g8"]) {
    for (let seed = 1; seed <= 2; seed++) {
      it(`${g} seed ${seed}: unique + latin + cage/op consistency`, () => {
        const k = generateKenKen({ difficulty: g, seed, date: "2026-06-06" });
        const allowed = new Set<string>([...PRESETS[g]!.ops, "="]);
        expect(latinValid(k.solution, k.size)).toBe(true);
        expect(countSolutions(k.size, k.cages, 2)).toBe(1);
        const seen = new Set<string>();
        for (const cage of k.cages) {
          expect(cageSatisfied(cage, k.solution)).toBe(true);
          expect(allowed.has(cage.op)).toBe(true);
          if (cage.op === "-" || cage.op === "/") expect(cage.cells.length).toBe(2);
          for (const { r, c } of cage.cells) { expect(seen.has(`${r},${c}`)).toBe(false); seen.add(`${r},${c}`); }
        }
        expect(seen.size).toBe(k.size * k.size);
      });
    }
  }
});
```

- [ ] **Step 2: Run, expect PASS** (16 tests). Then `cd generator && npm test` — all green.
- [ ] **Step 3: Commit**
```bash
git add generator/test/kenken-property.test.ts
git commit -m "test(kenken): property tests across grades and seeds"
```

---

## Task 6: Module + register

**Files:** Create `generator/src/games/kenken/module.ts`; Modify `generator/src/registry.ts`; Test `generator/test/kenken-module.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { kenkenModule } from "../src/games/kenken/module";
import { REGISTRY, getModule } from "../src/registry";

describe("kenken module", () => {
  it("declares id/contentDir/grades", () => {
    expect(kenkenModule.id).toBe("kenken");
    expect(kenkenModule.contentDir).toBe("../site/src/content/kenkens");
    expect(kenkenModule.grades.length).toBe(8);
  });
  it("generate returns a valid item; score returns a Load", () => {
    const item = kenkenModule.generate({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect((item.data as any).gameType).toBe("kenken");
    expect((item.data as any).id).toBe(item.id);
    const load = kenkenModule.score!(item.data);
    expect(load.stars).toBeGreaterThanOrEqual(1);
  });
  it("is registered", () => {
    expect(REGISTRY.map((m) => m.id)).toContain("kenken");
    expect(getModule("kenken").id).toBe("kenken");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — create `module.ts`:
```ts
// generator/src/games/kenken/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generateKenKen } from "./generate";
import type { GameModule, Load } from "../framework";
import type { KenKen, Op } from "./types";

const OP_TIER: Record<Op, number> = { "=": 0, "+": 1, "-": 2, "*": 3, "/": 4 };

export const kenkenModule: GameModule = {
  id: "kenken",
  title: "KenKen",
  grades: GRADES,
  contentDir: "../site/src/content/kenkens",
  difficultyFor: (grade) => PRESETS[grade],
  generate: ({ difficulty, seed, date }) => {
    const k = generateKenKen({ difficulty, seed, date });
    return { id: k.id, data: k };
  },
  score: (data): Load => {
    const k = data as KenKen;
    const maxTier = Math.max(...k.cages.map((cg) => OP_TIER[cg.op]));
    return { maxTier, steps: k.cages.length, score: k.difficultyRating, stars: k.difficultyRating };
  },
};
```
Then MODIFY `generator/src/registry.ts`: add the import and append to `REGISTRY`:
```ts
import { kenkenModule } from "./games/kenken/module";
```
```ts
export const REGISTRY: GameModule[] = [logicGridModule, mathPacketModule, mazeModule, sudokuModule, kenkenModule];
```

- [ ] **Step 4: Run, expect PASS**. If `registry.test.ts` asserts an exact id list, update it to include `"kenken"`.
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/kenken/module.ts generator/src/registry.ts generator/test/kenken-module.test.ts generator/test/registry.test.ts
git commit -m "feat(kenken): GameModule adapter + register"
```

---

## Task 7: Content collection

**Files:** Modify `site/src/content/config.ts`

- [ ] **Step 1: Add the `kenkens` collection** (before the `collections` export; add `kenkens` to it):
```ts
const kenkenCell = z.object({ r: z.number(), c: z.number() });
const kenkens = defineCollection({
  type: "data",
  schema: z.object({
    id: z.string(),
    title: z.string(),
    gameType: z.literal("kenken"),
    gradeLabel: z.string(),
    difficulty: z.string(),
    size: z.number(),
    cages: z.array(z.object({
      cells: z.array(kenkenCell),
      op: z.enum(["+", "-", "*", "/", "="]),
      target: z.number(),
    })),
    solution: z.array(z.array(z.number())),
    difficultyRating: z.number(),
    seed: z.number(),
    createdAt: z.string(),
  }),
});
```
Update: `export const collections = { puzzles, packets, mazes, sudokus, kenkens };`

- [ ] **Step 2: Generate one, then build**
```bash
cd generator && npm run generate -- --game kenken --difficulty g1 --seed 1 --date 2026-06-06
cd ../site && npm run build
```
Expected: build succeeds (the kenken JSON validates).

- [ ] **Step 3: Commit**
```bash
git add site/src/content/config.ts site/src/content/kenkens/
git commit -m "feat(site): kenkens content collection"
```

---

## Task 8: Client grid helpers

**Files:** Create `site/src/games/kenken/grid.ts`; Test `site/test/kenken-grid.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { conflicts, cageSatisfied } from "../src/games/kenken/grid";

describe("kenken grid helpers", () => {
  it("conflicts flags row/col duplicates", () => {
    const g = [[1,1],[0,0]];
    const set = conflicts(g, 2);
    expect(set.has("0,0")).toBe(true);
    expect(set.has("0,1")).toBe(true);
    expect(set.has("1,0")).toBe(false);
  });
  it("cageSatisfied matches operations", () => {
    const grid = [[6,2],[3,4]];
    expect(cageSatisfied({ cells: [{r:0,c:0},{r:0,c:1}], op: "/", target: 3 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:1,c:0},{r:1,c:1}], op: "+", target: 7 }, grid)).toBe(true);
    expect(cageSatisfied({ cells: [{r:0,c:0}], op: "=", target: 6 }, grid)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`cd site && npx vitest run test/kenken-grid.test.ts`)

- [ ] **Step 3: Implement**
```ts
// site/src/games/kenken/grid.ts
export type Op = "+" | "-" | "*" | "/" | "=";
export interface Cell { r: number; c: number; }
export interface Cage { cells: Cell[]; op: Op; target: number; }

/** Row/col duplicate cells (ignores blanks=0). */
export function conflicts(grid: number[][], size: number): Set<string> {
  const bad = new Set<string>();
  const scan = (cells: Cell[]) => {
    const byVal = new Map<number, Cell[]>();
    for (const { r, c } of cells) { const v = grid[r]![c]!; if (v === 0) continue; (byVal.get(v) ?? byVal.set(v, []).get(v)!).push({ r, c }); }
    for (const list of byVal.values()) if (list.length > 1) for (const { r, c } of list) bad.add(`${r},${c}`);
  };
  for (let r = 0; r < size; r++) scan(Array.from({ length: size }, (_, c) => ({ r, c })));
  for (let c = 0; c < size; c++) scan(Array.from({ length: size }, (_, r) => ({ r, c })));
  return bad;
}

export function cageSatisfied(cage: Cage, grid: number[][]): boolean {
  const vals = cage.cells.map(({ r, c }) => grid[r]![c]!);
  if (vals.some((v) => v === 0)) return false;
  switch (cage.op) {
    case "=": return vals[0] === cage.target;
    case "+": return vals.reduce((a, b) => a + b, 0) === cage.target;
    case "*": return vals.reduce((a, b) => a * b, 1) === cage.target;
    case "-": return vals.length === 2 && Math.abs(vals[0]! - vals[1]!) === cage.target;
    case "/": { const hi = Math.max(...vals), lo = Math.min(...vals); return vals.length === 2 && lo !== 0 && hi % lo === 0 && hi / lo === cage.target; }
  }
}
```

- [ ] **Step 4: Run, expect PASS** (2 tests)
- [ ] **Step 5: Commit**
```bash
git add site/src/games/kenken/grid.ts site/test/kenken-grid.test.ts
git commit -m "feat(site): kenken conflict + cage helpers"
```

---

## Task 9: KenKen component

**Files:** Create `site/src/components/KenKen.astro`

- [ ] **Step 1: Create**
```astro
---
interface Cell { r: number; c: number; }
interface Cage { cells: Cell[]; op: string; target: number; }
interface Props { size: number; cages: Cage[]; solution: number[][]; interactive?: boolean; showSolution?: boolean; }
const { size, cages, solution, interactive = false, showSolution = false } = Astro.props;

const cellCage: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
cages.forEach((cage, i) => cage.cells.forEach(({ r, c }) => { cellCage[r]![c] = i; }));
const idx = (r: number, c: number) => r * size + c;
const anchor = cages.map((cage) => cage.cells.reduce((b, cur) => (idx(cur.r, cur.c) < idx(b.r, b.c) ? cur : b)));
const OPSYM: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷", "=": "" };
const labelAt = (r: number, c: number): string | null => {
  const ci = cellCage[r]![c]!;
  const a = anchor[ci]!;
  if (a.r !== r || a.c !== c) return null;
  return `${cages[ci]!.target}${OPSYM[cages[ci]!.op]}`;
};
const THICK = "3px solid #1e293b", THIN = "1px solid #cbd5e1";
const border = (r: number, c: number): string => {
  const ci = cellCage[r]![c]!;
  const diff = (nr: number, nc: number) => nr < 0 || nr >= size || nc < 0 || nc >= size || cellCage[nr]![nc] !== ci;
  return `border-top:${diff(r-1,c)?THICK:THIN};border-bottom:${diff(r+1,c)?THICK:THIN};` +
         `border-left:${diff(r,c-1)?THICK:THIN};border-right:${diff(r,c+1)?THICK:THIN};`;
};
---
<div class="kenken" data-size={size}>
  <div class="mx-auto w-full max-w-md select-none" style={`display:grid;grid-template-columns:repeat(${size},1fr)`}>
    {Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => (
      <div data-r={r} data-c={c}
        class="kenken-cell relative flex aspect-square items-center justify-center bg-white text-xl font-semibold text-brand-700"
        style={border(r, c)}>
        {labelAt(r, c) && <span class="pointer-events-none absolute left-1 top-0.5 text-[0.7rem] font-bold text-slate-500">{labelAt(r, c)}</span>}
        <span class="val">{showSolution ? solution[r]![c] : ""}</span>
      </div>
    )))}
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

- [ ] **Step 2: Build** (`cd site && npm run build`) — compiles.
- [ ] **Step 3: Commit**
```bash
git add site/src/components/KenKen.astro
git commit -m "feat(site): KenKen grid (cage borders + labels) + number pad"
```

---

## Task 10: Play page

**Files:** Create `site/src/pages/kenken/[id].astro`

- [ ] **Step 1: Create**
```astro
---
import { getCollection, getEntry } from "astro:content";
import Base from "../../layouts/Base.astro";
import GameHeader from "../../components/GameHeader.astro";
import KenKen from "../../components/KenKen.astro";
export async function getStaticPaths() {
  const items = await getCollection("kenkens");
  return items.map((k) => ({ params: { id: k.data.id } }));
}
const { id } = Astro.params;
const k = (await getEntry("kenkens", id!))!.data;
---
<Base title={`KenKen ${k.size}×${k.size} — Marshellis Games`}>
  <GameHeader
    crumbs={[
      { label: "All games", href: "/" },
      { label: "KenKen", href: "/kenken" },
      { label: k.gradeLabel, href: `/kenken/grade/${k.difficulty}` },
    ]}
    title={`KenKen ${k.size}×${k.size}`}
    blurb={`Fill 1–${k.size} so each row and column has no repeats, and every cage hits its target.`}
    printHref={`/kenken/${k.id}/print`}
    answerHref={`/kenken/${k.id}/answer`}
    showCheck={true} showClear={true} revealNoun="solution"
  />
  <div class="mt-6">
    <KenKen size={k.size} cages={k.cages} solution={k.solution} interactive={true} />
  </div>
  <script type="application/json" id="kenken-data" set:html={JSON.stringify({ id: k.id, size: k.size, cages: k.cages, solution: k.solution })} />
  <script>
    import { initKenKen } from "../../games/kenken/player.ts";
    initKenKen(JSON.parse(document.getElementById("kenken-data")!.textContent!));
  </script>
</Base>
```

- [ ] **Step 2: Build** — after Task 11 (player exists).
- [ ] **Step 3: Commit**
```bash
git add "site/src/pages/kenken/[id].astro"
git commit -m "feat(site): kenken play page"
```

---

## Task 11: Player island

**Files:** Create `site/src/games/kenken/player.ts`

- [ ] **Step 1: Implement**
```ts
// site/src/games/kenken/player.ts
import { conflicts, cageSatisfied, type Cage } from "./grid";

interface KenKenData { id: string; size: number; cages: Cage[]; solution: number[][]; }
const storageKey = (id: string) => `kenken:${id}`;

export function initKenKen(data: KenKenData): void {
  const root = document.querySelector<HTMLElement>(".kenken");
  if (!root) return;
  const result = document.querySelector<HTMLElement>("#result");
  const cellEls = Array.from(root.querySelectorAll<HTMLElement>(".kenken-cell"));
  const numEls = Array.from(root.querySelectorAll<HTMLButtonElement>(".num"));
  const checkBtn = document.querySelector<HTMLButtonElement>("#check");
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const revealBtn = document.querySelector<HTMLButtonElement>("#reveal");

  const { size, cages, solution } = data;
  const values: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  let selected: { r: number; c: number } | null = null;
  let revealed = false;

  const valSpan = (el: HTMLElement) => el.querySelector<HTMLElement>(".val")!;
  const save = () => localStorage.setItem(storageKey(data.id), JSON.stringify(values));
  const load = () => {
    try { const raw = localStorage.getItem(storageKey(data.id)); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v) && v.length === size) for (let r=0;r<size;r++) for (let c=0;c<size;c++) values[r]![c] = v[r]![c]!; } } catch { /* ignore */ }
  };

  const render = () => {
    const grid = revealed ? solution : values;
    const bad = revealed ? new Set<string>() : conflicts(values, size);
    for (const el of cellEls) {
      const r = +el.dataset.r!, c = +el.dataset.c!;
      const v = grid[r]![c]!;
      valSpan(el).textContent = v === 0 ? "" : String(v);
      el.classList.toggle("bg-red-100", bad.has(`${r},${c}`));
      el.classList.toggle("text-red-600", bad.has(`${r},${c}`));
      el.classList.toggle("ring-2", !revealed && selected?.r === r && selected?.c === c);
      el.classList.toggle("ring-brand-500", !revealed && selected?.r === r && selected?.c === c);
    }
  };

  cellEls.forEach((el) => el.addEventListener("click", () => {
    if (revealed) return;
    selected = { r: +el.dataset.r!, c: +el.dataset.c! };
    render();
  }));
  numEls.forEach((btn) => btn.addEventListener("click", () => {
    if (revealed || !selected) return;
    values[selected.r]![selected.c] = +btn.dataset.n!;
    save(); if (result) result.textContent = ""; render();
  }));

  checkBtn?.addEventListener("click", () => {
    if (revealed) return;
    let blanks = 0;
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (values[r]![c]! === 0) blanks++;
    if (blanks > 0) { if (result) result.textContent = `${blanks} cell${blanks===1?"":"s"} to go.`; return; }
    if (conflicts(values, size).size > 0) { if (result) result.textContent = "A row or column repeats — keep trying!"; return; }
    if (!cages.every((cage) => cageSatisfied(cage, values))) { if (result) result.textContent = "A cage doesn't hit its target yet."; return; }
    if (result) result.textContent = "🎉 Solved!";
  });

  clearBtn?.addEventListener("click", () => {
    if (revealed) { if (result) result.textContent = "Hide the solution first."; return; }
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) values[r]![c] = 0;
    selected = null; localStorage.removeItem(storageKey(data.id)); if (result) result.textContent = ""; render();
  });

  revealBtn?.addEventListener("click", () => {
    revealed = !revealed;
    revealBtn.setAttribute("aria-pressed", revealed ? "true" : "false");
    if (result) result.textContent = revealed ? "Showing the solution." : "";
    render();
  });

  load(); render();
}
```

- [ ] **Step 2: Build** (`cd site && npm run build`) — expect success.
- [ ] **Step 3: Manual QA** (`cd site && npm run preview`, browse): tap cell, tap number; row/col dupes flash red; Check reports blanks → conflicts → cage mismatch → "🎉 Solved!" when correct; Reveal/Clear; reload persists.
- [ ] **Step 4: Commit**
```bash
git add site/src/games/kenken/player.ts
git commit -m "feat(site): kenken tap player (conflicts + cage check)"
```

---

## Task 12: Print + answer pages

**Files:** Create `site/src/pages/kenken/[id]/print.astro` and `answer.astro`

- [ ] **Step 1: Create `print.astro`**
```astro
---
import { getCollection, getEntry } from "astro:content";
import KenKen from "../../../components/KenKen.astro";
import "../../../styles/global.css";
import "../../../styles/print.css";
export async function getStaticPaths() {
  const items = await getCollection("kenkens");
  return items.map((k) => ({ params: { id: k.data.id } }));
}
const { id } = Astro.params;
const k = (await getEntry("kenkens", id!))!.data;
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>KenKen {k.size}×{k.size}</title></head>
  <body class="bg-white p-6 text-slate-900">
    <p class="no-print mb-4 text-sm text-slate-500">
      <a href={`/kenken/${k.id}`} class="text-brand-600 no-underline hover:underline">← Back</a>
      · Print → Save as PDF · <a href={`/kenken/${k.id}/answer`} class="text-brand-600 no-underline hover:underline">Solution →</a>
    </p>
    <h1 class="text-2xl font-extrabold">KenKen {k.size}×{k.size}</h1>
    <p class="mt-1 mb-4 text-slate-600">Fill 1–{k.size}: no repeats in any row or column, and each cage hits its target.</p>
    <KenKen size={k.size} cages={k.cages} solution={k.solution} />
  </body>
</html>
```

- [ ] **Step 2: Create `answer.astro`** (identical except heading + `showSolution`):
```astro
---
import { getCollection, getEntry } from "astro:content";
import KenKen from "../../../components/KenKen.astro";
import "../../../styles/global.css";
import "../../../styles/print.css";
export async function getStaticPaths() {
  const items = await getCollection("kenkens");
  return items.map((k) => ({ params: { id: k.data.id } }));
}
const { id } = Astro.params;
const k = (await getEntry("kenkens", id!))!.data;
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>KenKen {k.size}×{k.size} — solution</title></head>
  <body class="bg-white p-6 text-slate-900">
    <p class="no-print mb-4 text-sm text-slate-500">
      <a href={`/kenken/${k.id}`} class="text-brand-600 no-underline hover:underline">← Back</a>
      · Print → Save as PDF · <a href={`/kenken/${k.id}/print`} class="text-brand-600 no-underline hover:underline">Blank →</a>
    </p>
    <h1 class="text-2xl font-extrabold">Solution — KenKen {k.size}×{k.size}</h1>
    <KenKen size={k.size} cages={k.cages} solution={k.solution} showSolution={true} />
  </body>
</html>
```

- [ ] **Step 3: Build** — print/answer pages render.
- [ ] **Step 4: Commit**
```bash
git add "site/src/pages/kenken/[id]/print.astro" "site/src/pages/kenken/[id]/answer.astro"
git commit -m "feat(site): kenken print + answer pages"
```

---

## Task 13: Grade picker + list

**Files:** Create `site/src/pages/kenken/index.astro` and `grade/[grade].astro`

- [ ] **Step 1: Create `kenken/index.astro`**
```astro
---
import Base from "../../layouts/Base.astro";
import { getCollection } from "astro:content";
const items = await getCollection("kenkens");
const byGrade = new Map<string, { label: string; count: number }>();
for (const k of items) { const e = byGrade.get(k.data.difficulty) ?? { label: k.data.gradeLabel, count: 0 }; e.count++; byGrade.set(k.data.difficulty, e); }
const gradeNum = (g: string) => Number(g.replace(/\D/g, "")) || 0;
const grades = [...byGrade.entries()].sort((a, b) => gradeNum(a[0]) - gradeNum(b[0]));
---
<Base title="KenKen — Marshellis Games">
  <nav class="mb-4 text-sm text-slate-500"><a href="/" class="text-slate-500 no-underline hover:underline">← All games</a></nav>
  <div class="flex items-center gap-3"><span class="text-3xl">✖️</span><h1 class="text-3xl font-extrabold tracking-tight">KenKen</h1></div>
  <p class="mt-2 text-slate-500">Choose a grade level.</p>
  <ul class="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
    {grades.map(([g, info]) => (
      <li>
        <a href={`/kenken/grade/${g}`} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span class="text-xs font-semibold uppercase tracking-wider text-brand-600">{g}</span>
          <span class="mt-1 text-lg font-bold capitalize text-slate-900">{info.label}</span>
          <span class="mt-3 text-sm text-slate-500">{info.count} puzzle{info.count === 1 ? "" : "s"}</span>
        </a>
      </li>
    ))}
  </ul>
</Base>
```

- [ ] **Step 2: Create `kenken/grade/[grade].astro`**
```astro
---
import Base from "../../../layouts/Base.astro";
import { getCollection } from "astro:content";
export async function getStaticPaths() {
  const items = await getCollection("kenkens");
  const grades = [...new Set(items.map((k) => k.data.difficulty))];
  return grades.map((g) => {
    const inGrade = items.filter((k) => k.data.difficulty === g).sort((a, b) => (a.data.createdAt < b.data.createdAt ? 1 : -1));
    return { params: { grade: g }, props: { items: inGrade, label: inGrade[0]!.data.gradeLabel } };
  });
}
const { items, label } = Astro.props;
---
<Base title={`${label} — KenKen`}>
  <nav class="mb-4 text-sm text-slate-500">
    <a href="/" class="text-slate-500 no-underline hover:underline">All games</a><span class="px-1">/</span>
    <a href="/kenken" class="text-slate-500 no-underline hover:underline">KenKen</a><span class="px-1">/</span>
    <span class="capitalize text-slate-700">{label}</span>
  </nav>
  <h1 class="text-3xl font-extrabold capitalize tracking-tight">{label}</h1>
  <p class="mt-2 text-slate-500">Pick a puzzle.</p>
  <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {items.map((k) => (
      <li>
        <a href={`/kenken/${k.data.id}`} class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
          <span class="text-base font-bold text-slate-900">KenKen {k.data.size}×{k.data.size}</span>
          <span class="mt-1 text-sm text-slate-500">{"★".repeat(k.data.difficultyRating)}{"☆".repeat(5 - k.data.difficultyRating)}</span>
          <span class="mt-3 text-xs font-medium text-slate-400">#{k.data.seed}</span>
        </a>
      </li>
    ))}
  </ul>
</Base>
```

- [ ] **Step 3: Build** — `/kenken/` + grade pages exist.
- [ ] **Step 4: Commit**
```bash
git add "site/src/pages/kenken/index.astro" "site/src/pages/kenken/grade/[grade].astro"
git commit -m "feat(site): kenken grade picker + list"
```

---

## Task 14: Home card

**Files:** Modify `site/src/pages/index.astro`

- [ ] **Step 1:** In the frontmatter add:
```ts
const kenkens = await getCollection("kenkens");
const kenkenCount = kenkens.length;
const kenkenGrades = Math.max(...kenkens.map((k) => Number(k.data.difficulty.replace(/\D/g, ""))));
```
- [ ] **Step 2:** Add a `<li>` card to the `<ul>` (mirror existing cards):
```astro
    <li>
      <a href="/kenken" class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md">
        <div class="text-4xl">✖️</div>
        <div class="mt-3 text-xl font-bold text-slate-900">KenKen</div>
        <p class="mt-1 text-sm text-slate-500">Math-meets-logic: fill the grid so every cage hits its target. Tap or print.</p>
        <div class="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400">
          <span class="rounded-full bg-slate-100 px-2 py-0.5">{kenkenCount} puzzles</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5">Grades 1–{kenkenGrades}</span>
        </div>
        <span class="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-all group-hover:gap-2">Play now <span aria-hidden="true">→</span></span>
      </a>
    </li>
```
- [ ] **Step 3: Build** — home shows five games.
- [ ] **Step 4: Commit**
```bash
git add site/src/pages/index.astro
git commit -m "feat(site): add KenKen card to home"
```

---

## Task 15: Starter set + full green

**Files:** `site/src/content/kenkens/*.json`

- [ ] **Step 1: Generate one per grade**
```bash
cd generator
for g in 1 2 3 4 5 6 7 8; do npm run generate -- --game kenken --difficulty g$g --seed $g --date 2026-06-06; done
```
Expected: 8 files `site/src/content/kenkens/2026-06-06-kenken-g{1..8}-{1..8}.json`.

- [ ] **Step 2: Build + both suites**
```bash
cd site && npm run build
cd ../generator && npm test && cd ../site && npm test
```
Expected: build OK; all tests PASS.

- [ ] **Step 3: Commit**
```bash
cd /Users/jjackson/emdash/repositories/game-generator
git add site/src/content/kenkens/
git commit -m "content: starter kenken set grades 1-8"
```

---

## Self-Review Notes
- **Spec coverage:** sizes/ops (T3), solver+uniqueness (T2), latin/partition/assign/no-guess-uniqueness generation (T4), property (T5), module+register+score (T6), collection (T7), client conflict+cage helpers (T8), grid w/ cage borders+labels (T9), play page (T10), tap player + cage check (T11), print/answer (T12), grade pages (T13), home card (T14), starter set (T15). Covered.
- **−/÷ only on 2-cell cages:** enforced in `assignCage` (only added to 2-cell choices) and re-asserted in property tests + cage validation.
- **id uniqueness:** `${date}-kenken-${difficulty}-${seed}` distinct per grade.
- **Type consistency:** `Op`/`Cell`/`Cage` shapes match across generator types, content schema (`z.enum(["+","-","*","/","="])`), and client `grid.ts`; `cageSatisfied` signature identical in solver and client copy; `countSolutions(size, cages, limit)` consistent.
- **Termination:** generation falls back to all single-cell cages (always unique) if 200 re-rolls fail.
```
