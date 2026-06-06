import { describe, it, expect } from "vitest";
import { mazeModule } from "../src/games/maze/module";

describe("maze module", () => {
  it("declares id/contentDir/grades", () => {
    expect(mazeModule.id).toBe("maze");
    expect(mazeModule.contentDir).toBe("../site/src/content/mazes");
    expect(mazeModule.grades.length).toBe(8);
  });
  it("generate returns a valid maze item", () => {
    const item = mazeModule.generate({ difficulty: "g3", seed: 1, date: "2026-06-06" });
    expect((item.data as any).gameType).toBe("maze");
    expect((item.data as any).id).toBe(item.id);
  });
  it("difficultyFor returns cols/rows", () => {
    expect((mazeModule.difficultyFor("g3") as any).cols).toBeGreaterThan(0);
  });
});
