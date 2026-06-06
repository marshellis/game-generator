# Game Catalog Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared contract + registry + one command (`npm run generate:all`) that generates a fresh, additive set of puzzles across every game, with grade→knobs handled by a shared grade-band table plus a per-game `difficultyFor`.

**Architecture:** `generator/src/grades.ts` (abstract per-grade bands) is the source of truth for what a grade means. `generator/src/games/framework.ts` defines the `GameModule` contract. Each game adds a thin `games/<game>/module.ts` adapter over its existing `generate*()`. `registry.ts` lists them; `catalog.ts` loops registry × grades × perGrade and appends JSON; `cli.ts` gains `--all`.

**Tech Stack:** TypeScript, Vitest, tsx.

**Reference spec:** `docs/superpowers/specs/2026-06-06-game-catalog-framework-design.md`

## Conventions
- Run all commands from `generator/`.
- Grade ids are `"g1".."g8"` and double as each game's difficulty preset id.
- `contentDir` strings are relative to the `generator/` root (e.g. `../site/src/content/puzzles`), matching the existing `outputPathFor` helpers.

## File Structure
```
generator/src/grades.ts                       # GradeBand table + GRADES list (shared)
generator/src/games/framework.ts              # Load, GenerateOpts, GeneratedItem, GameModule
generator/src/games/logic-grid/module.ts      # adapter
generator/src/games/math-packet/module.ts     # adapter (+ score)
generator/src/games/maze/module.ts            # adapter
generator/src/registry.ts                     # REGISTRY + getModule
generator/src/catalog.ts                      # deriveSeed + generateCatalog
generator/src/cli.ts                          # + --all branch, parseArgs flags
generator/package.json                        # + "generate:all" script
```

---

## Task 1: Shared grade-band table

**Files:** Create `generator/src/grades.ts`; Test `generator/test/grades.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { GRADES, GRADE_BANDS } from "../src/grades";

describe("grade bands", () => {
  it("has g1..g8 in order", () => {
    expect(GRADES).toEqual(["g1","g2","g3","g4","g5","g6","g7","g8"]);
  });
  it("workingMemory and maxReasoningTier are non-decreasing by grade", () => {
    let wm = 0, tier = 0;
    for (const g of GRADES) {
      const b = GRADE_BANDS[g]!;
      expect(b.workingMemory).toBeGreaterThanOrEqual(wm);
      expect(b.maxReasoningTier).toBeGreaterThanOrEqual(tier);
      wm = b.workingMemory; tier = b.maxReasoningTier;
    }
  });
  it("targetScore low <= high and readingLevel set", () => {
    for (const g of GRADES) {
      const b = GRADE_BANDS[g]!;
      expect(b.targetScore[0]).toBeLessThanOrEqual(b.targetScore[1]);
      expect(b.readingLevel).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`cd generator && npx vitest run test/grades.test.ts`)

- [ ] **Step 3: Implement**
```ts
// generator/src/grades.ts
/**
 * Game-agnostic meaning of each grade, derived from docs/grade-appropriateness.md.
 * Game KNOBS do not live here — each game's difficultyFor() maps these abstract
 * dials to its own knobs. This is the file we edit as difficulty understanding improves.
 */
export interface GradeBand {
  grade: string;                 // "g1".."g8"
  workingMemory: number;         // how many things in play at once (dominant lever)
  maxReasoningTier: 1 | 2 | 3 | 4 | 5; // assertion<negation<disjunction<transitive<conditional
  targetScore: [number, number]; // difficulty-score band an item should land in
  readingLevel: string;
}

export const GRADES: string[] = ["g1","g2","g3","g4","g5","g6","g7","g8"];

export const GRADE_BANDS: Record<string, GradeBand> = {
  g1: { grade: "g1", workingMemory: 3, maxReasoningTier: 2, targetScore: [1, 2], readingLevel: "grade 1" },
  g2: { grade: "g2", workingMemory: 3, maxReasoningTier: 2, targetScore: [1, 2], readingLevel: "grade 2" },
  g3: { grade: "g3", workingMemory: 4, maxReasoningTier: 3, targetScore: [2, 3], readingLevel: "grade 3" },
  g4: { grade: "g4", workingMemory: 4, maxReasoningTier: 3, targetScore: [2, 3], readingLevel: "grade 4" },
  g5: { grade: "g5", workingMemory: 4, maxReasoningTier: 4, targetScore: [3, 4], readingLevel: "grade 5" },
  g6: { grade: "g6", workingMemory: 5, maxReasoningTier: 4, targetScore: [3, 4], readingLevel: "grade 6" },
  g7: { grade: "g7", workingMemory: 5, maxReasoningTier: 5, targetScore: [4, 5], readingLevel: "grade 7" },
  g8: { grade: "g8", workingMemory: 5, maxReasoningTier: 5, targetScore: [4, 5], readingLevel: "grade 8" },
};

