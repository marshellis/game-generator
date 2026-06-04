# Logic Grid Puzzle Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generator that produces logic-grid ("zebra") puzzles with guaranteed-unique, no-guess solutions, plus an Astro site (interactive play + printable worksheets) published to games.marshellis.com.

**Architecture:** Two independent npm projects in one repo. `generator/` is pure, heavily-tested TypeScript that emits validated puzzle JSON into `site/src/content/puzzles/`. `site/` is an Astro static app that renders the puzzle store as an index, an interactive player, and a printable worksheet. Logic correctness lives in code (a constraint-propagation board + backtracking search); fun phrasing is a swappable surface layer (deterministic templates for tests/CI; Claude in-session for real puzzles).

**Tech Stack:** TypeScript, Node 25, Vitest, tsx, Astro (static), npm. Deployed on Vercel; DNS subdomain via Cloudflare.

**Reference spec:** `docs/superpowers/specs/2026-06-04-logic-grid-game-generator-design.md`

---

## File Structure

```
game-generator/
├─ generator/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ vitest.config.ts
│  ├─ src/
│  │  ├─ core/
│  │  │  └─ rng.ts                 # seeded RNG + shuffle
│  │  ├─ games/logic-grid/
│  │  │  ├─ types.ts               # Category, Ref, StructuredClue, Solution, Puzzle
│  │  │  ├─ board.ts               # constraint-propagation Board (the solver primitive)
│  │  │  ├─ solver.ts              # uniqueSolutionExists, isNoGuessSolvable, extractSolution, countSolutions
│  │  │  ├─ solution.ts            # seeded solution generation
│  │  │  ├─ clues.ts               # candidate-fact enumeration (is/isNot/eitherOr/comparative)
│  │  │  ├─ reduce.ts              # minimal no-guess clue reduction + redundancy
│  │  │  ├─ difficulty.ts          # grade presets → knobs
│  │  │  ├─ phrasing.ts            # Phraser interface + TemplatePhraser
│  │  │  ├─ themes.ts              # ThemePack type + loader
│  │  │  ├─ themes/                # curated theme-pack JSON files
│  │  │  ├─ generate.ts            # generatePuzzle() pipeline
│  │  │  └─ serialize.ts           # Puzzle → JSON, id/slug
│  │  └─ cli.ts                    # `generate` command
│  └─ test/                        # vitest specs mirror src/
└─ site/
   ├─ package.json
   ├─ astro.config.mjs
   ├─ tsconfig.json
   ├─ src/
   │  ├─ content/
   │  │  ├─ config.ts              # Zod schema for the puzzles collection
   │  │  └─ puzzles/               # generated puzzle JSON (the store)
   │  ├─ games/logic-grid/
   │  │  ├─ grid.ts                # shared pure helpers (build display grid from puzzle)
   │  │  └─ player.ts             # client island script (cycle X/O, check, reveal, persist)
   │  ├─ layouts/Base.astro
   │  ├─ components/LogicGrid.astro
   │  ├─ styles/print.css
   │  └─ pages/
   │     ├─ index.astro
   │     ├─ puzzle/[id].astro
   │     └─ puzzle/[id]/print.astro
   └─ public/
```

---

# PHASE 1 — Generator Core

## Task 1: Initialize the generator package

**Files:**
- Create: `generator/package.json`
- Create: `generator/tsconfig.json`
- Create: `generator/vitest.config.ts`

- [ ] **Step 1: Create `generator/package.json`**

```json
{
  "name": "logic-grid-generator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "generate": "tsx src/cli.ts",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `generator/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `generator/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 4: Install dependencies**

Run: `cd generator && npm install`
Expected: dependencies install, `node_modules/` created, no errors.

- [ ] **Step 5: Verify the test runner works (no tests yet)**

Run: `cd generator && npx vitest run`
Expected: exits cleanly reporting "No test files found" (exit code 0 or a clear no-tests message).

- [ ] **Step 6: Commit**

```bash
git add generator/package.json generator/tsconfig.json generator/vitest.config.ts
git commit -m "chore(generator): scaffold TS package with vitest"
```

---

## Task 2: Seeded RNG and shuffle

**Files:**
- Create: `generator/src/core/rng.ts`
- Test: `generator/test/rng.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/rng.test.ts
import { describe, it, expect } from "vitest";
import { makeRng, shuffle } from "../src/core/rng";

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0,1)", () => {
    const r = makeRng(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("differs across seeds", () => {
    expect(makeRng(1)()).not.toEqual(makeRng(2)());
  });
});

