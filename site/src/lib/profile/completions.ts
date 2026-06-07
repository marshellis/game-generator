import type { Completion } from "./types";

export function completionField(game: string, puzzleId: string): string {
  return `${game}:${puzzleId}`;
}

export function parseCompletions(raw: Record<string, string>): Completion[] {
  const out: Completion[] = [];
  for (const [field, value] of Object.entries(raw)) {
    const sep = field.indexOf(":");
    if (sep < 0) continue;
    const game = field.slice(0, sep);
    const puzzleId = field.slice(sep + 1);
    try {
      const v = JSON.parse(value) as { grade?: string; ts?: number };
      if (typeof v.ts !== "number") continue;
      out.push({ game, puzzleId, grade: String(v.grade ?? ""), ts: v.ts });
    } catch {
      // skip malformed
    }
  }
  return out.sort((a, b) => b.ts - a.ts);
}

export interface GameGroup {
  game: string;
  count: number;
  completions: Completion[];
}

export function groupByGame(cs: Completion[]): GameGroup[] {
  const map = new Map<string, Completion[]>();
  for (const c of cs) {
    const list = map.get(c.game) ?? [];
    list.push(c);
    map.set(c.game, list);
  }
  return [...map.entries()]
    .map(([game, completions]) => ({ game, count: completions.length, completions }))
    .sort((a, b) => b.count - a.count);
}
