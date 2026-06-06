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
