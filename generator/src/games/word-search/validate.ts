import type { WordSearch } from "./types";

/** Re-verify a word search: every hidden word really reads along its stated coordinates. */
export function validateWordSearch(data: unknown): string[] {
  const w = data as WordSearch, p: string[] = [];
  for (const row of w.grid) for (const ch of row) if (!/^[A-Z]$/.test(ch)) p.push(`bad grid letter "${ch}"`);
  for (const pw of w.words) {
    const dr = Math.sign(pw.end.r - pw.start.r), dc = Math.sign(pw.end.c - pw.start.c);
    const len = Math.max(Math.abs(pw.end.r - pw.start.r), Math.abs(pw.end.c - pw.start.c)) + 1;
    if (len !== pw.word.length) { p.push(`${pw.word}: coordinates span ${len} cells`); continue; }
    let read = "";
    for (let i = 0; i < len; i++) read += w.grid[pw.start.r + dr * i]?.[pw.start.c + dc * i] ?? "?";
    if (read !== pw.word) p.push(`${pw.word}: grid reads "${read}" at its coordinates`);
  }
  if (new Set(w.words.map((x) => x.word)).size !== w.words.length) p.push("duplicate hidden word");
  return p;
}
