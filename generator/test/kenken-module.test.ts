import { describe, it, expect } from "vitest";
import { kenkenModule } from "../src/games/kenken/module";
import { REGISTRY, getModule } from "../src/registry";

describe("kenken module", () => {
  it("declares id/contentDir/grades", () => {
    expect(kenkenModule.id).toBe("kenken");
    expect(kenkenModule.contentDir).toBe("../site/src/content/kenkens");
    expect(kenkenModule.grades.length).toBe(8);
  });
  it("generate returns a valid item; score returns a Load", () => {
    const item = kenkenModule.generate({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect((item.data as any).gameType).toBe("kenken");
    expect((item.data as any).id).toBe(item.id);
    const load = kenkenModule.score!(item.data);
    expect(load.stars).toBeGreaterThanOrEqual(1);
  });
  it("is registered", () => {
    expect(REGISTRY.map((m) => m.id)).toContain("kenken");
    expect(getModule("kenken").id).toBe("kenken");
  });
});
