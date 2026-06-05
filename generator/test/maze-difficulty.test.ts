import { describe, it, expect } from "vitest";
import { PRESETS, resolveDifficulty } from "../src/games/maze/difficulty";

describe("maze difficulty", () => {
  it("has presets g1..g8", () => {
    for (let g = 1; g <= 8; g++) expect(PRESETS[`g${g}`]).toBeDefined();
  });
  it("size grows monotonically by grade", () => {
    let prev = 0;
    for (let g = 1; g <= 8; g++) {
      const d = PRESETS[`g${g}`]!;
      expect(d.cols * d.rows).toBeGreaterThanOrEqual(prev);
      prev = d.cols * d.rows;
    }
  });
  it("only the youngest grades braid", () => {
    expect(PRESETS.g1!.braid).toBeGreaterThan(0);
    expect(PRESETS.g3!.braid).toBe(0);
    expect(PRESETS.g8!.braid).toBe(0);
  });
  it("applies overrides and throws on unknown", () => {
    expect(resolveDifficulty("g1", { cols: 9, rows: 9 })).toMatchObject({ cols: 9, rows: 9 });
    expect(() => resolveDifficulty("nope")).toThrow();
  });
});
