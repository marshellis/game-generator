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
