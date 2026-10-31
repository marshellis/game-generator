// Contract conformance: EVERY registered game must satisfy these, for every grade and a spread of seeds.
// Adding a game = registering it; this suite then holds it to the same bar as the others, no edits needed.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { REGISTRY } from "../src/registry";
import { GRADES } from "../src/grades";
import { manifestJson, MANIFEST_PATH } from "../src/manifest";

const SEEDS = [1, 2, 3, 7, 42, 1234, 99991, 4000000000];
const DATE = "2026-06-01";
const root = resolve(__dirname, "..");

describe("manifest", () => {
  it("site/src/data/games.json matches the registry (run `npm run manifest` after adding a game)", () => {
    expect(readFileSync(MANIFEST_PATH, "utf8")).toBe(manifestJson());
  });
  it("game ids, content dirs and emoji are unique", () => {
    for (const k of ["id", "contentDir", "emoji", "skill"] as const) expect(new Set(REGISTRY.map((m) => m[k])).size, k).toBe(REGISTRY.length);
  });
});

describe.each(REGISTRY.map((m) => [m.id, m] as const))("%s conforms to GameModule", (_id, m) => {
  it("covers every grade with a difficulty", () => {
    expect(m.grades).toEqual(GRADES);
    for (const g of m.grades) expect(m.difficultyFor(g), g).toBeTruthy();
  });
  it("writes into a content directory the site actually has", () => {
    expect(existsSync(resolve(root, m.contentDir))).toBe(true);
  });
  it.each(GRADES)("grade %s: deterministic, JSON-safe, valid, correctly id'd, for many seeds", (grade) => {
    const ids = new Set<string>();
    for (const seed of SEEDS) {
      const a = m.generate({ difficulty: grade, seed, date: DATE });
      const b = m.generate({ difficulty: grade, seed, date: DATE });
      expect(JSON.stringify(a), `seed ${seed} not deterministic`).toBe(JSON.stringify(b));
      expect(JSON.parse(JSON.stringify(a.data)), "data must survive JSON").toEqual(a.data);
      expect(m.validate(a.data), `seed ${seed} failed independent validation`).toEqual([]);
      expect((a.data as { id: string }).id).toBe(a.id);
      expect(a.id).toMatch(/^[a-z0-9-]+$/); // becomes a filename and a URL
      expect(a.id.startsWith(DATE)).toBe(true);
      ids.add(a.id);
    }
    expect(ids.size, "different seeds must give different items").toBe(SEEDS.length);
  });
  it("validate() actually rejects a corrupted item (the validator is not a rubber stamp)", () => {
    const good = m.generate({ difficulty: "g3", seed: 5, date: DATE }).data as Record<string, any>;
    const bad = structuredClone(good);
    // Corrupt whichever answer-bearing field this game has.
    if (bad.solution && Array.isArray(bad.solution[0]) && typeof bad.solution[0][0] === "number") { const row = bad.solution[0]; [row[0], row[1]] = [row[1], row[0]]; }
    else if (bad.words) { bad.words[0].word = bad.words[0].word.split("").reverse().join("") + "Q"; }
    else if (bad.open) { bad.open[0][0] ^= 15; }
    else if (bad.activities) { for (const a of bad.activities) for (const it of a.items ?? []) { if (typeof it.answer === "number") it.answer += 1; if (typeof it.answerIndex === "number") it.answerIndex = (it.answerIndex + 1) % it.numbers.length; } }
    expect(m.validate(bad).length).toBeGreaterThan(0);
  });
  it("measured difficulty rises with grade (when the game reports it)", () => {
    if (!m.score) return;
    const mean = (g: string) => SEEDS.map((s) => m.score!(m.generate({ difficulty: g, seed: s, date: DATE }).data).score).reduce((x, y) => x + y, 0) / SEEDS.length;
    expect(mean("g8")).toBeGreaterThanOrEqual(mean("g1"));
  });
});

describe("already-published content", () => {
  it.each(REGISTRY.map((m) => [m.id, m] as const))("every committed %s item still passes its game's independent validation", (_id, m) => {
    const dir = resolve(root, m.contentDir);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const f of files) {
      const problems = m.validate(JSON.parse(readFileSync(resolve(dir, f), "utf8")));
      if (problems.length) bad.push(`${f}: ${problems[0]}`);
    }
    expect(bad).toEqual([]);
  });
});
