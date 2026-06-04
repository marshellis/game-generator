import { describe, it, expect } from "vitest";
import { TemplatePhraser } from "../src/games/logic-grid/phrasing";
import type { Category } from "../src/games/logic-grid/types";

const cats: Category[] = [
  { name: "Kid", items: ["Ann", "Ben", "Cal"] },
  { name: "Pet", items: ["Cat", "Dog", "Fish"] },
  { name: "Age", ordered: true, items: ["7", "8", "9"] },
];

describe("TemplatePhraser", () => {
  const p = new TemplatePhraser();
  const ctx = { categories: cats, readingLevel: "grade 5", themeBlurb: "" };

  it("phrases is/isNot deterministically", () => {
    expect(p.phrase({ type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } }, ctx))
      .toBe("Ann goes with Dog.");
    expect(p.phrase({ type: "isNot", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } }, ctx))
      .toBe("Ann does not go with Dog.");
  });

  it("phrases eitherOr", () => {
    expect(p.phrase({ type: "eitherOr", a: { cat: 0, item: 2 }, options: [{ cat: 1, item: 0 }, { cat: 1, item: 2 }] }, ctx))
      .toBe("Cal goes with either Cat or Fish.");
  });

  it("phrases comparative using the ordered category name", () => {
    expect(p.phrase({ type: "comparative", greater: { cat: 0, item: 0 }, lesser: { cat: 1, item: 0 }, orderedCat: 2 }, ctx))
      .toBe("Ann has a higher Age than Cat.");
  });
});
