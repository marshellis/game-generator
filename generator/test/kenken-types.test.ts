import { describe, it, expect } from "vitest";
import type { KenKen, Cage, Op, Cell } from "../src/games/kenken/types";

describe("kenken types", () => {
  it("constructs", () => {
    const cell: Cell = { r: 0, c: 0 };
    const cage: Cage = { cells: [cell, { r: 0, c: 1 }], op: "+", target: 3 };
    const k: KenKen = {
      id: "x", title: "KenKen", gameType: "kenken", gradeLabel: "grade 1", difficulty: "g1",
      size: 3, cages: [cage], solution: [[1,2,3],[2,3,1],[3,1,2]], difficultyRating: 1,
      seed: 1, createdAt: "2026-06-06T00:00:00.000Z",
    };
    const op: Op = "/";
    expect(k.size).toBe(3); expect(cage.op).toBe("+"); expect(op).toBe("/");
  });
});
