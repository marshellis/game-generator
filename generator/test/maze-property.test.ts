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
        // minus any cells sealed by pruning (open mask 0 — only pruning produces these,
        // since a perfect maze gives every cell >=1 opening and decoy cells get vertical links).
        const decoyCells = p.decoys * (p.decoyDepth + 1);
        let sealed = 0;
        for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
          if (m.open[r]![c] === 0) sealed++;
        }
        expect(fromStart.size).toBe(m.rows * m.cols - decoyCells - sealed);

        // ...and (for perfect-maze grades) it's a spanning TREE, so the start→end solution
        // is unique: a connected region of K cells with exactly K-1 edges has no cycles.
        // Count open edges among reachable cells (each wall is symmetric, so halve the bit
        // total). Braided grades (g1–g2) intentionally add loops, so skip them.
        if (p.braid === 0) {
          let openBits = 0;
          for (const k of fromStart) {
            const [r, c] = k.split(",").map(Number) as [number, number];
            openBits += [1, 2, 4, 8].filter((b) => m.open[r]![c]! & b).length;
          }
          expect(openBits / 2).toBe(fromStart.size - 1);
        }
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

describe("property: no trivially-short off-solution dead-ends survive pruning", () => {
  const degree = (mask: number) => [1, 2, 4, 8].filter((b) => mask & b).length;
  const dirs = [[-1, 0, N], [0, 1, E], [1, 0, S], [0, -1, W]] as const;

  // measure a dead-end stub: walk inward to the first junction (degree>=3) or solution cell
  const stubLen = (open: number[][], rows: number, cols: number, start: any, sol: Set<string>) => {
    let cur = start, prevR = -1, prevC = -1, len = 0;
    for (;;) {
      len++;
      let next: any = null;
      for (const [dr, dc, bit] of dirs) {
        if (!(open[cur.r]![cur.c]! & bit)) continue;
        const nr = cur.r + dr, nc = cur.c + dc;
        if (nr === prevR && nc === prevC) continue;
        next = { r: nr, c: nc }; break;
      }
      if (!next) break;
      if (sol.has(`${next.r},${next.c}`) || degree(open[next.r]![next.c]!) >= 3) break;
      prevR = cur.r; prevC = cur.c; cur = next;
    }
    return len;
  };

  for (const g of ["g3", "g5", "g7", "g8"]) {
    for (let seed = 0; seed < 4; seed++) {
      it(`${g} seed ${seed}: every off-solution dead-end branch is >= minWrongPath`, () => {
        const p = PRESETS[g]!;
        const m = generateMaze({ difficulty: g, seed, date: "2026-06-05" });
        const sol = new Set(m.solution.map((c) => `${c.r},${c.c}`));
        const decoy = new Set(m.decoyStarts.map((c) => `${c.r},${c.c}`));
        for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
          if (degree(m.open[r]![c]!) !== 1) continue; // dead-ends only
          const k = `${r},${c}`;
          if (sol.has(k) || decoy.has(k)) continue;   // solution end / decoy tips are allowed short
          // decoy corridor cells are disconnected from the main maze; skip them too
          if (c >= 1 && c <= p.decoys && r <= p.decoyDepth) continue;
          expect(stubLen(m.open, m.rows, m.cols, { r, c }, sol)).toBeGreaterThanOrEqual(p.minWrongPath);
        }
      });
    }
  }
});
