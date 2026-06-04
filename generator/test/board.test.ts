import { describe, it, expect } from "vitest";
import { Board, Contradiction } from "../src/games/logic-grid/board";

describe("Board", () => {
  it("setting YES eliminates the rest of the row and column in that pair", () => {
    const b = new Board(2, 3); // 2 categories, 3 items each
    b.set(0, 0, 1, 0, 1);
    b.propagate();
    expect(b.get(0, 0, 1, 0)).toBe(1);
    expect(b.get(0, 0, 1, 1)).toBe(-1);
    expect(b.get(0, 0, 1, 2)).toBe(-1);
    expect(b.get(0, 1, 1, 0)).toBe(-1);
    expect(b.get(0, 2, 1, 0)).toBe(-1);
  });

  it("propagates transitivity across three categories", () => {
    const b = new Board(3, 3);
    b.set(0, 0, 1, 0, 1); // A0 = B0
    b.set(1, 0, 2, 0, 1); // B0 = C0
    b.propagate();
    expect(b.get(0, 0, 2, 0)).toBe(1); // therefore A0 = C0
  });

  it("infers YES when all but one cell in a row are NO", () => {
    const b = new Board(2, 3);
    b.set(0, 0, 1, 0, -1);
    b.set(0, 0, 1, 1, -1);
    b.propagate();
    expect(b.get(0, 0, 1, 2)).toBe(1);
  });

  it("throws Contradiction on conflicting assignment", () => {
    const b = new Board(2, 3);
    b.set(0, 0, 1, 0, 1);
    expect(() => b.set(0, 0, 1, 0, -1)).toThrow(Contradiction);
  });

  it("clone is independent", () => {
    const b = new Board(2, 3);
    const c = b.clone();
    c.set(0, 0, 1, 0, 1);
    c.propagate();
    expect(b.get(0, 0, 1, 0)).toBe(0); // original untouched
  });

  it("comparative constraint forbids the greater item from the lowest rank", () => {
    const b = new Board(2, 3); // cat 1 is the ordered category (ranks 0,1,2)
    b.addComparative({ greater: { cat: 0, item: 0 }, lesser: { cat: 0, item: 1 }, orderedCat: 1 });
    b.propagate();
    // entity(A0) must outrank entity(A1) in cat1 → A0 cannot be rank 0, A1 cannot be rank 2
    expect(b.get(0, 0, 1, 0)).toBe(-1);
    expect(b.get(0, 1, 1, 2)).toBe(-1);
  });
});
