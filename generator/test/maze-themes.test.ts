import { describe, it, expect } from "vitest";
import { makeRng } from "../src/core/rng";
import { loadThemes, pickTheme } from "../src/games/maze/themes";

describe("maze themes", () => {
  it("loads >= 4 themes with required fields", () => {
    const t = loadThemes();
    expect(t.length).toBeGreaterThanOrEqual(4);
    for (const x of t) {
      expect(x.title).toBeTruthy();
      expect(x.startIcon).toBeTruthy();
      expect(x.endIcon).toBeTruthy();
    }
  });
  it("pickTheme is deterministic per rng", () => {
    expect(pickTheme(loadThemes(), makeRng(5))).toEqual(pickTheme(loadThemes(), makeRng(5)));
  });
});
