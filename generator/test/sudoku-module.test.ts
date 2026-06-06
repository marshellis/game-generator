import { describe, it, expect } from "vitest";
import { sudokuModule } from "../src/games/sudoku/module";
import { REGISTRY, getModule } from "../src/registry";

describe("sudoku module", () => {
  it("declares id/contentDir/grades", () => {
    expect(sudokuModule.id).toBe("sudoku");
    expect(sudokuModule.contentDir).toBe("../site/src/content/sudokus");
    expect(sudokuModule.grades.length).toBe(8);
  });
  it("generate returns a valid item; score returns a Load", () => {
    const item = sudokuModule.generate({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect((item.data as any).gameType).toBe("sudoku");
    expect((item.data as any).id).toBe(item.id);
    const load = sudokuModule.score!(item.data);
    expect(typeof load.score).toBe("number");
    expect(load.stars).toBeGreaterThanOrEqual(1);
  });
  it("is in the registry", () => {
    expect(REGISTRY.map((m) => m.id)).toContain("sudoku");
    expect(getModule("sudoku").id).toBe("sudoku");
  });
});
