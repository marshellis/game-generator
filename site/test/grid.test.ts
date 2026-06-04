import { describe, it, expect } from "vitest";
import { answerKey, type PuzzleData } from "../src/games/logic-grid/grid";

const puzzle: PuzzleData = {
  id: "t", title: "T", themeBlurb: "", gameType: "logic-grid", gradeLabel: "5", difficulty: "g5",
  categories: [
    { name: "Kid", items: ["Ann", "Ben"] },
    { name: "Pet", items: ["Cat", "Dog"] },
  ],
  solution: [[0, 1], [1, 0]], // entity0=Ann→Pet item1(Dog); entity1=Ben→Pet item0(Cat)
  clues: [], seed: 1, createdAt: "",
};

describe("answerKey", () => {
  it("lists each anchor entity with its item from every other category", () => {
    const key = answerKey(puzzle);
    expect(key).toEqual([
      { Kid: "Ann", Pet: "Dog" },
      { Kid: "Ben", Pet: "Cat" },
    ]);
  });
});
