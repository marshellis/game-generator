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
  it("exposes score() returning a Load shape", () => {
    expect(typeof mazeModule.score).toBe("function");
    const item = mazeModule.generate({ difficulty: "g5", seed: 1, date: "2026-06-06" });
    const load = mazeModule.score!(item.data);
    expect(load).toEqual({
      maxTier: expect.any(Number),
      steps: expect.any(Number),
      score: expect.any(Number),
      stars: expect.any(Number),
    });
    expect(load.steps).toBeGreaterThan(0);
  });
  it("score() reports disjunction tier (3) when decoys are present", () => {
    const withDecoys = mazeModule.generate({ difficulty: "g5", seed: 1, date: "2026-06-06" });
    const noDecoys = mazeModule.generate({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect(mazeModule.score!(withDecoys.data).maxTier).toBe(3);
    expect(mazeModule.score!(noDecoys.data).maxTier).toBeLessThan(3);
  });
});
