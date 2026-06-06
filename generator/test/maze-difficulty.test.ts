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
});
