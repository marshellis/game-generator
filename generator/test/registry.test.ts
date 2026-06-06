import { describe, it, expect } from "vitest";
import { REGISTRY, getModule } from "../src/registry";

describe("registry", () => {
  it("contains the three games with unique ids", () => {
    const ids = REGISTRY.map((m) => m.id).sort();
    expect(ids).toEqual(["logic-grid", "math-packet", "maze"]);
  });
  it("getModule resolves and throws on unknown", () => {
    expect(getModule("maze").id).toBe("maze");
    expect(() => getModule("nope")).toThrow();
  });
  it("every module generates a valid item for every grade", () => {
    for (const m of REGISTRY) {
      for (const g of m.grades) {
        const item = m.generate({ difficulty: g, seed: 1, date: "2026-06-06" });
        expect(item.id).toBeTruthy();
        expect((item.data as any).id).toBe(item.id);
      }
    }
  });
});
