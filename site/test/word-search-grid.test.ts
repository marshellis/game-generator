import { describe, it, expect } from "vitest";
import { lineBetween, matchEndpoints, wordCells, eq } from "../src/games/word-search/grid";

describe("word-search grid helpers", () => {
  it("lineBetween returns horizontal/vertical/diagonal runs", () => {
    expect(lineBetween({ r: 0, c: 0 }, { r: 0, c: 3 })).toEqual([
      { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 },
    ]);
    expect(lineBetween({ r: 2, c: 1 }, { r: 0, c: 1 })).toEqual([
      { r: 2, c: 1 }, { r: 1, c: 1 }, { r: 0, c: 1 },
    ]);
    expect(lineBetween({ r: 0, c: 0 }, { r: 2, c: 2 })).toEqual([
      { r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 },
    ]);
  });

  it("lineBetween rejects bent (non-straight) selections", () => {
    expect(lineBetween({ r: 0, c: 0 }, { r: 1, c: 2 })).toBeNull();
    expect(lineBetween({ r: 0, c: 0 }, { r: 3, c: 1 })).toBeNull();
  });

  it("matchEndpoints finds a word in either direction", () => {
    const words = [{ word: "CAT", start: { r: 0, c: 0 }, end: { r: 0, c: 2 } }];
    expect(matchEndpoints({ r: 0, c: 0 }, { r: 0, c: 2 }, words)).toBe(0);
    expect(matchEndpoints({ r: 0, c: 2 }, { r: 0, c: 0 }, words)).toBe(0); // reversed
    expect(matchEndpoints({ r: 0, c: 0 }, { r: 0, c: 1 }, words)).toBe(-1); // partial
    expect(matchEndpoints({ r: 1, c: 0 }, { r: 1, c: 2 }, words)).toBe(-1); // wrong row
  });

  it("wordCells expands a placed word to its covered cells", () => {
    expect(wordCells({ word: "DOG", start: { r: 1, c: 1 }, end: { r: 3, c: 3 } })).toEqual([
      { r: 1, c: 1 }, { r: 2, c: 2 }, { r: 3, c: 3 },
    ]);
  });

  it("eq compares positions", () => {
    expect(eq({ r: 1, c: 2 }, { r: 1, c: 2 })).toBe(true);
    expect(eq({ r: 1, c: 2 }, { r: 2, c: 1 })).toBe(false);
  });
});
