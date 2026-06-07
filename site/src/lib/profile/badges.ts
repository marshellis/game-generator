// Pure, client-derivable achievements: from the completions a kid has already
// recorded (game / grade / ts) we compute earnable badges + a daily streak.
// No backend, no extra storage — every badge is a function of the completion
// list. The profile renders these as a trophy shelf and the solve handler pops
// a toast when a new one is freshly earned.
import type { Completion } from "./types";

const DAY = 86_400_000;

/** Local-day bucket for a timestamp, as YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Consecutive days of play ending today (or yesterday, so a kid who played
 * yesterday but not yet today keeps a live streak). Multiple solves in one day
 * count once.
 */
export function currentStreak(cs: Completion[], now: number): number {
  if (cs.length === 0) return 0;
  const days = new Set(cs.map((c) => dayKey(c.ts)));
  let anchor: number;
  if (days.has(dayKey(now))) anchor = now;
  else if (days.has(dayKey(now - DAY))) anchor = now - DAY;
  else return 0;
  let streak = 0;
  while (days.has(dayKey(anchor - streak * DAY))) streak++;
  return streak;
}

export type BadgeGroup = "streak" | "milestone" | "variety" | "mastery";

export interface Badge {
  id: string;
  emoji: string;
  label: string;
  /** Earned: past-tense praise. Unearned: how to get it. */
  description: string;
  group: BadgeGroup;
  earned: boolean;
  have: number;
  need: number;
}

const MILESTONES: Array<{ id: string; emoji: string; label: string; need: number }> = [
  { id: "m1", emoji: "🌟", label: "First Solve", need: 1 },
  { id: "m5", emoji: "🖐️", label: "High Five", need: 5 },
  { id: "m10", emoji: "🔟", label: "Perfect Ten", need: 10 },
  { id: "m25", emoji: "🏅", label: "Puzzle Pro", need: 25 },
  { id: "m50", emoji: "🏆", label: "Puzzle Legend", need: 50 },
];

// Display order matches the home page; emoji/label tuned to feel like a prize.
const MASTERY: Array<{ game: string; emoji: string; label: string }> = [
  { game: "logic-grid", emoji: "🧩", label: "Logic Master" },
  { game: "math-packet", emoji: "🔢", label: "Math Whiz" },
  { game: "maze", emoji: "🌀", label: "Maze Master" },
  { game: "sudoku", emoji: "⭐", label: "Sudoku Star" },
  { game: "word-search", emoji: "🔎", label: "Word Hunter" },
  { game: "kenken", emoji: "✖️", label: "KenKen King" },
];
const MASTERY_NEED = 5;

const STREAKS: Array<{ id: string; emoji: string; label: string; need: number }> = [
  { id: "streak3", emoji: "🔥", label: "On Fire", need: 3 },
  { id: "streak7", emoji: "📅", label: "Week Streak", need: 7 },
];

const mk = (
  base: { id: string; emoji: string; label: string; need: number },
  group: BadgeGroup,
  have: number,
  earnedText: string,
  unearnedText: string,
): Badge => ({
  ...base,
  group,
  have,
  earned: have >= base.need,
  description: have >= base.need ? earnedText : unearnedText,
});

/** All badges (earned + in-progress), in display order. Pure. */
export function deriveBadges(cs: Completion[], now: number): Badge[] {
  const total = cs.length;
  const perGame = new Map<string, number>();
  for (const c of cs) perGame.set(c.game, (perGame.get(c.game) ?? 0) + 1);
  const streak = currentStreak(cs, now);
  const gamesPlayed = perGame.size;

  const out: Badge[] = [];

  for (const s of STREAKS) {
    out.push(mk(s, "streak", streak, `${s.need}-day streak — keep it going!`, `Play ${s.need} days in a row`));
  }

  for (const m of MILESTONES) {
    const p = m.need === 1 ? "puzzle" : "puzzles";
    out.push(mk(m, "milestone", total, `Solved ${m.need} ${p}`, `Solve ${m.need} ${p}`));
  }

  out.push(
    mk({ id: "sampler", emoji: "🎲", label: "Sampler", need: MASTERY.length }, "variety", gamesPlayed,
      "Played every game", `Play all ${MASTERY.length} games`),
  );

  for (const m of MASTERY) {
    const have = perGame.get(m.game) ?? 0;
    out.push(
      mk({ id: `mastery-${m.game}`, emoji: m.emoji, label: m.label, need: MASTERY_NEED }, "mastery", have,
        `Solved ${MASTERY_NEED} — ${m.label}!`, `Solve ${MASTERY_NEED} to earn ${m.label}`),
    );
  }

  return out;
}

/** Ids of currently-earned badges — for diffing against a "seen" set. */
export function earnedBadgeIds(cs: Completion[], now: number): string[] {
  return deriveBadges(cs, now).filter((b) => b.earned).map((b) => b.id);
}
