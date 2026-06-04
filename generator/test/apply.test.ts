import { describe, it, expect } from "vitest";
import { Board } from "../src/games/logic-grid/board";
import { applyClue } from "../src/games/logic-grid/apply";

describe("applyClue", () => {
  it("applies an is clue as YES", () => {
    const b = new Board(2, 3);
    applyClue(b, { type: "is", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } });
    expect(b.get(0, 0, 1, 1)).toBe(1);
  });

  it("applies an isNot clue as NO", () => {
    const b = new Board(2, 3);
    applyClue(b, { type: "isNot", a: { cat: 0, item: 0 }, b: { cat: 1, item: 1 } });
    expect(b.get(0, 0, 1, 1)).toBe(-1);
  });

  it("applies eitherOr by eliminating all non-option items", () => {
    const b = new Board(2, 3);
    applyClue(b, {
      type: "eitherOr",
      a: { cat: 0, item: 0 },
      options: [{ cat: 1, item: 0 }, { cat: 1, item: 2 }],
    });
    expect(b.get(0, 0, 1, 1)).toBe(-1); // item 1 eliminated
    expect(b.get(0, 0, 1, 0)).toBe(0);  // options remain open
    expect(b.get(0, 0, 1, 2)).toBe(0);
  });

  it("registers comparative clues on the board", () => {
    const b = new Board(2, 3);
    applyClue(b, { type: "comparative", greater: { cat: 0, item: 0 }, lesser: { cat: 0, item: 1 }, orderedCat: 1 });
    b.propagate();
    expect(b.get(0, 0, 1, 0)).toBe(-1);
  });
});
