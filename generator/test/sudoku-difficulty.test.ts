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
