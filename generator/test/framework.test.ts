import { describe, it, expect } from "vitest";
import type { GameModule, Load, GenerateOpts, GeneratedItem } from "../src/games/framework";

describe("framework contract", () => {
  it("a minimal GameModule type-checks and works", () => {
    const m: GameModule = {
      id: "demo", title: "Demo", grades: ["g1"], contentDir: "out",
      difficultyFor: (grade) => ({ grade }),
      generate: (o: GenerateOpts): GeneratedItem => ({ id: `${o.date}-demo-${o.seed}`, data: { o } }),
      score: (): Load => ({ maxTier: 1, steps: 1, score: 1, stars: 1 }),
    };
    expect(m.generate({ difficulty: "g1", seed: 1, date: "2026-06-06" }).id).toBe("2026-06-06-demo-1");
    expect(m.difficultyFor("g1")).toEqual({ grade: "g1" });
  });
});
