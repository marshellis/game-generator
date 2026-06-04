import { describe, it, expect } from "vitest";
import { loadThemePacks, pickTheme, sliceTheme } from "../src/games/logic-grid/themes";

describe("themes", () => {
  it("loads bundled theme packs", () => {
    const packs = loadThemePacks();
    expect(packs.length).toBeGreaterThanOrEqual(2);
    for (const p of packs) {
      expect(p.title).toBeTruthy();
      expect(p.categories.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("picks a theme that can supply the requested size", () => {
    const t = pickTheme(loadThemePacks(), 3, 3, false);
    expect(t.categories.length).toBeGreaterThanOrEqual(3);
  });

  it("slices a theme down to the requested categories x items, honoring ordered need", () => {
    const t = pickTheme(loadThemePacks(), 4, 4, true);
    const sliced = sliceTheme(t, 4, 4, true);
    expect(sliced.categories).toHaveLength(4);
    for (const c of sliced.categories) expect(c.items).toHaveLength(4);
    expect(sliced.categories.some((c) => c.ordered)).toBe(true);
  });
});
