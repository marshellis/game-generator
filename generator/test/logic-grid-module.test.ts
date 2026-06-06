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
