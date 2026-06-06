import { describe, it, expect } from "vitest";
import { generateWordSearch } from "../src/games/word-search/generate";
import { DIRS, PRESETS } from "../src/games/word-search/difficulty";
import { GRADES } from "../src/grades";
import type { Pos, WordSearch } from "../src/games/word-search/types";

/** Read the letters along the straight line start→end (length = word length). */
function readWord(ws: WordSearch, start: Pos, end: Pos): string {
  const dr = Math.sign(end.r - start.r);
  const dc = Math.sign(end.c - start.c);
  const len = Math.max(Math.abs(end.r - start.r), Math.abs(end.c - start.c)) + 1;
  let s = "";
  for (let i = 0; i < len; i++) s += ws.grid[start.r + dr * i]![start.c + dc * i]!;
  return s;
}

describe("generateWordSearch", () => {
  it("every grade: square grid filled with A–Z, words = preset count", () => {
    for (const g of GRADES) {
      const ws = generateWordSearch({ difficulty: g, seed: 3, date: "2026-06-06" });
      const preset = PRESETS[g]!;
      expect(ws.size).toBe(preset.size);
      expect(ws.grid.length).toBe(preset.size);
      for (const row of ws.grid) {
        expect(row.length).toBe(preset.size);
        for (const ch of row) expect(ch).toMatch(/^[A-Z]$/);
      }
      // The ramp guarantees enough fitting words to hit the target count.
      expect(ws.words.length).toBe(preset.wordCount);
    }
  });

  it("every placed word actually reads correctly along its coordinates", () => {
    for (const g of GRADES) {
      for (const seed of [1, 2, 5, 9]) {
        const ws = generateWordSearch({ difficulty: g, seed, date: "2026-06-06" });
        for (const pw of ws.words) {
          expect(readWord(ws, pw.start, pw.end)).toBe(pw.word);
          // start/end span exactly word.length along a straight (h/v/45°) line
          const dr = Math.abs(pw.end.r - pw.start.r);
          const dc = Math.abs(pw.end.c - pw.start.c);
          const len = Math.max(dr, dc) + 1;
          expect(len).toBe(pw.word.length);
          expect(dr === 0 || dc === 0 || dr === dc).toBe(true);
        }
      }
    }
  });

  it("only uses directions allowed for the grade", () => {
    for (const g of GRADES) {
      const ws = generateWordSearch({ difficulty: g, seed: 4, date: "2026-06-06" });
      const allowed = PRESETS[g]!.dirs.map((k) => DIRS[k]!);
      for (const pw of ws.words) {
        const dr = Math.sign(pw.end.r - pw.start.r);
        const dc = Math.sign(pw.end.c - pw.start.c);
        expect(allowed.some((d) => Math.sign(d.r) === dr && Math.sign(d.c) === dc)).toBe(true);
      }
    }
  });

  it("words are unique within a puzzle", () => {
    const ws = generateWordSearch({ difficulty: "g8", seed: 6, date: "2026-06-06" });
    const set = new Set(ws.words.map((w) => w.word));
    expect(set.size).toBe(ws.words.length);
  });

  it("is deterministic for a seed", () => {
    const a = generateWordSearch({ difficulty: "g5", seed: 7, date: "2026-06-06" });
    const b = generateWordSearch({ difficulty: "g5", seed: 7, date: "2026-06-06" });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("carries a stable id and 1–5 rating", () => {
    const ws = generateWordSearch({ difficulty: "g1", seed: 1, date: "2026-06-06" });
    expect(ws.id).toBe("2026-06-06-word-search-g1-1");
    expect(ws.difficultyRating).toBeGreaterThanOrEqual(1);
    expect(ws.difficultyRating).toBeLessThanOrEqual(5);
  });
});
