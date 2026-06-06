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
