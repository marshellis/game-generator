import type { Completion } from "./types";

export function completionField(game: string, puzzleId: string): string {
  return `${game}:${puzzleId}`;
}

export function parseCompletions(raw: Record<string, unknown>): Completion[] {
  const out: Completion[] = [];
  for (const [field, rawValue] of Object.entries(raw)) {
    const sep = field.indexOf(":");
    if (sep < 0) continue;
    const game = field.slice(0, sep);
    const puzzleId = field.slice(sep + 1);
    // @upstash/redis auto-deserializes JSON, so values normally arrive as
    // objects; tolerate a raw JSON string too (auto-deser off / a fake store).
    let v: { grade?: unknown; ts?: unknown };
    try {
      v = (typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue) as typeof v;
    } catch {
      continue;
    }
    if (!v || typeof v.ts !== "number") continue;
    out.push({ game, puzzleId, grade: String(v.grade ?? ""), ts: v.ts });
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
