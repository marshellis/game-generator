// generator/src/games/word-search/generate.ts
import { makeRng, shuffle, type Rng } from "../../core/rng";
import { DIRS, resolveDifficulty } from "./difficulty";
import { THEMES } from "./themes";
import type { PlacedWord, Pos, WordSearch } from "./types";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Cells a word would occupy if it started at (r,c) running in direction d. */
function cellsFor(r: number, c: number, d: Pos, len: number): Pos[] {
  const cells: Pos[] = [];
  for (let i = 0; i < len; i++) cells.push({ r: r + d.r * i, c: c + d.c * i });
  return cells;
}

function inBounds(cells: Pos[], size: number): boolean {
  return cells.every((p) => p.r >= 0 && p.r < size && p.c >= 0 && p.c < size);
}

/** A placement is valid if every cell is empty or already holds the same letter. */
function fits(grid: string[][], cells: Pos[], word: string): boolean {
  for (let i = 0; i < cells.length; i++) {
    const { r, c } = cells[i]!;
    const cur = grid[r]![c]!;
    if (cur !== "" && cur !== word[i]) return false;
  }
  return true;
}

function tryPlaceWord(grid: string[][], size: number, word: string, dirKeys: string[], rng: Rng): PlacedWord | null {
  const dirs = shuffle(dirKeys.slice(), rng);
  for (const key of dirs) {
    const d = DIRS[key]!;
    // Collect every legal start cell for this direction, then try them in random order.
    const starts: Pos[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cells = cellsFor(r, c, d, word.length);
        if (inBounds(cells, size) && fits(grid, cells, word)) starts.push({ r, c });
      }
    }
    if (starts.length === 0) continue;
    const { r, c } = shuffle(starts, rng)[0]!;
    const cells = cellsFor(r, c, d, word.length);
    for (let i = 0; i < cells.length; i++) grid[cells[i]!.r]![cells[i]!.c] = word[i]!;
    return { word, start: cells[0]!, end: cells[cells.length - 1]! };
  }
  return null;
}

export interface GenerateWordSearchOptions { difficulty: string; seed: number; date: string; }

export function generateWordSearch(opts: GenerateWordSearchOptions): WordSearch {
  const d = resolveDifficulty(opts.difficulty);
  const rng = makeRng(opts.seed);
  const { size } = d;

  const theme = THEMES[Math.floor(rng() * THEMES.length)]!;
  // Candidate words: fit the grid, length ≥ 3, de-duplicated, in random order.
  const candidates = shuffle(
    [...new Set(theme.words)].filter((w) => w.length >= 3 && w.length <= size),
    rng,
  );

  const grid: string[][] = Array.from({ length: size }, () => new Array<string>(size).fill(""));
  const words: PlacedWord[] = [];
  for (const word of candidates) {
    if (words.length >= d.wordCount) break;
    if (words.some((p) => p.word === word)) continue;
    const placed = tryPlaceWord(grid, size, word, d.dirs, rng);
    if (placed) words.push(placed);
  }

  // Fill the remaining empty cells with random letters.
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r]![c] === "") grid[r]![c] = LETTERS[Math.floor(rng() * 26)]!;
    }
  }

  const maxDirections = d.dirs.length;
  // 1–5 rating: more allowed directions + bigger grid = harder hunt.
  const difficultyRating = Math.min(5, Math.max(1, Math.ceil(maxDirections / 2) + (size >= 12 ? 1 : 0)));

  return {
    id: `${opts.date}-word-search-${d.id}-${opts.seed}`,
    title: "Word Search",
    gameType: "word-search",
    gradeLabel: d.readingLevel,
    difficulty: d.id,
    size,
    theme: theme.name,
    grid,
    words,
    maxDirections,
    difficultyRating,
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