describe("shuffle", () => {
  it("is a deterministic permutation for a given rng", () => {
    const arr = [1, 2, 3, 4, 5];
    const out1 = shuffle([...arr], makeRng(7));
    const out2 = shuffle([...arr], makeRng(7));
    expect(out1).toEqual(out2);
    expect([...out1].sort()).toEqual(arr);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/rng.test.ts`
Expected: FAIL — cannot find module `../src/core/rng`.

- [ ] **Step 3: Write minimal implementation**

```ts
// generator/src/core/rng.ts
export type Rng = () => number;

// Mulberry32 — small, fast, deterministic PRNG.
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/rng.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/core/rng.ts generator/test/rng.test.ts
git commit -m "feat(generator): seeded RNG and deterministic shuffle"
```

---

## Task 3: Core types

**Files:**
- Create: `generator/src/games/logic-grid/types.ts`
- Test: `generator/test/types.test.ts`

- [ ] **Step 1: Write the failing test** (a compile-level smoke test that the types/constructors are usable)

```ts
// generator/test/types.test.ts
import { describe, it, expect } from "vitest";
import type { Category, Ref, StructuredClue, Solution, Puzzle } from "../src/games/logic-grid/types";

describe("types", () => {
  it("can construct each structured clue variant", () => {
    const isClue: StructuredClue = { type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } };
    const isNot: StructuredClue = { type: "isNot", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } };
    const either: StructuredClue = {
      type: "eitherOr",
      a: { cat: 0, item: 0 },
      options: [{ cat: 1, item: 0 }, { cat: 1, item: 1 }],
    };
    const comp: StructuredClue = {
      type: "comparative",
      greater: { cat: 0, item: 0 },
      lesser: { cat: 1, item: 1 },
      orderedCat: 2,
    };
    const all: StructuredClue[] = [isClue, isNot, either, comp];
    expect(all).toHaveLength(4);
  });

  it("models a puzzle shape", () => {
    const cat: Category = { name: "Kid", items: ["Ann", "Ben"] };
    const sol: Solution = [[0, 1], [0, 1]];
    const ref: Ref = { cat: 0, item: 0 };
    const p: Puzzle = {
      id: "x", title: "t", themeBlurb: "b", gameType: "logic-grid",
      gradeLabel: "5th grade", difficulty: "g5",
      categories: [cat, { name: "Pet", items: ["Cat", "Dog"] }],
      solution: sol,
      clues: [{ id: "c1", structured: { type: "is", a: ref, b: { cat: 1, item: 0 } }, text: "..." }],
      seed: 1, createdAt: "2026-06-04T00:00:00.000Z",
    };
    expect(p.categories).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/types.test.ts`
Expected: FAIL — cannot find module `types`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/types.ts

/** A category of things, e.g. {name:"Kid", items:["Ann","Ben","Cal"]}. */
export interface Category {
  name: string;
  /** Ordered categories (ages, positions) enable comparative clues. items[] is in rank order, index = rank. */
  ordered?: boolean;
  items: string[];
}

/** Points at a specific item within a specific category, by index. */
export interface Ref {
  cat: number;
  item: number;
}

export type StructuredClue =
  | { type: "is"; a: Ref; b: Ref }
  | { type: "isNot"; a: Ref; b: Ref }
  /** Entity of `a` matches exactly one of `options` (both options share one category != a.cat). */
  | { type: "eitherOr"; a: Ref; options: [Ref, Ref] }
  /** Entity of `greater` has a strictly higher rank in `orderedCat` than entity of `lesser`. */
  | { type: "comparative"; greater: Ref; lesser: Ref; orderedCat: number };

/**
 * Solution[c][e] = item index in category c assigned to entity e.
 * Entities are indexed by the anchor category (category 0); Solution[0][e] === e.
 */
export type Solution = number[][];

export interface Clue {
  id: string;
  structured: StructuredClue;
  text: string;
}

export interface Puzzle {
  id: string;
  title: string;
  themeBlurb: string;
  gameType: "logic-grid";
  gradeLabel: string;
  difficulty: string;
  categories: Category[];
  solution: Solution;
  clues: Clue[];
  seed: number;
  createdAt: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/types.ts generator/test/types.test.ts
git commit -m "feat(generator): logic-grid core types"
```

---

## Task 4: The constraint-propagation Board

The Board is the solver primitive. It stores, for every pair of categories, an M×M matrix of cell states (-1 no / 0 unknown / 1 yes), and propagates the three deduction rules: bijection (each item matches exactly one item in another category), transitivity (if A=B and B=C then A=C), and the all-but-one-eliminated inference. It also processes registered comparative constraints during propagation.

**Files:**
- Create: `generator/src/games/logic-grid/board.ts`
- Test: `generator/test/board.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/board.test.ts
import { describe, it, expect } from "vitest";
import { Board, Contradiction } from "../src/games/logic-grid/board";

describe("Board", () => {
  it("setting YES eliminates the rest of the row and column in that pair", () => {
    const b = new Board(2, 3); // 2 categories, 3 items each
    b.set(0, 0, 1, 0, 1);
    b.propagate();
    expect(b.get(0, 0, 1, 0)).toBe(1);
    expect(b.get(0, 0, 1, 1)).toBe(-1);
    expect(b.get(0, 0, 1, 2)).toBe(-1);
    expect(b.get(0, 1, 1, 0)).toBe(-1);
    expect(b.get(0, 2, 1, 0)).toBe(-1);
  });

  it("propagates transitivity across three categories", () => {
    const b = new Board(3, 3);
    b.set(0, 0, 1, 0, 1); // A0 = B0
    b.set(1, 0, 2, 0, 1); // B0 = C0
    b.propagate();
    expect(b.get(0, 0, 2, 0)).toBe(1); // therefore A0 = C0
  });

  it("infers YES when all but one cell in a row are NO", () => {
    const b = new Board(2, 3);
    b.set(0, 0, 1, 0, -1);
    b.set(0, 0, 1, 1, -1);
    b.propagate();
    expect(b.get(0, 0, 1, 2)).toBe(1);
  });

  it("throws Contradiction on conflicting assignment", () => {
    const b = new Board(2, 3);
    b.set(0, 0, 1, 0, 1);
    expect(() => b.set(0, 0, 1, 0, -1)).toThrow(Contradiction);
  });

  it("clone is independent", () => {
    const b = new Board(2, 3);
    const c = b.clone();
    c.set(0, 0, 1, 0, 1);
    c.propagate();
    expect(b.get(0, 0, 1, 0)).toBe(0); // original untouched
  });

  it("comparative constraint forbids the greater item from the lowest rank", () => {
    const b = new Board(2, 3); // cat 1 is the ordered category (ranks 0,1,2)
    b.addComparative({ greater: { cat: 0, item: 0 }, lesser: { cat: 0, item: 1 }, orderedCat: 1 });
    b.propagate();
    // entity(A0) must outrank entity(A1) in cat1 → A0 cannot be rank 0, A1 cannot be rank 2
    expect(b.get(0, 0, 1, 0)).toBe(-1);
    expect(b.get(0, 1, 1, 2)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/board.test.ts`
Expected: FAIL — cannot find module `board`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/board.ts
import type { Ref } from "./types";

export type Cell = -1 | 0 | 1;

export class Contradiction extends Error {
  constructor() {
    super("logic-grid contradiction");
    this.name = "Contradiction";
  }
}

interface Comparative {
  greater: Ref;
  lesser: Ref;
  orderedCat: number;
}

export class Board {
  readonly C: number;
  readonly M: number;
  private state = new Map<number, Int8Array>();
  private comparatives: Comparative[] = [];
  private changed = false;

  constructor(C: number, M: number) {
    this.C = C;
    this.M = M;
    for (let a = 0; a < C; a++) {
      for (let b = a + 1; b < C; b++) {
        this.state.set(a * C + b, new Int8Array(M * M));
      }
    }
  }

  private locate(a: number, ai: number, b: number, bi: number): [number, number] {
    if (a < b) return [a * this.C + b, ai * this.M + bi];
    return [b * this.C + a, bi * this.M + ai];
  }

  get(a: number, ai: number, b: number, bi: number): Cell {
    const [k, idx] = this.locate(a, ai, b, bi);
    return this.state.get(k)![idx] as Cell;
  }

  clone(): Board {
    const nb = new Board(this.C, this.M);
    for (const [k, arr] of this.state) nb.state.set(k, arr.slice());
    nb.comparatives = this.comparatives.slice();
    return nb;
  }

  addComparative(c: Comparative): void {
    this.comparatives.push(c);
  }

  /** Set a cell and cascade local consequences (bijection elimination + transitivity). */
  set(a: number, ai: number, b: number, bi: number, val: 1 | -1): void {
    const cur = this.get(a, ai, b, bi);
    if (cur === val) return;
    if (cur !== 0) throw new Contradiction();
    const [k, idx] = this.locate(a, ai, b, bi);
    this.state.get(k)![idx] = val;
    this.changed = true;

    if (val === 1) {
      for (let j = 0; j < this.M; j++) if (j !== bi) this.set(a, ai, b, j, -1);
      for (let i = 0; i < this.M; i++) if (i !== ai) this.set(a, i, b, bi, -1);
      for (let c = 0; c < this.C; c++) {
        if (c === a || c === b) continue;
        for (let ci = 0; ci < this.M; ci++) {
          const ac = this.get(a, ai, c, ci);
          if (ac === 1) this.set(b, bi, c, ci, 1);
          else if (ac === -1) this.set(b, bi, c, ci, -1);
          const bc = this.get(b, bi, c, ci);
          if (bc === 1) this.set(a, ai, c, ci, 1);
          else if (bc === -1) this.set(a, ai, c, ci, -1);
        }
      }
    } else {
      for (let c = 0; c < this.C; c++) {
        if (c === a || c === b) continue;
        for (let ci = 0; ci < this.M; ci++) {
          if (this.get(a, ai, c, ci) === 1) this.set(c, ci, b, bi, -1);
          if (this.get(b, bi, c, ci) === 1) this.set(c, ci, a, ai, -1);
        }
      }
    }
  }

  /** Run all global inference rules to a fixpoint. Throws Contradiction if unsatisfiable. */
  propagate(): void {
    do {
      this.changed = false;
      for (let a = 0; a < this.C; a++) {
        for (let b = a + 1; b < this.C; b++) this.inferBijection(a, b);
      }
      for (const c of this.comparatives) this.processComparative(c);
    } while (this.changed);
  }

  private inferBijection(a: number, b: number): void {
    for (let ai = 0; ai < this.M; ai++) {
      let open = 0, openJ = -1, hasYes = false;
      for (let bj = 0; bj < this.M; bj++) {
        const v = this.get(a, ai, b, bj);
        if (v === 1) hasYes = true;
        else if (v === 0) { open++; openJ = bj; }
      }
      if (!hasYes && open === 0) throw new Contradiction();
      if (!hasYes && open === 1) this.set(a, ai, b, openJ, 1);
    }
    for (let bi = 0; bi < this.M; bi++) {
      let open = 0, openI = -1, hasYes = false;
      for (let aj = 0; aj < this.M; aj++) {
        const v = this.get(a, aj, b, bi);
        if (v === 1) hasYes = true;
        else if (v === 0) { open++; openI = aj; }
      }
      if (!hasYes && open === 0) throw new Contradiction();
      if (!hasYes && open === 1) this.set(a, openI, b, bi, 1);
    }
  }

  private processComparative(c: Comparative): void {
    const O = c.orderedCat;
    const g = c.greater;
    const l = c.lesser;
    const gFeas: number[] = [];
    const lFeas: number[] = [];
    for (let r = 0; r < this.M; r++) {
      if (this.get(g.cat, g.item, O, r) !== -1) gFeas.push(r);
      if (this.get(l.cat, l.item, O, r) !== -1) lFeas.push(r);
    }
    if (gFeas.length === 0 || lFeas.length === 0) throw new Contradiction();
    const minL = Math.min(...lFeas);
    const maxG = Math.max(...gFeas);
    // greater must outrank some feasible lesser → greater's rank > minL
    for (let r = 0; r <= minL; r++) {
      if (this.get(g.cat, g.item, O, r) !== -1) this.set(g.cat, g.item, O, r, -1);
    }
    // lesser must be below some feasible greater → lesser's rank < maxG
    for (let r = maxG; r < this.M; r++) {
      if (this.get(l.cat, l.item, O, r) !== -1) this.set(l.cat, l.item, O, r, -1);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/board.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/board.ts generator/test/board.test.ts
git commit -m "feat(generator): constraint-propagation board with comparatives"
```

---

## Task 5: Apply structured clues to a Board

**Files:**
- Create: `generator/src/games/logic-grid/apply.ts`
- Test: `generator/test/apply.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/apply.test.ts
import { describe, it, expect } from "vitest";
import { Board } from "../src/games/logic-grid/board";
import { applyClue } from "../src/games/logic-grid/apply";

describe("applyClue", () => {
  it("applies an is clue as YES", () => {
    const b = new Board(2, 3);
    applyClue(b, { type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } });
    expect(b.get(0, 0, 1, 1)).toBe(1);
  });

  it("applies an isNot clue as NO", () => {
    const b = new Board(2, 3);
    applyClue(b, { type: "isNot", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } });
    expect(b.get(0, 0, 1, 1)).toBe(-1);
  });

  it("applies eitherOr by eliminating all non-option items", () => {
    const b = new Board(2, 3);
    applyClue(b, {
      type: "eitherOr",
      a: { cat: 0, item: 0 },
      options: [{ cat: 1, item: 0 }, { cat: 1, item: 2 }],
    });
    expect(b.get(0, 0, 1, 1)).toBe(-1); // item 1 eliminated
    expect(b.get(0, 0, 1, 0)).toBe(0);  // options remain open
    expect(b.get(0, 0, 1, 2)).toBe(0);
  });

  it("registers comparative clues on the board", () => {
    const b = new Board(2, 3);
    applyClue(b, { type: "comparative", greater: { cat: 0, item: 0 }, lesser: { cat: 0, item: 1 }, orderedCat: 1 });
    b.propagate();
    expect(b.get(0, 0, 1, 0)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/apply.test.ts`
Expected: FAIL — cannot find module `apply`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/apply.ts
import type { Board } from "./board";
import type { StructuredClue } from "./types";

export function applyClue(board: Board, clue: StructuredClue): void {
  switch (clue.type) {
    case "is":
      board.set(clue.a.cat, clue.a.item, clue.b.cat, clue.b.item, 1);
      break;
    case "isNot":
      board.set(clue.a.cat, clue.a.item, clue.b.cat, clue.b.item, -1);
      break;
    case "eitherOr": {
      const optCat = clue.options[0].cat;
      const keep = new Set(clue.options.map((o) => o.item));
      for (let i = 0; i < board.M; i++) {
        if (!keep.has(i)) board.set(clue.a.cat, clue.a.item, optCat, i, -1);
      }
      break;
    }
    case "comparative":
      board.addComparative({ greater: clue.greater, lesser: clue.lesser, orderedCat: clue.orderedCat });
      break;
  }
}

export function applyClues(board: Board, clues: StructuredClue[]): void {
  for (const c of clues) applyClue(board, c);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/apply.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/apply.ts generator/test/apply.test.ts
git commit -m "feat(generator): apply structured clues to board"
```

---

## Task 6: Solver — solution extraction, counting, uniqueness, no-guess

**Files:**
- Create: `generator/src/games/logic-grid/solver.ts`
- Test: `generator/test/solver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/solver.test.ts
import { describe, it, expect } from "vitest";
import { Board } from "../src/games/logic-grid/board";
import { applyClues } from "../src/games/logic-grid/apply";
import { countSolutions, uniqueSolutionExists, isNoGuessSolvable, extractSolution } from "../src/games/logic-grid/solver";
import type { StructuredClue } from "../src/games/logic-grid/types";

// 2 categories, 2 items: Kid {Ann,Ben} × Pet {Cat,Dog}
function board() { return new Board(2, 2); }

describe("solver", () => {
  it("counts both solutions when unconstrained", () => {
    const b = board();
    expect(countSolutions(b, 5)).toBe(2); // Ann-Cat/Ben-Dog OR Ann-Dog/Ben-Cat
  });

  it("a single is-clue makes a 2x2 unique", () => {
    const b = board();
    const clues: StructuredClue[] = [{ type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 0 } }];
    applyClues(b, clues);
    b.propagate();
    expect(countSolutions(b, 5)).toBe(1);
    expect(uniqueSolutionExists(2, 2, clues)).toBe(true);
    expect(isNoGuessSolvable(2, 2, clues)).toBe(true);
  });

  it("extracts the solution as anchor-relative assignment", () => {
    const b = board();
    applyClues(b, [{ type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } }]);
    b.propagate();
    const sol = extractSolution(b);
    expect(sol[0]).toEqual([0, 1]); // anchor identity
    expect(sol[1]![0]).toBe(1);     // entity 0 (Ann) → Pet item 1 (Dog)
    expect(sol[1]![1]).toBe(0);     // entity 1 (Ben) → Pet item 0 (Cat)
  });

  it("detects non-unique vs unique", () => {
    expect(uniqueSolutionExists(2, 2, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/solver.test.ts`
Expected: FAIL — cannot find module `solver`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/solver.ts
import { Board, Contradiction } from "./board";
import { applyClues } from "./apply";
import type { Solution, StructuredClue } from "./types";

/** True iff propagation alone fully determined the board (no open cells anywhere). */
function isComplete(b: Board): boolean {
  for (let a = 0; a < b.C; a++) {
    for (let bb = a + 1; bb < b.C; bb++) {
      for (let ai = 0; ai < b.M; ai++) {
        let hasYes = false;
        for (let bi = 0; bi < b.M; bi++) if (b.get(a, ai, bb, bi) === 1) hasYes = true;
        if (!hasYes) return false;
      }
    }
  }
  return true;
}

/** Pick the most-constrained open row (cat pair + ai) for branching; null if complete. */
function pickBranch(b: Board): { a: number; ai: number; bb: number; options: number[] } | null {
  let best: { a: number; ai: number; bb: number; options: number[] } | null = null;
  for (let a = 0; a < b.C; a++) {
    for (let bb = a + 1; bb < b.C; bb++) {
      for (let ai = 0; ai < b.M; ai++) {
        let hasYes = false;
        const options: number[] = [];
        for (let bi = 0; bi < b.M; bi++) {
          const v = b.get(a, ai, bb, bi);
          if (v === 1) hasYes = true;
          else if (v === 0) options.push(bi);
        }
        if (hasYes || options.length === 0) continue;
        if (best === null || options.length < best.options.length) {
          best = { a, ai, bb, options };
          if (options.length === 2) return best;
        }
      }
    }
  }
  return best;
}

/** Count solutions of an already-propagated, consistent board, up to `limit`. */
export function countSolutions(board: Board, limit: number): number {
  let work = board.clone();
  try {
    work.propagate();
  } catch (e) {
    if (e instanceof Contradiction) return 0;
    throw e;
  }
  const branch = pickBranch(work);
  if (branch === null) return isComplete(work) ? 1 : 0;
  let total = 0;
  for (const bi of branch.options) {
    const next = work.clone();
    try {
      next.set(branch.a, branch.ai, branch.bb, bi, 1);
      next.propagate();
    } catch (e) {
      if (e instanceof Contradiction) continue;
      throw e;
    }
    total += countSolutions(next, limit - total);
    if (total >= limit) return total;
  }
  return total;
}

function buildBoard(C: number, M: number, clues: StructuredClue[]): Board {
  const b = new Board(C, M);
  applyClues(b, clues);
  return b;
}

export function uniqueSolutionExists(C: number, M: number, clues: StructuredClue[]): boolean {
  const b = buildBoard(C, M, clues);
  try {
    b.propagate();
  } catch (e) {
    if (e instanceof Contradiction) return false;
    throw e;
  }
  return countSolutions(b, 2) === 1;
}

/** True iff pure propagation (no branching) fully solves the puzzle. */
export function isNoGuessSolvable(C: number, M: number, clues: StructuredClue[]): boolean {
  const b = buildBoard(C, M, clues);
  try {
    b.propagate();
  } catch (e) {
    if (e instanceof Contradiction) return false;
    throw e;
  }
  return isComplete(b);
}

/** Read a fully-determined board into a Solution (anchor-relative). */
export function extractSolution(b: Board): Solution {
  const sol: Solution = [];
  for (let c = 0; c < b.C; c++) sol.push(new Array(b.M).fill(-1));
  for (let e = 0; e < b.M; e++) sol[0]![e] = e;
  for (let c = 1; c < b.C; c++) {
    for (let e = 0; e < b.M; e++) {
      for (let i = 0; i < b.M; i++) {
        if (b.get(0, e, c, i) === 1) { sol[c]![e] = i; break; }
      }
    }
  }
  return sol;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/solver.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/solver.ts generator/test/solver.test.ts
git commit -m "feat(generator): solver — count/unique/no-guess/extract"
```

---

## Task 7: Solution generation

**Files:**
- Create: `generator/src/games/logic-grid/solution.ts`
- Test: `generator/test/solution.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/solution.test.ts
import { describe, it, expect } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateSolution } from "../src/games/logic-grid/solution";

describe("generateSolution", () => {
  it("anchor category is identity", () => {
    const sol = generateSolution(4, 5, makeRng(1));
    expect(sol[0]).toEqual([0, 1, 2, 3, 4]);
  });

  it("every non-anchor category is a permutation of 0..M-1", () => {
    const sol = generateSolution(4, 5, makeRng(2));
    for (let c = 1; c < 4; c++) {
      expect([...sol[c]!].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("is deterministic for a seed", () => {
    expect(generateSolution(3, 4, makeRng(9))).toEqual(generateSolution(3, 4, makeRng(9)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/solution.test.ts`
Expected: FAIL — cannot find module `solution`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/solution.ts
import { shuffle, type Rng } from "../../core/rng";
import type { Solution } from "./types";

export function generateSolution(C: number, M: number, rng: Rng): Solution {
  const sol: Solution = [];
  const identity = Array.from({ length: M }, (_, i) => i);
  sol.push([...identity]); // anchor
  for (let c = 1; c < C; c++) {
    sol.push(shuffle([...identity], rng));
  }
  return sol;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/solution.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/solution.ts generator/test/solution.test.ts
git commit -m "feat(generator): seeded solution generation"
```

---

## Task 8: Candidate clue enumeration

Generate logically-true clues from a known solution. `is`/`isNot` are exhaustive; `eitherOr`/`comparative` are sampled. Helper `entityOf` maps a Ref to its entity index under the solution.

**Files:**
- Create: `generator/src/games/logic-grid/clues.ts`
- Test: `generator/test/clues.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/clues.test.ts
import { describe, it, expect } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateSolution } from "../src/games/logic-grid/solution";
import { enumerateClues, entityOf, clueIsTrue } from "../src/games/logic-grid/clues";

describe("clue enumeration", () => {
  it("entityOf finds the entity for a ref under the solution", () => {
    const sol = generateSolution(3, 3, makeRng(1)); // sol[0] identity
    // anchor item i belongs to entity i
    expect(entityOf(sol, { cat: 0, item: 2 })).toBe(2);
    // for category 1, the item sol[1][e] belongs to entity e
    expect(entityOf(sol, { cat: 1, item: sol[1]![0]! })).toBe(0);
  });

  it("every enumerated clue is true under the solution", () => {
    const sol = generateSolution(4, 4, makeRng(5));
    const ordered = new Set([3]); // pretend category 3 is ordered
    const clues = enumerateClues(sol, { allowAdvanced: ["eitherOr", "comparative"], orderedCats: ordered }, makeRng(5));
    expect(clues.length).toBeGreaterThan(0);
    for (const c of clues) expect(clueIsTrue(sol, c)).toBe(true);
  });

  it("omits comparatives when no ordered categories", () => {
    const sol = generateSolution(3, 3, makeRng(7));
    const clues = enumerateClues(sol, { allowAdvanced: ["comparative"], orderedCats: new Set() }, makeRng(7));
    expect(clues.some((c) => c.type === "comparative")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/clues.test.ts`
Expected: FAIL — cannot find module `clues`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/clues.ts
import { shuffle, type Rng } from "../../core/rng";
import type { Ref, Solution, StructuredClue } from "./types";

/** Which entity does this ref belong to under the solution? (find e where sol[cat][e] === item) */
export function entityOf(sol: Solution, ref: Ref): number {
  const row = sol[ref.cat]!;
  for (let e = 0; e < row.length; e++) if (row[e] === ref.item) return e;
  throw new Error("ref not found in solution");
}

export function clueIsTrue(sol: Solution, clue: StructuredClue): boolean {
  switch (clue.type) {
    case "is":
      return entityOf(sol, clue.a) === entityOf(sol, clue.b);
    case "isNot":
      return entityOf(sol, clue.a) !== entityOf(sol, clue.b);
    case "eitherOr": {
      const e = entityOf(sol, clue.a);
      return clue.options.some((o) => entityOf(sol, o) === e);
    }
    case "comparative": {
      const O = clue.orderedCat;
      // rank of an entity in O = the item index assigned (items are in rank order)
      const rank = (ref: Ref) => sol[O]![entityOf(sol, ref)]!;
      return rank(clue.greater) > rank(clue.lesser);
    }
  }
}

export interface EnumerateOptions {
  allowAdvanced: ("eitherOr" | "comparative")[];
  orderedCats: Set<number>;
  /** how many advanced clues of each allowed type to sample (default 40) */
  advancedSample?: number;
}

export function enumerateClues(sol: Solution, opts: EnumerateOptions, rng: Rng): StructuredClue[] {
  const C = sol.length;
  const M = sol[0]!.length;
  const out: StructuredClue[] = [];

  // Exhaustive is / isNot for every category pair and item pair.
  for (let a = 0; a < C; a++) {
    for (let b = a + 1; b < C; b++) {
      for (let ai = 0; ai < M; ai++) {
        for (let bi = 0; bi < M; bi++) {
          const aRef: Ref = { cat: a, item: ai };
          const bRef: Ref = { cat: b, item: bi };
          const same = entityOf(sol, aRef) === entityOf(sol, bRef);
          out.push(same
            ? { type: "is", a: aRef, b: bRef }
            : { type: "isNot", a: aRef, b: bRef });
        }
      }
    }
  }

  const sample = opts.advancedSample ?? 40;

  if (opts.allowAdvanced.includes("eitherOr")) {
    // For a true is(a,b), pick a distractor item in b's category to form a true either-or.
    const pool: StructuredClue[] = [];
    for (let a = 0; a < C; a++) {
      for (let b = 0; b < C; b++) {
        if (a === b) continue;
        for (let ai = 0; ai < M; ai++) {
          const trueItem = sol[b]![entityOf(sol, { cat: a, item: ai })]!;
          for (let k = 0; k < M; k++) {
            if (k === trueItem) continue;
            pool.push({ type: "eitherOr", a: { cat: a, item: ai }, options: [{ cat: b, item: trueItem }, { cat: b, item: k }] });
          }
        }
      }
    }
    out.push(...shuffle(pool, rng).slice(0, sample));
  }

  if (opts.allowAdvanced.includes("comparative")) {
    const pool: StructuredClue[] = [];
    for (const O of opts.orderedCats) {
      for (let a = 0; a < C; a++) {
        for (let b = 0; b < C; b++) {
          for (let ai = 0; ai < M; ai++) {
            for (let bi = 0; bi < M; bi++) {
              const g: Ref = { cat: a, item: ai };
              const l: Ref = { cat: b, item: bi };
              if (entityOf(sol, g) === entityOf(sol, l)) continue;
              const clue: StructuredClue = { type: "comparative", greater: g, lesser: l, orderedCat: O };
              if (clueIsTrue(sol, clue)) pool.push(clue);
            }
          }
        }
      }
    }
    out.push(...shuffle(pool, rng).slice(0, sample));
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/clues.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/clues.ts generator/test/clues.test.ts
git commit -m "feat(generator): candidate clue enumeration"
```

---

## Task 9: Minimal no-guess clue reduction

**Files:**
- Create: `generator/src/games/logic-grid/reduce.ts`
- Test: `generator/test/reduce.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/reduce.test.ts
import { describe, it, expect } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateSolution } from "../src/games/logic-grid/solution";
import { enumerateClues } from "../src/games/logic-grid/clues";
import { reduceClues } from "../src/games/logic-grid/reduce";
import { uniqueSolutionExists, isNoGuessSolvable } from "../src/games/logic-grid/solver";

describe("reduceClues", () => {
  it("produces a unique, no-guess-solvable, smaller clue set", () => {
    const C = 4, M = 4;
    const sol = generateSolution(C, M, makeRng(3));
    const all = enumerateClues(sol, { allowAdvanced: [], orderedCats: new Set() }, makeRng(3));
    const reduced = reduceClues(C, M, all, { redundancy: 0 }, makeRng(3));
    expect(reduced.length).toBeLessThan(all.length);
    expect(uniqueSolutionExists(C, M, reduced)).toBe(true);
    expect(isNoGuessSolvable(C, M, reduced)).toBe(true);
  });

  it("removing any clue from a redundancy-0 set breaks uniqueness or no-guess", () => {
    const C = 3, M = 3;
    const sol = generateSolution(C, M, makeRng(11));
    const all = enumerateClues(sol, { allowAdvanced: [], orderedCats: new Set() }, makeRng(11));
    const reduced = reduceClues(C, M, all, { redundancy: 0 }, makeRng(11));
    for (let i = 0; i < reduced.length; i++) {
      const without = reduced.filter((_, j) => j !== i);
      const stillGood = uniqueSolutionExists(C, M, without) && isNoGuessSolvable(C, M, without);
      expect(stillGood).toBe(false);
    }
  });

  it("redundancy adds back removed clues", () => {
    const C = 4, M = 4;
    const sol = generateSolution(C, M, makeRng(4));
    const all = enumerateClues(sol, { allowAdvanced: [], orderedCats: new Set() }, makeRng(4));
    const lean = reduceClues(C, M, all, { redundancy: 0 }, makeRng(4));
    const padded = reduceClues(C, M, all, { redundancy: 3 }, makeRng(4));
    expect(padded.length).toBeGreaterThan(lean.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/reduce.test.ts`
Expected: FAIL — cannot find module `reduce`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/reduce.ts
import { shuffle, type Rng } from "../../core/rng";
import type { StructuredClue } from "./types";
import { uniqueSolutionExists, isNoGuessSolvable } from "./solver";

export interface ReduceOptions {
  /** number of removed clues to add back for easier puzzles (0 = minimal/hardest) */
  redundancy: number;
}

/** Order clues so direct facts are tried for removal first → advanced clues are retained. */
function removalOrder(clues: StructuredClue[], rng: Rng): StructuredClue[] {
  const rank = (c: StructuredClue) => (c.type === "is" || c.type === "isNot" ? 0 : 1);
  return shuffle([...clues], rng).sort((a, b) => rank(a) - rank(b));
}

export function reduceClues(
  C: number,
  M: number,
  all: StructuredClue[],
  opts: ReduceOptions,
  rng: Rng,
): StructuredClue[] {
  let kept = [...all];
  const removed: StructuredClue[] = [];
  for (const clue of removalOrder(all, rng)) {
    const trial = kept.filter((c) => c !== clue);
    if (uniqueSolutionExists(C, M, trial) && isNoGuessSolvable(C, M, trial)) {
      kept = trial;
      removed.push(clue);
    }
  }
  if (opts.redundancy > 0 && removed.length > 0) {
    kept.push(...shuffle(removed, rng).slice(0, opts.redundancy));
  }
  return kept;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/reduce.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/reduce.ts generator/test/reduce.test.ts
git commit -m "feat(generator): minimal no-guess clue reduction"
```

---

## Task 10: Difficulty presets

**Files:**
- Create: `generator/src/games/logic-grid/difficulty.ts`
- Test: `generator/test/difficulty.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/difficulty.test.ts
import { describe, it, expect } from "vitest";
import { resolveDifficulty, PRESETS } from "../src/games/logic-grid/difficulty";

describe("difficulty", () => {
  it("ships presets for grades 1-8", () => {
    for (let g = 1; g <= 8; g++) expect(PRESETS[`g${g}`]).toBeDefined();
  });

  it("resolves a preset id to knobs", () => {
    const d = resolveDifficulty("g5");
    expect(d.categories).toBeGreaterThanOrEqual(3);
    expect(d.items).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(d.advanced)).toBe(true);
  });

  it("applies overrides", () => {
    const d = resolveDifficulty("g1", { categories: 5, items: 6 });
    expect(d.categories).toBe(5);
    expect(d.items).toBe(6);
  });

  it("throws on unknown preset", () => {
    expect(() => resolveDifficulty("nope")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/difficulty.test.ts`
Expected: FAIL — cannot find module `difficulty`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/difficulty.ts
export interface Difficulty {
  id: string;
  categories: number;
  items: number;
  advanced: ("eitherOr" | "comparative")[];
  redundancy: number;
  readingLevel: string;
}

export const PRESETS: Record<string, Difficulty> = {
  g1: { id: "g1", categories: 3, items: 3, advanced: [], redundancy: 2, readingLevel: "grade 1" },
  g2: { id: "g2", categories: 3, items: 3, advanced: [], redundancy: 1, readingLevel: "grade 2" },
  g3: { id: "g3", categories: 3, items: 4, advanced: [], redundancy: 1, readingLevel: "grade 3" },
  g4: { id: "g4", categories: 4, items: 4, advanced: ["eitherOr"], redundancy: 1, readingLevel: "grade 4" },
  g5: { id: "g5", categories: 4, items: 4, advanced: ["eitherOr", "comparative"], redundancy: 0, readingLevel: "grade 5" },
  g6: { id: "g6", categories: 4, items: 5, advanced: ["eitherOr", "comparative"], redundancy: 0, readingLevel: "grade 6" },
  g7: { id: "g7", categories: 5, items: 5, advanced: ["eitherOr", "comparative"], redundancy: 0, readingLevel: "grade 7" },
  g8: { id: "g8", categories: 5, items: 6, advanced: ["eitherOr", "comparative"], redundancy: 0, readingLevel: "grade 8" },
};

export function resolveDifficulty(id: string, overrides: Partial<Difficulty> = {}): Difficulty {
  const base = PRESETS[id];
  if (!base) throw new Error(`unknown difficulty preset: ${id}`);
  return { ...base, ...overrides };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/difficulty.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/difficulty.ts generator/test/difficulty.test.ts
git commit -m "feat(generator): grade 1-8 difficulty presets"
```

---

## Task 11: Theme packs

**Files:**
- Create: `generator/src/games/logic-grid/themes.ts`
- Create: `generator/src/games/logic-grid/themes/pets.json`
- Create: `generator/src/games/logic-grid/themes/space.json`
- Test: `generator/test/themes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/themes.test.ts
import { describe, it, expect } from "vitest";
import { loadThemePacks, pickTheme, sliceTheme } from "../src/games/logic-grid/themes";

describe("themes", () => {
  it("loads bundled theme packs", () => {
    const packs = loadThemePacks();
    expect(packs.length).toBeGreaterThanOrEqual(2);
    for (const p of packs) {
      expect(p.title).toBeTruthy();
      expect(p.categories.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("picks a theme that can supply the requested size", () => {
    const t = pickTheme(loadThemePacks(), 3, 3, false);
    expect(t.categories.length).toBeGreaterThanOrEqual(3);
  });

  it("slices a theme down to the requested categories x items, honoring ordered need", () => {
    const t = pickTheme(loadThemePacks(), 4, 4, true);
    const sliced = sliceTheme(t, 4, 4, true);
    expect(sliced.categories).toHaveLength(4);
    for (const c of sliced.categories) expect(c.items).toHaveLength(4);
    expect(sliced.categories.some((c) => c.ordered)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/themes.test.ts`
Expected: FAIL — cannot find module `themes`.

- [ ] **Step 3: Create the theme pack data files**

```json
// generator/src/games/logic-grid/themes/pets.json
{
  "title": "The Great Pet Mix-Up",
  "blurb": "Every kid on Maple Street swears they remember whose pet is whose. They do not.",
  "categories": [
    { "name": "Kid", "items": ["Ava", "Ben", "Cora", "Dev", "Eli", "Faye"] },
    { "name": "Pet", "items": ["Cat", "Dog", "Frog", "Hamster", "Parrot", "Turtle"] },
    { "name": "Color", "items": ["Red", "Blue", "Green", "Pink", "Orange", "Purple"] },
    { "name": "Snack", "items": ["Pretzels", "Grapes", "Cookies", "Popcorn", "Carrots", "Cheese"] },
    { "name": "Age", "ordered": true, "items": ["7", "8", "9", "10", "11", "12"] }
  ]
}
```

```json
// generator/src/games/logic-grid/themes/space.json
{
  "title": "Trouble on Space Station Zip",
  "blurb": "Five astronauts, five jobs, and somebody reprogrammed the snack dispenser. Sort it out.",
  "categories": [
    { "name": "Astronaut", "items": ["Nova", "Pip", "Quill", "Rho", "Sol", "Vex"] },
    { "name": "Job", "items": ["Pilot", "Cook", "Medic", "Engineer", "Botanist", "Captain"] },
    { "name": "Module", "items": ["Red Bay", "Blue Bay", "Lab", "Dome", "Galley", "Bridge"] },
    { "name": "Pet Robot", "items": ["Bolt", "Chip", "Dot", "Gizmo", "Widget", "Zap"] },
    { "name": "Deck", "ordered": true, "items": ["1", "2", "3", "4", "5", "6"] }
  ]
}
```

- [ ] **Step 4: Write the implementation**

```ts
// generator/src/games/logic-grid/themes.ts
import petsRaw from "./themes/pets.json" with { type: "json" };
import spaceRaw from "./themes/space.json" with { type: "json" };
import type { Category } from "./types";

export interface ThemePack {
  title: string;
  blurb: string;
  categories: Category[];
}

export function loadThemePacks(): ThemePack[] {
  return [petsRaw as ThemePack, spaceRaw as ThemePack];
}

export function pickTheme(packs: ThemePack[], categories: number, items: number, needOrdered: boolean): ThemePack {
  const usable = packs.filter((p) => {
    const enoughCats = p.categories.length >= categories;
    const enoughItems = p.categories.every((c) => c.items.length >= items);
    const hasOrdered = !needOrdered || p.categories.some((c) => c.ordered && c.items.length >= items);
    return enoughCats && enoughItems && hasOrdered;
  });
  if (usable.length === 0) throw new Error(`no theme pack supports ${categories}x${items} (ordered=${needOrdered})`);
  return usable[0]!;
}

/** Reduce a theme to exactly `categories` categories of `items` items each. */
export function sliceTheme(theme: ThemePack, categories: number, items: number, needOrdered: boolean): ThemePack {
  const ordered = theme.categories.filter((c) => c.ordered);
  const unordered = theme.categories.filter((c) => !c.ordered);
  const chosen: Category[] = [];
  if (needOrdered && ordered[0]) chosen.push(ordered[0]);
  for (const c of unordered) {
    if (chosen.length >= categories) break;
    chosen.push(c);
  }
  for (const c of ordered) {
    if (chosen.length >= categories) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  const sliced = chosen.slice(0, categories).map((c) => ({
    name: c.name,
    ordered: c.ordered,
    items: c.items.slice(0, items),
  }));
  return { title: theme.title, blurb: theme.blurb, categories: sliced };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd generator && npx vitest run test/themes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add generator/src/games/logic-grid/themes.ts generator/src/games/logic-grid/themes/
git add generator/test/themes.test.ts
git commit -m "feat(generator): curated theme packs + slicing"
```

---

## Task 12: Phrasing (interface + deterministic template phraser)

**Files:**
- Create: `generator/src/games/logic-grid/phrasing.ts`
- Test: `generator/test/phrasing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/phrasing.test.ts
import { describe, it, expect } from "vitest";
import { TemplatePhraser } from "../src/games/logic-grid/phrasing";
import type { Category } from "../src/games/logic-grid/types";

const cats: Category[] = [
  { name: "Kid", items: ["Ann", "Ben", "Cal"] },
  { name: "Pet", items: ["Cat", "Dog", "Fish"] },
  { name: "Age", ordered: true, items: ["7", "8", "9"] },
];

describe("TemplatePhraser", () => {
  const p = new TemplatePhraser();
  const ctx = { categories: cats, readingLevel: "grade 5", themeBlurb: "" };

  it("phrases is/isNot deterministically", () => {
    expect(p.phrase({ type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } }, ctx))
      .toBe("Ann goes with Dog.");
    expect(p.phrase({ type: "isNot", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } }, ctx))
      .toBe("Ann does not go with Dog.");
  });

  it("phrases eitherOr", () => {
    expect(p.phrase({ type: "eitherOr", a: { cat: 0, item: 2 }, options: [{ cat: 1, item: 0 }, { cat: 1, item: 2 }] }, ctx))
      .toBe("Cal goes with either Cat or Fish.");
  });

  it("phrases comparative using the ordered category name", () => {
    expect(p.phrase({ type: "comparative", greater: { cat: 0, item: 0 }, lesser: { cat: 1, item: 0 }, orderedCat: 2 }, ctx))
      .toBe("Ann has a higher Age than Cat.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/phrasing.test.ts`
Expected: FAIL — cannot find module `phrasing`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/phrasing.ts
import type { Category, Ref, StructuredClue } from "./types";

export interface PhraseContext {
  categories: Category[];
  readingLevel: string;
  themeBlurb: string;
}

export interface Phraser {
  phrase(clue: StructuredClue, ctx: PhraseContext): string;
}

function label(ctx: PhraseContext, ref: Ref): string {
  return ctx.categories[ref.cat]!.items[ref.item]!;
}

/** Deterministic, logic-faithful phrasing. Used in tests/CI and as the offline default. */
export class TemplatePhraser implements Phraser {
  phrase(clue: StructuredClue, ctx: PhraseContext): string {
    switch (clue.type) {
      case "is":
        return `${label(ctx, clue.a)} goes with ${label(ctx, clue.b)}.`;
      case "isNot":
        return `${label(ctx, clue.a)} does not go with ${label(ctx, clue.b)}.`;
      case "eitherOr":
        return `${label(ctx, clue.a)} goes with either ${label(ctx, clue.options[0])} or ${label(ctx, clue.options[1])}.`;
      case "comparative": {
        const catName = ctx.categories[clue.orderedCat]!.name;
        return `${label(ctx, clue.greater)} has a higher ${catName} than ${label(ctx, clue.lesser)}.`;
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/phrasing.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/phrasing.ts generator/test/phrasing.test.ts
git commit -m "feat(generator): phraser interface + deterministic template phraser"
```

---

## Task 13: Serialization (id/slug + Puzzle assembly)

**Files:**
- Create: `generator/src/games/logic-grid/serialize.ts`
- Test: `generator/test/serialize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/serialize.test.ts
import { describe, it, expect } from "vitest";
import { slugify, makePuzzleId } from "../src/games/logic-grid/serialize";

describe("serialize helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("The Great Pet Mix-Up!")).toBe("the-great-pet-mix-up");
  });

  it("builds a stable id from date, slug, and seed", () => {
    expect(makePuzzleId("2026-06-04", "pets", 42)).toBe("2026-06-04-pets-42");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/serialize.test.ts`
Expected: FAIL — cannot find module `serialize`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/serialize.ts
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makePuzzleId(dateIso: string, slug: string, seed: number): string {
  return `${dateIso}-${slug}-${seed}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/serialize.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/serialize.ts generator/test/serialize.test.ts
git commit -m "feat(generator): id/slug serialization helpers"
```

---

## Task 14: The generatePuzzle pipeline

**Files:**
- Create: `generator/src/games/logic-grid/generate.ts`
- Test: `generator/test/generate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// generator/test/generate.test.ts
import { describe, it, expect } from "vitest";
import { generatePuzzle } from "../src/games/logic-grid/generate";
import { uniqueSolutionExists, isNoGuessSolvable } from "../src/games/logic-grid/solver";
import { clueIsTrue } from "../src/games/logic-grid/clues";

describe("generatePuzzle", () => {
  it("produces a unique, no-guess puzzle with true, phrased clues", () => {
    const p = generatePuzzle({ difficulty: "g4", seed: 123, date: "2026-06-04" });
    const C = p.categories.length;
    const M = p.categories[0]!.items.length;
    const structured = p.clues.map((c) => c.structured);
    expect(uniqueSolutionExists(C, M, structured)).toBe(true);
    expect(isNoGuessSolvable(C, M, structured)).toBe(true);
    for (const c of p.clues) {
      expect(clueIsTrue(p.solution, c.structured)).toBe(true);
      expect(c.text.length).toBeGreaterThan(0);
    }
    expect(p.id).toContain("2026-06-04");
    expect(p.gameType).toBe("logic-grid");
  });

  it("is deterministic for a seed", () => {
    const a = generatePuzzle({ difficulty: "g3", seed: 7, date: "2026-06-04" });
    const b = generatePuzzle({ difficulty: "g3", seed: 7, date: "2026-06-04" });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("respects category/item overrides", () => {
    const p = generatePuzzle({ difficulty: "g1", seed: 1, date: "2026-06-04", overrides: { categories: 4, items: 4 } });
    expect(p.categories).toHaveLength(4);
    expect(p.categories[0]!.items).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/generate.test.ts`
Expected: FAIL — cannot find module `generate`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/games/logic-grid/generate.ts
import { makeRng } from "../../core/rng";
import { resolveDifficulty, type Difficulty } from "./difficulty";
import { loadThemePacks, pickTheme, sliceTheme } from "./themes";
import { generateSolution } from "./solution";
import { enumerateClues } from "./clues";
import { reduceClues } from "./reduce";
import { uniqueSolutionExists, isNoGuessSolvable } from "./solver";
import { TemplatePhraser, type Phraser } from "./phrasing";
import { slugify, makePuzzleId } from "./serialize";
import type { Puzzle } from "./types";

export interface GenerateOptions {
  difficulty: string;
  seed: number;
  date: string; // ISO date, e.g. "2026-06-04"
  overrides?: Partial<Difficulty>;
  gradeLabel?: string;
  phraser?: Phraser;
}

export function generatePuzzle(opts: GenerateOptions): Puzzle {
  const diff = resolveDifficulty(opts.difficulty, opts.overrides);
  const rng = makeRng(opts.seed);
  const needOrdered = diff.advanced.includes("comparative");

  const theme = sliceTheme(
    pickTheme(loadThemePacks(), diff.categories, diff.items, needOrdered),
    diff.categories,
    diff.items,
    needOrdered,
  );

  const C = diff.categories;
  const M = diff.items;
  const orderedCats = new Set<number>();
  theme.categories.forEach((c, i) => { if (c.ordered) orderedCats.add(i); });

  const sol = generateSolution(C, M, rng);
  const all = enumerateClues(sol, { allowAdvanced: diff.advanced, orderedCats }, rng);
  const structured = reduceClues(C, M, all, { redundancy: diff.redundancy }, rng);

  // Safety: the reducer guarantees these, but assert to fail loud on regressions.
  if (!uniqueSolutionExists(C, M, structured) || !isNoGuessSolvable(C, M, structured)) {
    throw new Error("generated puzzle failed solvability validation");
  }

  const phraser = opts.phraser ?? new TemplatePhraser();
  const ctx = { categories: theme.categories, readingLevel: diff.readingLevel, themeBlurb: theme.blurb };
  const clues = structured.map((s, i) => ({
    id: `c${i + 1}`,
    structured: s,
    text: phraser.phrase(s, ctx),
  }));

  const slug = slugify(theme.title);
  return {
    id: makePuzzleId(opts.date, slug, opts.seed),
    title: theme.title,
    themeBlurb: theme.blurb,
    gameType: "logic-grid",
    gradeLabel: opts.gradeLabel ?? diff.readingLevel,
    difficulty: diff.id,
    categories: theme.categories,
    solution: sol,
    clues,
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/generate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add generator/src/games/logic-grid/generate.ts generator/test/generate.test.ts
git commit -m "feat(generator): generatePuzzle pipeline"
```

---

## Task 15: Property test — many seeds and grades stay valid

**Files:**
- Test: `generator/test/property.test.ts`

- [ ] **Step 1: Write the test**

```ts
// generator/test/property.test.ts
import { describe, it, expect } from "vitest";
import { generatePuzzle } from "../src/games/logic-grid/generate";
import { uniqueSolutionExists, isNoGuessSolvable } from "../src/games/logic-grid/solver";
import { clueIsTrue } from "../src/games/logic-grid/clues";

describe("property: generated puzzles are always valid", () => {
  const grades = ["g1", "g2", "g3", "g4", "g5"];
  for (const g of grades) {
    for (let seed = 0; seed < 6; seed++) {
      it(`${g} seed ${seed}: unique, no-guess, all clues true`, () => {
        const p = generatePuzzle({ difficulty: g, seed, date: "2026-06-04" });
        const C = p.categories.length;
        const M = p.categories[0]!.items.length;
        const structured = p.clues.map((c) => c.structured);
        expect(uniqueSolutionExists(C, M, structured)).toBe(true);
        expect(isNoGuessSolvable(C, M, structured)).toBe(true);
        for (const c of p.clues) expect(clueIsTrue(p.solution, c.structured)).toBe(true);
      });
    }
  }
});
```

- [ ] **Step 2: Run the test**

Run: `cd generator && npx vitest run test/property.test.ts`
Expected: PASS (30 tests). If any grade/seed is slow (>2s) or fails, reduce default grid sizes in `difficulty.ts` for that grade and re-run.

- [ ] **Step 3: Run the full suite**

Run: `cd generator && npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add generator/test/property.test.ts
git commit -m "test(generator): property tests across grades and seeds"
```

---

## Task 16: CLI `generate`

**Files:**
- Create: `generator/src/cli.ts`
- Test: `generator/test/cli.test.ts`

- [ ] **Step 1: Write the failing test** (test the pure arg-parsing + output path helper, not process spawning)

```ts
// generator/test/cli.test.ts
import { describe, it, expect } from "vitest";
import { parseArgs, outputPathFor } from "../src/cli";

describe("cli parseArgs", () => {
  it("parses flags with defaults", () => {
    const a = parseArgs(["--difficulty", "g5", "--seed", "42", "--date", "2026-06-04"]);
    expect(a.difficulty).toBe("g5");
    expect(a.seed).toBe(42);
    expect(a.date).toBe("2026-06-04");
  });

  it("parses category/item overrides", () => {
    const a = parseArgs(["--difficulty", "g1", "--categories", "4", "--items", "5"]);
    expect(a.overrides).toEqual({ categories: 4, items: 5 });
  });

  it("computes the output path inside the site content dir", () => {
    expect(outputPathFor("2026-06-04-pets-42")).toBe("../site/src/content/puzzles/2026-06-04-pets-42.json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd generator && npx vitest run test/cli.test.ts`
Expected: FAIL — cannot find module `cli`.

- [ ] **Step 3: Write the implementation**

```ts
// generator/src/cli.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePuzzle } from "./games/logic-grid/generate";
import type { Difficulty } from "./games/logic-grid/difficulty";

export interface CliArgs {
  difficulty: string;
  seed: number;
  date: string;
  gradeLabel?: string;
  overrides?: Partial<Difficulty>;
}

export function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const overrides: Partial<Difficulty> = {};
  const cats = get("--categories");
  const items = get("--items");
  if (cats) overrides.categories = Number(cats);
  if (items) overrides.items = Number(items);

  return {
    difficulty: get("--difficulty") ?? "g5",
    seed: Number(get("--seed") ?? "1"),
    date: get("--date") ?? new Date().toISOString().slice(0, 10),
    gradeLabel: get("--grade"),
    overrides: Object.keys(overrides).length ? overrides : undefined,
  };
}

/** Path (relative to generator/) of the JSON file for a given puzzle id. */
export function outputPathFor(id: string): string {
  return `../site/src/content/puzzles/${id}.json`;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url)); // generator/src
  const args = parseArgs(process.argv.slice(2));
  const puzzle = generatePuzzle(args);
  const rel = outputPathFor(puzzle.id);
  const abs = resolve(here, "..", rel.replace(/^\.\.\//, "")); // generator/../site/...
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(puzzle, null, 2) + "\n");
  console.log(`Wrote ${abs}`);
  console.log(`Title: ${puzzle.title} — ${puzzle.clues.length} clues — difficulty ${puzzle.difficulty}`);
}

// Run only when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd generator && npx vitest run test/cli.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Smoke-run the CLI for real**

Run: `cd generator && npm run generate -- --difficulty g4 --seed 42 --date 2026-06-04`
Expected: prints "Wrote .../site/src/content/puzzles/2026-06-04-the-great-pet-mix-up-42.json" and a title/clue-count line. Confirm the JSON file exists and contains `clues` with non-empty `text`.

- [ ] **Step 6: Commit**

```bash
git add generator/src/cli.ts generator/test/cli.test.ts site/src/content/puzzles/
git commit -m "feat(generator): generate CLI writes puzzle JSON into the site"
```

---

# PHASE 2 — Astro Site

## Task 17: Scaffold the Astro site + content schema

**Files:**
- Create: `site/package.json`
- Create: `site/astro.config.mjs`
- Create: `site/tsconfig.json`
- Create: `site/src/content/config.ts`

- [ ] **Step 1: Create `site/package.json`**

```json
{
  "name": "games-marshellis",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^4.16.0"
  }
}
```

- [ ] **Step 2: Create `site/astro.config.mjs`**

```js
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://games.marshellis.com",
});
```

- [ ] **Step 3: Create `site/tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro", "src"]
}
```

- [ ] **Step 4: Create `site/src/content/config.ts`** (Zod schema mirroring the Puzzle type)

```ts
import { defineCollection, z } from "astro:content";

const ref = z.object({ cat: z.number(), item: z.number() });

const structured = z.discriminatedUnion("type", [
  z.object({ type: z.literal("is"), a: ref, b: ref }),
  z.object({ type: z.literal("isNot"), a: ref, b: ref }),
  z.object({ type: z.literal("eitherOr"), a: ref, options: z.tuple([ref, ref]) }),
  z.object({ type: z.literal("comparative"), greater: ref, lesser: ref, orderedCat: z.number() }),
]);

const puzzles = defineCollection({
  type: "data",
  schema: z.object({
    id: z.string(),
    title: z.string(),
    themeBlurb: z.string(),
    gameType: z.literal("logic-grid"),
    gradeLabel: z.string(),
    difficulty: z.string(),
    categories: z.array(z.object({
      name: z.string(),
      ordered: z.boolean().optional(),
      items: z.array(z.string()),
    })),
    solution: z.array(z.array(z.number())),
    clues: z.array(z.object({ id: z.string(), structured, text: z.string() })),
    seed: z.number(),
    createdAt: z.string(),
  }),
});

export const collections = { puzzles };
```

- [ ] **Step 5: Install dependencies**

Run: `cd site && npm install`
Expected: Astro installs without errors.

- [ ] **Step 6: Verify it builds (with the one puzzle from Task 16)**

Run: `cd site && npm run build`
Expected: build succeeds; the puzzle JSON in `src/content/puzzles/` validates against the schema. If validation fails, the generated JSON shape and the Zod schema disagree — fix the schema to match `types.ts` exactly.

- [ ] **Step 7: Commit**

```bash
git add site/package.json site/astro.config.mjs site/tsconfig.json site/src/content/config.ts
git commit -m "feat(site): scaffold Astro app with puzzles content schema"
```

---

## Task 18: Shared grid helpers (pure, tested)

These helpers turn a puzzle into the display structures both the player and the print page use: the list of "cross blocks" (each pair of categories that gets its own sub-grid) and the answer-key rows.

**Files:**
- Create: `site/src/games/logic-grid/grid.ts`
- Create: `site/vitest.config.ts`
- Add dev dep `vitest` to `site/package.json`
- Test: `site/test/grid.test.ts`

- [ ] **Step 1: Add vitest to the site package**

Modify `site/package.json` — add to `scripts`: `"test": "vitest run"`, and add `devDependencies`:

```json
"devDependencies": {
  "vitest": "^2.1.0"
}
```

Run: `cd site && npm install`

- [ ] **Step 2: Create `site/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
```

- [ ] **Step 3: Write the failing test**

```ts
// site/test/grid.test.ts
import { describe, it, expect } from "vitest";
import { answerKey, type PuzzleData } from "../src/games/logic-grid/grid";

const puzzle: PuzzleData = {
  id: "t", title: "T", themeBlurb: "", gameType: "logic-grid", gradeLabel: "5", difficulty: "g5",
  categories: [
    { name: "Kid", items: ["Ann", "Ben"] },
    { name: "Pet", items: ["Cat", "Dog"] },
  ],
  solution: [[0, 1], [1, 0]], // entity0=Ann→Pet item1(Dog); entity1=Ben→Pet item0(Cat)
  clues: [], seed: 1, createdAt: "",
};

describe("answerKey", () => {
  it("lists each anchor entity with its item from every other category", () => {
    const key = answerKey(puzzle);
    expect(key).toEqual([
      { Kid: "Ann", Pet: "Dog" },
      { Kid: "Ben", Pet: "Cat" },
    ]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd site && npx vitest run test/grid.test.ts`
Expected: FAIL — cannot find module `grid`.

- [ ] **Step 5: Write the implementation**

```ts
// site/src/games/logic-grid/grid.ts
export interface PuzzleData {
  id: string;
  title: string;
  themeBlurb: string;
  gameType: "logic-grid";
  gradeLabel: string;
  difficulty: string;
  categories: { name: string; ordered?: boolean; items: string[] }[];
  solution: number[][];
  clues: { id: string; text: string }[];
  seed: number;
  createdAt: string;
}

/** One row per anchor entity, mapping each category name to its solved item. */
export function answerKey(p: PuzzleData): Record<string, string>[] {
  const M = p.categories[0]!.items.length;
  const rows: Record<string, string>[] = [];
  for (let e = 0; e < M; e++) {
    const row: Record<string, string> = {};
    for (let c = 0; c < p.categories.length; c++) {
      const cat = p.categories[c]!;
      row[cat.name] = cat.items[p.solution[c]![e]!]!;
    }
    rows.push(row);
  }
  return rows;
}

/** Unordered category pairs that each get a sub-grid in the display. */
export function categoryPairs(p: PuzzleData): [number, number][] {
  const pairs: [number, number][] = [];
  for (let a = 0; a < p.categories.length; a++)
    for (let b = a + 1; b < p.categories.length; b++) pairs.push([a, b]);
  return pairs;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd site && npx vitest run test/grid.test.ts`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add site/package.json site/vitest.config.ts site/src/games/logic-grid/grid.ts site/test/grid.test.ts
git commit -m "feat(site): pure grid/answer-key helpers"
```

---

## Task 19: Base layout + index page

**Files:**
- Create: `site/src/layouts/Base.astro`
- Create: `site/src/pages/index.astro`

- [ ] **Step 1: Create `site/src/layouts/Base.astro`**

```astro
---
interface Props { title: string; }
const { title } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <style is:global>
      :root { --ink: #0f172a; --muted: #64748b; --line: #cbd5e1; --x: #dc2626; --o: #2563eb; }
      * { box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, sans-serif; color: var(--ink); margin: 0; line-height: 1.5; }
      main { max-width: 920px; margin: 0 auto; padding: 24px; }
      a { color: var(--o); }
      h1 { margin: 0 0 4px; }
    </style>
  </head>
  <body>
    <main><slot /></main>
  </body>
</html>
```

- [ ] **Step 2: Create `site/src/pages/index.astro`**

```astro
---
import { getCollection } from "astro:content";
import Base from "../layouts/Base.astro";

const puzzles = (await getCollection("puzzles")).sort((a, b) =>
  a.data.createdAt < b.data.createdAt ? 1 : -1,
);
---
<Base title="Marshellis Games — Logic Puzzles">
  <h1>Logic Grid Puzzles</h1>
  <p style="color:var(--muted)">Read the clues, fill the grid, find the one answer.</p>
  <ul style="list-style:none;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
    {puzzles.map((p) => (
      <li style="border:1px solid var(--line);border-radius:10px;padding:14px">
        <a href={`/puzzle/${p.data.id}`} style="font-weight:700;text-decoration:none">{p.data.title}</a>
        <div style="color:var(--muted);font-size:13px;margin-top:4px">
          {p.data.gradeLabel} · {p.data.categories.length} categories · {p.data.clues.length} clues
        </div>
      </li>
    ))}
  </ul>
</Base>
```

- [ ] **Step 3: Verify build**

Run: `cd site && npm run build`
Expected: build succeeds; `dist/index.html` exists and lists the generated puzzle.

- [ ] **Step 4: Commit**

```bash
git add site/src/layouts/Base.astro site/src/pages/index.astro
git commit -m "feat(site): base layout and puzzle index"
```

---

## Task 20: LogicGrid component + interactive player page

**Files:**
- Create: `site/src/components/LogicGrid.astro`
- Create: `site/src/games/logic-grid/player.ts`
- Create: `site/src/pages/puzzle/[id].astro`

- [ ] **Step 1: Create `site/src/components/LogicGrid.astro`** (renders the cross-grids and clue list as static HTML the player script wires up)

```astro
---
import { categoryPairs, type PuzzleData } from "../games/logic-grid/grid";
interface Props { puzzle: PuzzleData; interactive?: boolean; }
const { puzzle, interactive = false } = Astro.props;
const pairs = categoryPairs(puzzle);
---
<div class="logic-grid" data-interactive={interactive ? "1" : "0"}>
  {pairs.map(([a, b]) => {
    const A = puzzle.categories[a];
    const B = puzzle.categories[b];
    return (
      <table class="pair" data-a={a} data-b={b}>
        <thead>
          <tr><th class="corner">{A.name} \ {B.name}</th>{B.items.map((bi) => <th>{bi}</th>)}</tr>
        </thead>
        <tbody>
          {A.items.map((ai, aIdx) => (
            <tr>
              <th class="rowhdr">{ai}</th>
              {B.items.map((_, bIdx) => (
                <td class="cell" data-a={a} data-ai={aIdx} data-b={b} data-bi={bIdx}></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  })}
  <ol class="clues">
    {puzzle.clues.map((c) => <li>{c.text}</li>)}
  </ol>
</div>

<style>
  .logic-grid { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
  table.pair { border-collapse: collapse; }
  table.pair th, table.pair td { border: 1px solid var(--line); padding: 4px; text-align: center; font-size: 13px; }
  table.pair th.corner { background: #1e293b; color: #fff; font-size: 11px; }
  table.pair th.rowhdr, table.pair thead th { background: #f1f5f9; white-space: nowrap; }
  td.cell { width: 34px; height: 34px; cursor: pointer; font-weight: 700; font-size: 18px; user-select: none; }
  td.cell[data-mark="x"] { color: var(--x); }
  td.cell[data-mark="o"] { color: var(--o); }
  .clues { min-width: 260px; flex: 1; }
  .clues li { margin-bottom: 6px; }
</style>
```

- [ ] **Step 2: Create `site/src/games/logic-grid/player.ts`** (client island: cycle marks, persist, check, reveal)

```ts
// site/src/games/logic-grid/player.ts
type Mark = "" | "x" | "o";
const CYCLE: Record<Mark, Mark> = { "": "x", x: "o", o: "" };

function storageKey(id: string): string {
  return `lg:${id}`;
}

export function initPlayer(puzzleId: string, solution: number[][]): void {
  const root = document.querySelector<HTMLElement>(".logic-grid");
  if (!root || root.dataset.interactive !== "1") return;
  const cells = Array.from(root.querySelectorAll<HTMLTableCellElement>("td.cell"));

  const save = () => {
    const state: Record<string, string> = {};
    for (const c of cells) if (c.dataset.mark) state[cellId(c)] = c.dataset.mark;
    localStorage.setItem(storageKey(puzzleId), JSON.stringify(state));
  };

  const cellId = (c: HTMLTableCellElement) =>
    `${c.dataset.a}-${c.dataset.ai}-${c.dataset.b}-${c.dataset.bi}`;

  const stored = localStorage.getItem(storageKey(puzzleId));
  if (stored) {
    const state = JSON.parse(stored) as Record<string, string>;
    for (const c of cells) {
      const m = state[cellId(c)];
      if (m) { c.dataset.mark = m; c.textContent = m === "x" ? "✗" : m === "o" ? "○" : ""; }
    }
  }

  for (const c of cells) {
    c.addEventListener("click", () => {
      const next = CYCLE[(c.dataset.mark as Mark) || ""];
      c.dataset.mark = next;
      c.textContent = next === "x" ? "✗" : next === "o" ? "○" : "";
      save();
    });
  }

  document.querySelector("#check")?.addEventListener("click", () => {
    let correct = true;
    for (const c of cells) {
      const a = +c.dataset.a!, ai = +c.dataset.ai!, b = +c.dataset.b!, bi = +c.dataset.bi!;
      const want: Mark = sameEntity(solution, a, ai, b, bi) ? "o" : "x";
      // only judge cells the player has marked; blanks are "not yet", not "wrong"
      if ((c.dataset.mark || "") && c.dataset.mark !== want) correct = false;
    }
    const msg = document.querySelector("#result");
    if (msg) msg.textContent = correct ? "Looks right so far! ✅" : "Something doesn't match yet. 🤔";
  });

  document.querySelector("#reveal")?.addEventListener("click", () => {
    for (const c of cells) {
      const a = +c.dataset.a!, ai = +c.dataset.ai!, b = +c.dataset.b!, bi = +c.dataset.bi!;
      const yes = sameEntity(solution, a, ai, b, bi);
      c.dataset.mark = yes ? "o" : "x";
      c.textContent = yes ? "○" : "✗";
    }
    save();
  });
}

/** True if (cat a,item ai) and (cat b,item bi) belong to the same anchor entity. */
function sameEntity(sol: number[][], a: number, ai: number, b: number, bi: number): boolean {
  const ea = sol[a]!.indexOf(ai);
  const eb = sol[b]!.indexOf(bi);
  return ea === eb;
}
```

- [ ] **Step 3: Create `site/src/pages/puzzle/[id].astro`**

```astro
---
import { getCollection, getEntry } from "astro:content";
import Base from "../../layouts/Base.astro";
import LogicGrid from "../../components/LogicGrid.astro";

export async function getStaticPaths() {
  const puzzles = await getCollection("puzzles");
  return puzzles.map((p) => ({ params: { id: p.data.id } }));
}

const { id } = Astro.params;
const entry = await getEntry("puzzles", id!);
const puzzle = entry!.data;
---
<Base title={`${puzzle.title} — Marshellis Games`}>
  <p><a href="/">← All puzzles</a></p>
  <h1>{puzzle.title}</h1>
  <p style="color:var(--muted)">{puzzle.themeBlurb}</p>
  <p>
    <button id="check">Check</button>
    <button id="reveal">Reveal solution</button>
    <a href={`/puzzle/${puzzle.id}/print`}>Print worksheet →</a>
  </p>
  <p id="result" style="font-weight:600;min-height:1.4em"></p>

  <LogicGrid puzzle={puzzle} interactive={true} />

  <!-- Pass data via a JSON script tag; the module script (bundled by Astro) reads it. -->
  <script type="application/json" id="puzzle-data" set:html={JSON.stringify({ id: puzzle.id, solution: puzzle.solution })} />
  <script>
    import { initPlayer } from "../../games/logic-grid/player.ts";
    const el = document.getElementById("puzzle-data");
    const { id, solution } = JSON.parse(el!.textContent!);
    initPlayer(id, solution);
  </script>
</Base>
```

> Why the JSON-tag pattern: Astro's `<script>` is bundled (so the `import` of `player.ts` works), but a bundled script can't also use `define:vars` (that forces an inline, un-bundled script). Passing the per-puzzle data through a `type="application/json"` tag keeps the logic in the bundled module.

- [ ] **Step 4: Build and verify**

Run: `cd site && npm run build`
Expected: build succeeds; `dist/puzzle/<id>/index.html` exists.

- [ ] **Step 5: Manual interactive QA**

Run: `cd site && npm run preview` then use the browse tool to open the puzzle URL.
Verify: clicking a cell cycles blank → ✗ → ○ → blank; "Reveal solution" fills every grid; reloading the page preserves marks (localStorage); "Check" reports a sensible message. Capture a screenshot.

- [ ] **Step 6: Commit**

```bash
git add site/src/components/LogicGrid.astro site/src/games/logic-grid/player.ts "site/src/pages/puzzle/[id].astro"
git commit -m "feat(site): interactive logic-grid player page"
```

---

## Task 21: Printable worksheet + answer key

**Files:**
- Create: `site/src/styles/print.css`
- Create: `site/src/pages/puzzle/[id]/print.astro`

- [ ] **Step 1: Create `site/src/styles/print.css`**

```css
@media print {
  .no-print { display: none !important; }
  body { margin: 0; }
  .answer-key { page-break-before: always; }
  main { max-width: none; padding: 0; }
}
.worksheet { padding: 16px; }
.answer-key { padding: 16px; }
.answer-key table { border-collapse: collapse; margin-top: 8px; }
.answer-key th, .answer-key td { border: 1px solid #333; padding: 4px 10px; font-size: 13px; }
```

- [ ] **Step 2: Create `site/src/pages/puzzle/[id]/print.astro`**

```astro
---
import { getCollection, getEntry } from "astro:content";
import LogicGrid from "../../../components/LogicGrid.astro";
import { answerKey } from "../../../games/logic-grid/grid";
import "../../../styles/print.css";

export async function getStaticPaths() {
  const puzzles = await getCollection("puzzles");
  return puzzles.map((p) => ({ params: { id: p.data.id } }));
}

const { id } = Astro.params;
const entry = await getEntry("puzzles", id!);
const puzzle = entry!.data;
const key = answerKey(puzzle);
const headers = puzzle.categories.map((c) => c.name);
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{puzzle.title} — worksheet</title>
    <style is:global>
      body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; }
      table { border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 4px; text-align: center; font-size: 13px; }
      td.cell { width: 30px; height: 30px; }
      .clues li { margin-bottom: 6px; }
      .logic-grid { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
    </style>
  </head>
  <body>
    <p class="no-print"><a href={`/puzzle/${puzzle.id}`}>← Back</a> · Use your browser's Print → Save as PDF.</p>
    <section class="worksheet">
      <h1>{puzzle.title}</h1>
      <p>{puzzle.themeBlurb}</p>
      <LogicGrid puzzle={puzzle} interactive={false} />
    </section>
    <section class="answer-key">
      <h2>Answer Key — {puzzle.title}</h2>
      <table>
        <thead><tr>{headers.map((h) => <th>{h}</th>)}</tr></thead>
        <tbody>
          {key.map((row) => <tr>{headers.map((h) => <td>{row[h]}</td>)}</tr>)}
        </tbody>
      </table>
    </section>
  </body>
</html>
```

- [ ] **Step 3: Build and verify**

Run: `cd site && npm run build`
Expected: build succeeds; `dist/puzzle/<id>/print/index.html` exists with the worksheet and a separate answer-key section.

- [ ] **Step 4: Manual print QA**

Run: `cd site && npm run preview`, open the print URL with the browse tool, trigger print-to-PDF (or emulate print media) and confirm: the worksheet grid + clues fit on the first page(s), the answer key starts on a new page, and the "Back"/instructions line is hidden in print.

- [ ] **Step 5: Commit**

```bash
git add site/src/styles/print.css "site/src/pages/puzzle/[id]/print.astro"
git commit -m "feat(site): printable worksheet with separate answer key"
```

---

## Task 22: Generate a starter set of puzzles

**Files:**
- Create: multiple `site/src/content/puzzles/*.json` (generated)

- [ ] **Step 1: Generate one puzzle per grade**

Run:
```bash
cd generator
for g in 1 2 3 4 5 6 7 8; do npm run generate -- --difficulty g$g --seed $g --date 2026-06-04; done
```
Expected: 8 JSON files written into `site/src/content/puzzles/` (plus the Task 16 file). Each logs a title + clue count.

- [ ] **Step 2: Build the site against the full set**

Run: `cd site && npm run build`
Expected: build succeeds; index lists all generated puzzles; every puzzle page and print page builds.

- [ ] **Step 3: Run both test suites**

Run: `cd generator && npm test && cd ../site && npm test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add site/src/content/puzzles/
git commit -m "content: starter logic-grid puzzles for grades 1-8"
```

---

# PHASE 3 — Publish to games.marshellis.com

> This phase performs outward-facing actions (creating a Vercel project, changing DNS). Each step that touches an external service must be confirmed with the repo owner before running. The owner authorizes Vercel once; everything after is push-to-deploy.

## Task 23: Push the repo to GitHub

**Files:** none (git/remote operations)

- [ ] **Step 1: Confirm/create the GitHub repo**

Run: `gh repo view 2>/dev/null || gh repo create game-generator --private --source=. --remote=origin`
Expected: a private GitHub repo `jjackson/game-generator` exists and `origin` points at it. (Confirm name/visibility with the owner first.)

- [ ] **Step 2: Push main**

Run: `git push -u origin main`
Expected: branch pushed.

---

## Task 24: Create the Vercel project (owner-authorized)

**Files:**
- Create: `site/vercel.json` (optional, documents framework + build)

- [ ] **Step 1: Add `site/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "astro"
}
```

```bash
git add site/vercel.json && git commit -m "chore(site): vercel project config" && git push
```

- [ ] **Step 2: Authorize Vercel (owner action)**

Ask the owner to run, in the session, `! npx vercel login` and complete auth. Then link the project:

Run: `cd site && npx vercel link`
Expected: prompts to select scope and project; create a new project named `games-marshellis`.

- [ ] **Step 3: Set the project root to `site/`**

In the Vercel dashboard (or via `vercel` prompts), set **Root Directory = `site`** and Framework Preset = **Astro**. Confirm with the owner.

- [ ] **Step 4: First deploy**

Run: `cd site && npx vercel --prod`
Expected: a production deployment URL (e.g. `games-marshellis.vercel.app`) that serves the index and a playable puzzle. QA the live URL with the browse tool.

---

## Task 25: Attach the games.marshellis.com domain

**Files:** none (Vercel + Cloudflare config)

- [ ] **Step 1: Add the domain in Vercel**

Run: `cd site && npx vercel domains add games.marshellis.com`
Expected: Vercel prints the required DNS target (a CNAME, typically `cname.vercel-dns.com`). Record it.

- [ ] **Step 2: Add the Cloudflare DNS record (owner action)**

In Cloudflare DNS for marshellis.com, add: **CNAME `games` → `cname.vercel-dns.com`** (the exact target Vercel printed). Set proxy status per Vercel's guidance (DNS-only / "grey cloud" is the safe default for Vercel-managed certs). Confirm with the owner before changing DNS.

- [ ] **Step 3: Verify**

Run: `cd site && npx vercel domains inspect games.marshellis.com`
Expected: domain shows as configured/verified. Then fetch `https://games.marshellis.com` with the browse tool and confirm the index loads and a puzzle is playable + printable.

---

## Task 26: Document the publish loop

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Marshellis Game Generator

A small generator for kids' logic puzzles, published to https://games.marshellis.com.

## Generate a puzzle
```bash
cd generator
npm install
npm run generate -- --difficulty g5 --seed 42 --date 2026-06-04
# flags: --difficulty g1..g8  --seed <n>  --date <YYYY-MM-DD>  --categories <n>  --items <n>  --grade "<label>"
```
This writes a JSON puzzle into `site/src/content/puzzles/`.

## Better phrasing (optional)
The CLI uses deterministic template phrasing. For engaging/funny clues, open the generated
JSON and ask Claude in-session to rewrite each clue's `text` field (keep `structured` unchanged —
it's the source of truth for the logic and answer key).

## Preview locally
```bash
cd site
npm install
npm run dev      # play
npm run build    # verify before publishing
```

## Publish
```bash
git add site/src/content/puzzles/ && git commit -m "content: new puzzle" && git push
```
Vercel auto-deploys `main` to games.marshellis.com.

## Test
```bash
cd generator && npm test
cd site && npm test
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: publish loop and usage" && git push
```

---

## Self-Review Notes (for the implementing engineer)

- **Spec coverage:** generation pipeline (Tasks 4–14), unique + no-guess guarantee (Tasks 6, 9, 15), difficulty/grade 1–8 (Task 10), themes/funny tone (Tasks 11–12 + README phrasing step), interactive play (Task 20), printable worksheet + answer key (Task 21), publish to games.marshellis.com via Vercel + Cloudflare (Tasks 23–25). All spec sections map to a task.
- **Determinism:** every generator test uses `makeRng(seed)` and the `TemplatePhraser`; no wall-clock or randomness leaks into tests.
- **Type contract:** the Zod schema in `site/src/content/config.ts` (Task 17) must stay in lockstep with `generator/src/games/logic-grid/types.ts` (Task 3). If you change one, change both. Task 17 Step 6 is the gate that catches drift.
- **Performance guard:** if Task 15's property tests are slow at g6–g8 sizes (5×5, 5×6), that's the no-guess reducer doing many solves. Keep property tests at g1–g5; generate larger grids via the CLI where wall-clock isn't a test concern.
- **Player check logic:** `sameEntity()` in `player.ts` is the single source of truth for both "check" and "reveal"; it derives matches from `solution`, never from clue prose.
```
