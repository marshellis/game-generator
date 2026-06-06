import { describe, it, expect } from "vitest";
import { generateMaze } from "../src/games/maze/generate";
import { N, E, S, W } from "../src/games/maze/types";
import { PRESETS } from "../src/games/maze/difficulty";

const openBetween = (open: number[][], a: any, b: any) => {
  if (b.r === a.r - 1) return !!(open[a.r]![a.c]! & N);
  if (b.r === a.r + 1) return !!(open[a.r]![a.c]! & S);
  if (b.c === a.c + 1) return !!(open[a.r]![a.c]! & E);
  return !!(open[a.r]![a.c]! & W);
};

describe("property: decoy starts are sealed and the main maze is intact", () => {
  const reachable = (open: number[][], rows: number, cols: number, from: any) => {
    const seen = new Set<string>([`${from.r},${from.c}`]);
    const q = [from];
    const dirs = [[-1, 0, N], [0, 1, E], [1, 0, S], [0, -1, W]] as const;
    for (let i = 0; i < q.length; i++) {
      const { r, c } = q[i]!;
      for (const [dr, dc, bit] of dirs) {
        if (!(open[r]![c]! & bit)) continue;
        const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || seen.has(k)) continue;
        seen.add(k); q.push({ r: nr, c: nc });
      }
    }
    return seen;
  };

  for (const g of ["g1","g2","g3","g4","g5","g6","g7","g8"]) {
    for (let seed = 0; seed < 4; seed++) {
      it(`${g} seed ${seed}: decoys sealed, main spans non-decoy cells`, () => {
        const p = PRESETS[g]!;
        const m = generateMaze({ difficulty: g, seed, date: "2026-06-05" });

        expect(m.decoyStarts.length).toBe(p.decoys);

        const startKey = `${m.start.r},${m.start.c}`;
        const solKeys = new Set(m.solution.map((c) => `${c.r},${c.c}`));
        const fromStart = reachable(m.open, m.rows, m.cols, m.start);

        for (const d of m.decoyStarts) {
          const k = `${d.r},${d.c}`;
          expect(k).not.toBe(startKey);          // distinct from the real start
          expect(solKeys.has(k)).toBe(false);     // never on the solution
          expect(fromStart.has(k)).toBe(false);   // sealed: unreachable from the real start (hence from end)
        }

        // main region = grid minus the reserved decoy cells (entrance + depth corridor each)
        const decoyCells = p.decoys * (p.decoyDepth + 1);
        expect(fromStart.size).toBe(m.rows * m.cols - decoyCells);
      });
    }
  }
});

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
