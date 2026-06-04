import { describe, it, expect } from "vitest";
import type { Category, Ref, StructuredClue, Solution, Puzzle } from "../src/games/logic-grid/types";

describe("types", () => {
  it("can construct each structured clue variant", () => {
    const isClue: StructuredClue = { type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } };
    const isNot: StructuredClue = { type: "isNot", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } };
    const either: StructuredClue = {
      type: "eitherOr",
      a: { cat: 0, item: 0 },
      options: [{ cat: 1, item: 0 }, { cat: 1, item: 1 }],
    };
    const comp: StructuredClue = {
      type: "comparative",
      greater: { cat: 0, item: 0 },
      lesser: { cat: 1, item: 1 },
      orderedCat: 2,
    };
    const all: StructuredClue[] = [isClue, isNot, either, comp];
    expect(all).toHaveLength(4);
  });

  it("models a puzzle shape", () => {
    const cat: Category = { name: "Kid", items: ["Ann", "Ben"] };
    const sol: Solution = [[0, 1], [0, 1]];
    const ref: Ref = { cat: 0, item: 0 };
    const p: Puzzle = {
      id: "x", title: "t", themeBlurb: "b", gameType: "logic-grid",
      gradeLabel: "5th grade", difficulty: "g5",
      categories: [cat, { name: "Pet", items: ["Cat", "Dog"] }],
      solution: sol,
      clues: [{ id: "c1", structured: { type: "is", a: ref, b: { cat: 1, item: 0 } }, text: "..." }],
      seed: 1, createdAt: "2026-06-04T00:00:00.000Z",
    };
    expect(p.categories).toHaveLength(2);
  });
});
