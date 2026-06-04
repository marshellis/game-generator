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