export function resolveBand(grade: string): GradeBand {
  const b = GRADE_BANDS[grade];
  if (!b) throw new Error(`unknown grade: ${grade}`);
  return b;
}
```

- [ ] **Step 4: Run, expect PASS** (3 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/grades.ts generator/test/grades.test.ts
git commit -m "feat(framework): shared grade-band table"
```

---

## Task 2: GameModule contract

**Files:** Create `generator/src/games/framework.ts`; Test `generator/test/framework.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import type { GameModule, Load, GenerateOpts, GeneratedItem } from "../src/games/framework";

describe("framework contract", () => {
  it("a minimal GameModule type-checks and works", () => {
    const m: GameModule = {
      id: "demo", title: "Demo", grades: ["g1"], contentDir: "out",
      difficultyFor: (grade) => ({ grade }),
      generate: (o: GenerateOpts): GeneratedItem => ({ id: `${o.date}-demo-${o.seed}`, data: { o } }),
      score: (): Load => ({ maxTier: 1, steps: 1, score: 1, stars: 1 }),
    };
    expect(m.generate({ difficulty: "g1", seed: 1, date: "2026-06-06" }).id).toBe("2026-06-06-demo-1");
    expect(m.difficultyFor("g1")).toEqual({ grade: "g1" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/framework.ts
/** Measured difficulty of a generated item (shared shape; math-packet already uses it). */
export interface Load { maxTier: number; steps: number; score: number; stars: number; }

export interface GenerateOpts { difficulty: string; seed: number; date: string; }
export interface GeneratedItem { id: string; data: unknown; }

/** The contract every game implements so the catalog can drive it uniformly. */
export interface GameModule {
  id: string;
  title: string;
  grades: string[];
  /** JSON output dir, relative to the generator/ root. */
  contentDir: string;
  /** Map an abstract grade → this game's own knobs. Only the game knows its knobs. */
  difficultyFor(grade: string): unknown;
  generate(opts: GenerateOpts): GeneratedItem;
  /** Optional measured difficulty, to verify difficultyFor lands in the grade's band. */
  score?(data: unknown): Load;
}
```

- [ ] **Step 4: Run, expect PASS** (1 test)
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/framework.ts generator/test/framework.test.ts
git commit -m "feat(framework): GameModule contract"
```

---

## Task 3: logic-grid adapter

**Files:** Create `generator/src/games/logic-grid/module.ts`; Test `generator/test/logic-grid-module.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { logicGridModule } from "../src/games/logic-grid/module";

