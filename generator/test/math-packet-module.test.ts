import { describe, it, expect } from "vitest";
import { mathPacketModule } from "../src/games/math-packet/module";

describe("math-packet module", () => {
  it("declares id/contentDir and grades", () => {
    expect(mathPacketModule.id).toBe("math-packet");
    expect(mathPacketModule.contentDir).toBe("../site/src/content/packets");
    expect(mathPacketModule.grades.length).toBe(8);
  });
  it("generate returns a valid packet item", () => {
    const item = mathPacketModule.generate({ difficulty: "g2", seed: 1, date: "2026-06-06" });
    expect((item.data as any).gameType).toBe("math-packet");
    expect((item.data as any).id).toBe(item.id);
  });
  it("score returns the packet's Load", () => {
    const item = mathPacketModule.generate({ difficulty: "g2", seed: 1, date: "2026-06-06" });
    const load = mathPacketModule.score!(item.data);
    expect(typeof load.score).toBe("number");
    expect(typeof load.stars).toBe("number");
  });
});
