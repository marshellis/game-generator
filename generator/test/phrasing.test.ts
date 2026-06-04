import { describe, it, expect } from "vitest";
import { TemplatePhraser, type PhraseContext } from "../src/games/logic-grid/phrasing";
import type { Category } from "../src/games/logic-grid/types";

const cats: Category[] = [
  { name: "Kid", items: ["Ann", "Ben", "Cal"] }, // subject
  { name: "Pet", items: ["Cat", "Dog", "Fish"] },
  { name: "Color", items: ["Red", "Blue", "Green"] },
  { name: "Age", ordered: true, items: ["7", "8", "9"] },
];

const ctx: PhraseContext = {
  categories: cats,
  readingLevel: "grade 5",
  themeBlurb: "",
  subjectCat: 0,
  comparatives: { 3: "older than" },
};

describe("TemplatePhraser (subject-aware)", () => {
  const p = new TemplatePhraser();

  it("names the subject directly and states the other category as its attribute", () => {
    expect(p.phrase({ type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } }, ctx))
      .toBe("Ann's pet is Dog.");
    expect(p.phrase({ type: "isNot", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } }, ctx))
      .toBe("Ann's pet is not Dog.");
  });

  it("describes a non-subject ref by the person it belongs to", () => {
    // is(Pet=Cat, Kid=Ben)  ->  "The kid whose pet is Cat is Ben."
    expect(p.phrase({ type: "is", a: { cat: 1, item: 0 }, b: { cat: 0, item: 1 } }, ctx))
      .toBe("The kid whose pet is Cat is Ben.");
  });

  it("relates two non-subject categories via the owning person", () => {
    // is(Pet=Cat, Color=Red)
    expect(p.phrase({ type: "is", a: { cat: 1, item: 0 }, b: { cat: 2, item: 0 } }, ctx))
      .toBe("The kid whose pet is Cat has Red for their color.");
  });

  it("phrases eitherOr from the subject", () => {
    expect(p.phrase({ type: "eitherOr", a: { cat: 0, item: 2 }, options: [{ cat: 1, item: 0 }, { cat: 1, item: 2 }] }, ctx))
      .toBe("Cal's pet is either Cat or Fish.");
  });

  it("uses the natural comparative word and identifies the compared person", () => {
    // comparative(Kid=Ann, Pet=Cat, Age) — the bug fix: not "Ann ... than Cat"
    expect(p.phrase({ type: "comparative", greater: { cat: 0, item: 0 }, lesser: { cat: 1, item: 0 }, orderedCat: 3 }, ctx))
      .toBe("Ann is older than the kid whose pet is Cat.");
  });

  it("falls back to a generic comparative when no word is given", () => {
    const noWord: PhraseContext = { ...ctx, comparatives: {} };
    expect(p.phrase({ type: "comparative", greater: { cat: 0, item: 0 }, lesser: { cat: 0, item: 1 }, orderedCat: 3 }, noWord))
      .toBe("Ann has a higher age than Ben.");
  });
});
