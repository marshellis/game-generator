// site/src/games/word-search/grid.ts
export interface Pos { r: number; c: number; }
export interface PlacedWord { word: string; start: Pos; end: Pos; }

export const eq = (a: Pos, b: Pos): boolean => a.r === b.r && a.c === b.c;

/**
 * The straight line of cells from a to b, inclusive, if a→b is horizontal,
 * vertical, or a 45° diagonal. Returns null for any other (bent) selection.
 */
export function lineBetween(a: Pos, b: Pos): Pos[] | null {
  const dr = b.r - a.r;
  const dc = b.c - a.c;
  const straight = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
  if (!straight) return null;
  const len = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  const sr = Math.sign(dr);
  const sc = Math.sign(dc);
  const cells: Pos[] = [];
  for (let i = 0; i < len; i++) cells.push({ r: a.r + sr * i, c: a.c + sc * i });
  return cells;
}

/**
 * Index of the word whose endpoints match the selection a→b (in either
 * direction), or -1. Matching by recorded coordinates — exact and immune to
 * accidental letter coincidences in the filler.
 */
export function matchEndpoints(a: Pos, b: Pos, words: PlacedWord[]): number {
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if ((eq(a, w.start) && eq(b, w.end)) || (eq(a, w.end) && eq(b, w.start))) return i;
  }
  return -1;
}

/** All cells covered by a placed word (for highlighting found/revealed words). */
export function wordCells(w: PlacedWord): Pos[] {
  return lineBetween(w.start, w.end) ?? [];
}
