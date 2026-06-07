import { describe, it, expect } from "vitest";
import { completionField, parseCompletions, groupByGame } from "../src/lib/profile/completions";

describe("completionField", () => {
  it("joins game and puzzleId", () => {
    expect(completionField("maze", "maze-g3-1")).toBe("maze:maze-g3-1");
  });
});

describe("parseCompletions", () => {
  it("parses JSON-string values, splits on the first colon, sorts newest first", () => {
    const raw = {
      "maze:maze-1": JSON.stringify({ grade: "g3", ts: 100 }),
      "word-search:ws-1": JSON.stringify({ grade: "g2", ts: 200 }),
    };
    const cs = parseCompletions(raw);
    expect(cs).toEqual([
      { game: "word-search", puzzleId: "ws-1", grade: "g2", ts: 200 },
      { game: "maze", puzzleId: "maze-1", grade: "g3", ts: 100 },
    ]);
  });
  it("parses already-deserialized object values (the @upstash/redis read path)", () => {
    const raw = {
      "maze:maze-1": { grade: "g3", ts: 100 },
      "kenken:kk-1": { grade: "g5", ts: 300 },
    };
    expect(parseCompletions(raw)).toEqual([
      { game: "kenken", puzzleId: "kk-1", grade: "g5", ts: 300 },
      { game: "maze", puzzleId: "maze-1", grade: "g3", ts: 100 },
    ]);
  });
  it("skips malformed values", () => {
    expect(parseCompletions({ "maze:x": "not json" })).toEqual([]);
    expect(parseCompletions({ "maze:y": { grade: "g1" } })).toEqual([]); // no ts
  });
});

describe("groupByGame", () => {
  it("counts per game, ordered by count desc", () => {
    const cs = [
      { game: "maze", puzzleId: "a", grade: "g1", ts: 3 },
      { game: "maze", puzzleId: "b", grade: "g1", ts: 2 },
      { game: "sudoku", puzzleId: "c", grade: "g1", ts: 1 },
    ];
    const g = groupByGame(cs);
    expect(g.map((x) => [x.game, x.count])).toEqual([["maze", 2], ["sudoku", 1]]);
  });
});
