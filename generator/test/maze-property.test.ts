import { describe, it, expect } from "vitest";
import { generateMaze } from "../src/games/maze/generate";
import { N, E, S, W } from "../src/games/maze/types";

const openBetween = (open: number[][], a: any, b: any) => {
  if (b.r === a.r - 1) return !!(open[a.r]![a.c]! & N);
  if (b.r === a.r + 1) return !!(open[a.r]![a.c]! & S);
  if (b.c === a.c + 1) return !!(open[a.r]![a.c]! & E);
  return !!(open[a.r]![a.c]! & W);
};

describe("property: every generated maze is valid", () => {
  for (const g of ["g1","g2","g3","g4","g5","g6","g7","g8"]) {
    for (let seed = 0; seed < 4; seed++) {
      it(`${g} seed ${seed}: solvable + symmetric walls`, () => {
        const m = generateMaze({ difficulty: g, seed, date: "2026-06-05" });
        // wall symmetry
        for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
          if (c < m.cols - 1) expect(!!(m.open[r]![c]! & E)).toBe(!!(m.open[r]![c + 1]! & W));
          if (r < m.rows - 1) expect(!!(m.open[r]![c]! & S)).toBe(!!(m.open[r + 1]![c]! & N));
        }
        // valid solution
        expect(m.solution[0]).toEqual(m.start);
        expect(m.solution.at(-1)).toEqual(m.end);
        for (let i = 1; i < m.solution.length; i++) {
          expect(openBetween(m.open, m.solution[i - 1], m.solution[i])).toBe(true);
        }
      });
    }
  }
});