describe("logic-grid module", () => {
  it("declares id/grades/contentDir", () => {
    expect(logicGridModule.id).toBe("logic-grid");
    expect(logicGridModule.grades).toContain("g5");
    expect(logicGridModule.contentDir).toBe("../site/src/content/puzzles");
  });
  it("generate returns a valid item with matching id", () => {
    const item = logicGridModule.generate({ difficulty: "g3", seed: 1, date: "2026-06-06" });
    expect(item.id).toContain("2026-06-06");
    expect((item.data as any).id).toBe(item.id);
    expect((item.data as any).gameType).toBe("logic-grid");
  });
  it("difficultyFor returns the grade's preset", () => {
    expect((logicGridModule.difficultyFor("g3") as any).categories).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/logic-grid/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generatePuzzle } from "./generate";
import type { GameModule } from "../framework";

export const logicGridModule: GameModule = {
  id: "logic-grid",
  title: "Logic Grid",
  grades: GRADES,
  contentDir: "../site/src/content/puzzles",
  difficultyFor: (grade) => PRESETS[grade],
  generate: ({ difficulty, seed, date }) => {
    const p = generatePuzzle({ difficulty, seed, date });
    return { id: p.id, data: p };
  },
};
```

- [ ] **Step 4: Run, expect PASS** (3 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/logic-grid/module.ts generator/test/logic-grid-module.test.ts
git commit -m "feat(framework): logic-grid module adapter"
```

---

## Task 4: math-packet adapter

**Files:** Create `generator/src/games/math-packet/module.ts`; Test `generator/test/math-packet-module.test.ts`

> Note: `generatePacket` is in `games/math-packet/generate.ts`; the per-grade config map is
> exported as `GRADES` from `games/math-packet/grades.ts` (a `Record<string, GradeConfig>` —
> different from the shared string-array `GRADES` in `src/grades.ts`; alias on import). The
> `Packet` carries a `load` field already, so `score` just returns it.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { mathPacketModule } from "../src/games/math-packet/module";

describe("math-packet module", () => {
  it("declares id/contentDir and grades", () => {
    expect(mathPacketModule.id).toBe("math-packet");
    expect(mathPacketModule.contentDir).toBe("../site/src/content/packets");
    expect(mathPacketModule.grades.length).toBe(8);
  });
  it("generate returns a valid packet item", () => {
    const item = mathPacketModule.generate({ difficulty: "g2", seed: 1, date: "2026-06-06" });
    expect((item.data as any).gameType).toBe("math-packet");
    expect((item.data as any).id).toBe(item.id);
  });
  it("score returns the packet's Load", () => {
    const item = mathPacketModule.generate({ difficulty: "g2", seed: 1, date: "2026-06-06" });
    const load = mathPacketModule.score!(item.data);
    expect(typeof load.score).toBe("number");
    expect(typeof load.stars).toBe("number");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/math-packet/module.ts
import { GRADES } from "../../grades";
import { GRADES as MATH_GRADES } from "./grades";
import { generatePacket } from "./generate";
import type { GameModule, Load } from "../framework";
import type { Packet } from "./types";

export const mathPacketModule: GameModule = {
  id: "math-packet",
  title: "Math Worksheets",
  grades: GRADES,
  contentDir: "../site/src/content/packets",
  difficultyFor: (grade) => MATH_GRADES[grade],
  generate: ({ difficulty, seed, date }) => {
    const p = generatePacket({ difficulty, seed, date });
    return { id: p.id, data: p };
  },
  score: (data) => (data as Packet).load as Load,
};
```

- [ ] **Step 4: Run, expect PASS** (3 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/math-packet/module.ts generator/test/math-packet-module.test.ts
git commit -m "feat(framework): math-packet module adapter"
```

---

## Task 5: maze adapter

**Files:** Create `generator/src/games/maze/module.ts`; Test `generator/test/maze-module.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { mazeModule } from "../src/games/maze/module";

describe("maze module", () => {
  it("declares id/contentDir/grades", () => {
    expect(mazeModule.id).toBe("maze");
    expect(mazeModule.contentDir).toBe("../site/src/content/mazes");
    expect(mazeModule.grades.length).toBe(8);
  });
  it("generate returns a valid maze item", () => {
    const item = mazeModule.generate({ difficulty: "g3", seed: 1, date: "2026-06-06" });
    expect((item.data as any).gameType).toBe("maze");
    expect((item.data as any).id).toBe(item.id);
  });
  it("difficultyFor returns cols/rows", () => {
    expect((mazeModule.difficultyFor("g3") as any).cols).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/games/maze/module.ts
import { GRADES } from "../../grades";
import { PRESETS } from "./difficulty";
import { generateMaze } from "./generate";
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
};
```

- [ ] **Step 4: Run, expect PASS** (3 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/games/maze/module.ts generator/test/maze-module.test.ts
git commit -m "feat(framework): maze module adapter"
```

---

## Task 6: Registry

**Files:** Create `generator/src/registry.ts`; Test `generator/test/registry.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { REGISTRY, getModule } from "../src/registry";

describe("registry", () => {
  it("contains the three games with unique ids", () => {
    const ids = REGISTRY.map((m) => m.id).sort();
    expect(ids).toEqual(["logic-grid", "math-packet", "maze"]);
  });
  it("getModule resolves and throws on unknown", () => {
    expect(getModule("maze").id).toBe("maze");
    expect(() => getModule("nope")).toThrow();
  });
  it("every module generates a valid item for every grade", () => {
    for (const m of REGISTRY) {
      for (const g of m.grades) {
        const item = m.generate({ difficulty: g, seed: 1, date: "2026-06-06" });
        expect(item.id).toBeTruthy();
        expect((item.data as any).id).toBe(item.id);
      }
    }
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/registry.ts
import type { GameModule } from "./games/framework";
import { logicGridModule } from "./games/logic-grid/module";
import { mathPacketModule } from "./games/math-packet/module";
import { mazeModule } from "./games/maze/module";

export const REGISTRY: GameModule[] = [logicGridModule, mathPacketModule, mazeModule];

export function getModule(id: string): GameModule {
  const m = REGISTRY.find((x) => x.id === id);
  if (!m) throw new Error(`unknown game module: ${id}`);
  return m;
}
```

- [ ] **Step 4: Run, expect PASS** (3 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/registry.ts generator/test/registry.test.ts
git commit -m "feat(framework): game registry"
```

---

## Task 7: Catalog orchestrator

**Files:** Create `generator/src/catalog.ts`; Test `generator/test/catalog.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveSeed, generateCatalog } from "../src/catalog";
import type { GameModule } from "../src/games/framework";

function fakeModule(id: string): GameModule {
  return {
    id, title: id, grades: ["g1", "g2"], contentDir: id,
    difficultyFor: (g) => ({ g }),
    generate: ({ difficulty, seed, date }) => ({ id: `${date}-${id}-${difficulty}-${seed}`, data: { id: `${date}-${id}-${difficulty}-${seed}`, v: 1 } }),
  };
}

describe("deriveSeed", () => {
  it("is deterministic and varies by every input", () => {
    expect(deriveSeed(1, "a", "g1", 0)).toBe(deriveSeed(1, "a", "g1", 0));
    expect(deriveSeed(1, "a", "g1", 0)).not.toBe(deriveSeed(2, "a", "g1", 0));
    expect(deriveSeed(1, "a", "g1", 0)).not.toBe(deriveSeed(1, "b", "g1", 0));
    expect(deriveSeed(1, "a", "g1", 0)).not.toBe(deriveSeed(1, "a", "g2", 0));
    expect(deriveSeed(1, "a", "g1", 0)).not.toBe(deriveSeed(1, "a", "g1", 1));
  });
});

describe("generateCatalog", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "catalog-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("writes perGrade × grades files per module, additive across runs", () => {
    const registry = [fakeModule("alpha"), fakeModule("beta")];
    const r1 = generateCatalog({ perGrade: 2, date: "2026-06-06", seedBase: 100, registry, outputRoot: root });
    expect(r1.written.length).toBe(2 * 2 * 2); // 2 modules × 2 grades × 2 perGrade
    expect(readdirSync(join(root, "alpha")).length).toBe(4);
    // additive: a second run with a different seedBase adds more, never fewer
    const r2 = generateCatalog({ perGrade: 1, date: "2026-06-06", seedBase: 999, registry, outputRoot: root });
    expect(r2.written.length).toBe(2 * 2 * 1);
    expect(readdirSync(join(root, "alpha")).length).toBe(4 + 2);
    expect(existsSync(r2.written[0]!)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**
```ts
// generator/src/catalog.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REGISTRY } from "./registry";
import type { GameModule } from "./games/framework";

/** Stable-but-varying seed for (run, game, grade, index). FNV-1a over the inputs. */
export function deriveSeed(seedBase: number, gameId: string, grade: string, i: number): number {
  let h = (seedBase >>> 0) ^ 0x811c9dc5;
  const s = `${gameId}:${grade}:${i}`;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface CatalogOpts {
  perGrade: number;
  date: string;
  seedBase: number;
  /** Defaults to the full REGISTRY; injectable for tests. */
  registry?: GameModule[];
  /** Base dir that each module's contentDir resolves against (generator/ root in prod). */
  outputRoot: string;
}

export function generateCatalog(opts: CatalogOpts): { written: string[] } {
  const registry = opts.registry ?? REGISTRY;
  const written: string[] = [];
  for (const m of registry) {
    for (const grade of m.grades) {
      for (let i = 0; i < opts.perGrade; i++) {
        const seed = deriveSeed(opts.seedBase, m.id, grade, i);
        const item = m.generate({ difficulty: grade, seed, date: opts.date });
        const abs = resolve(opts.outputRoot, m.contentDir, `${item.id}.json`);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, JSON.stringify(item.data, null, 2) + "\n");
        written.push(abs);
      }
    }
  }
  return { written };
}
```

- [ ] **Step 4: Run, expect PASS** (2 describes, 2 tests)
- [ ] **Step 5: Commit**
```bash
git add generator/src/catalog.ts generator/test/catalog.test.ts
git commit -m "feat(framework): catalog orchestrator + deriveSeed"
```

---

## Task 8: CLI `--all` + npm script

**Files:** Modify `generator/src/cli.ts`, `generator/package.json`; Test `generator/test/catalog-cli.test.ts`

> Keep the existing single-game dispatch and the `outputPathFor`/`packetOutputPathFor`/`mazeOutputPathFor`
> exports unchanged (existing tests depend on them). Only ADD the `--all` path and flags.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/cli";

describe("cli --all", () => {
  it("parses catalog flags", () => {
    const a = parseArgs(["--all", "--per-grade", "2", "--seed-base", "42", "--date", "2026-06-06"]);
    expect(a.all).toBe(true);
    expect(a.perGrade).toBe(2);
    expect(a.seedBase).toBe(42);
    expect(a.date).toBe("2026-06-06");
  });
  it("defaults perGrade to 1 and all to false", () => {
    const a = parseArgs(["--game", "maze"]);
    expect(a.all).toBe(false);
    expect(a.perGrade).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — edit `generator/src/cli.ts`:
  1. Add imports at top:
```ts
import { generateCatalog } from "./catalog";
```
  2. Extend `CliArgs` with:
```ts
  all: boolean;
  perGrade: number;
  seedBase?: number;
```
  3. In `parseArgs`, before the `return`, compute and include:
```ts
    all: argv.includes("--all"),
    perGrade: Number(get("--per-grade") ?? "1"),
    seedBase: get("--seed-base") !== undefined ? Number(get("--seed-base")) : undefined,
```
  (add these three keys to the returned object; keep all existing keys).
  4. In `main()`, immediately after `const args = parseArgs(...)` and the `generatorRoot` setup, add the catalog branch BEFORE the existing single-game dispatch:
```ts
  if (args.all) {
    const seedBase = args.seedBase ?? Date.now();
    const { written } = generateCatalog({
      perGrade: args.perGrade,
      date: args.date,
      seedBase,
      outputRoot: generatorRoot,
    });
    console.log(`Catalog: wrote ${written.length} items across ${args.perGrade} per grade (seedBase ${seedBase}).`);
    return;
  }
```

- [ ] **Step 4: Add npm script** — in `generator/package.json` `"scripts"`, add:
```json
    "generate:all": "tsx src/cli.ts --all",
```

- [ ] **Step 5: Run, expect PASS** (2 tests). Then full suite: `cd generator && npm test` — all green.

- [ ] **Step 6: Commit**
```bash
git add generator/src/cli.ts generator/package.json generator/test/catalog-cli.test.ts
git commit -m "feat(framework): cli --all + generate:all script"
```

---

## Task 9: Fire it off + verify the whole catalog

**Files:** Generated content under `site/src/content/{puzzles,packets,mazes}/`

- [ ] **Step 1: Run the catalog command (1 per grade across all games)**
```bash
cd generator && npm run generate:all -- --per-grade 1 --date 2026-06-06
```
Expected: `Catalog: wrote 24 items ...` (3 games × 8 grades × 1).

- [ ] **Step 2: Build the site against the expanded catalog**
```bash
cd site && npm run build
```
Expected: success; all new puzzles/packets/mazes validate and get pages.

- [ ] **Step 3: Run both suites**
```bash
cd generator && npm test && cd ../site && npm test
```
Expected: all PASS.

- [ ] **Step 4: Commit the generated set**
```bash
cd /Users/jjackson/emdash/repositories/game-generator
git add site/src/content/
git commit -m "content: first full catalog run (generate:all, 1 per grade)"
```

---

## Self-Review Notes
- **Spec coverage:** grade bands (T1), GameModule contract (T2), per-game adapters incl. math `score` (T3–T5), registry (T6), catalog + deriveSeed additive/re-runnable (T7), `generate:all` (T8), demonstration run (T9). All spec sections covered.
- **Low churn:** no edits to existing game internals; adapters wrap existing `generate*`. CLI keeps existing flags/exports; only adds `--all`.
- **Naming consistency:** shared `GRADES` (string[]) in `src/grades.ts` vs math's `GRADES` (Record) in `games/math-packet/grades.ts` — always import the math one aliased (`MATH_GRADES`), as in Task 4.
- **Type consistency:** `GenerateOpts {difficulty,seed,date}` matches all three existing `generate*` signatures; every `generate*` returns an object with `.id` used as `GeneratedItem.id`.
```
