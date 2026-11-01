// The play-time wallet. Pure arithmetic over a per-day record; the server is the source of truth,
// so a clever kid editing the page cannot mint minutes.
import type { ProfileSettings } from "./types";

export interface Day { spentSec: number; earnedSec: number; asked: number; questions: number; correct: number; rounds: number; lastTick: number; puzzles?: number }
export const emptyDay = (): Day => ({ spentSec: 0, earnedSec: 0, asked: 0, questions: 0, correct: 0, rounds: 0, lastTick: 0 });

/** Seconds of play one question is worth when answered correctly: ~20s of learning at the parent's ratio. */
export const SEC_PER_QUESTION = 20;
/** A finished puzzle from the educational games counts as this many correct answers. */
export const PUZZLE_WEIGHT = 3;
/** Puzzles that can earn play time per day. Stops "report a finished puzzle" being a time printer. */
export const PUZZLE_DAILY_CAP = 10;

export function earnFor(s: ProfileSettings, correctAnswers: number): number {
  return Math.round(correctAnswers * SEC_PER_QUESTION * s.mix.playPerLearn);
}

/** Calendar day in the household's timezone, so "today's allowance" rolls over at the family's midnight. */
export function dayKey(nowMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));
}

export interface PlayStatus {
  ok: boolean;
  remainingSec: number;
  reason?: "learn" | "limit";
  /** Show a short learning break now (a round-count break or out of time). */
  breakNow: boolean;
  questionsPerBreak: number;
  learnedToday: number;
  dailyLearningTarget: number;
}

export function status(s: ProfileSettings, day: Day): PlayStatus {
  const cap = s.allowance.maxPlayMin * 60;
  const learningOff = s.mix.playPerLearn === 0;
  // With learning switched off the whole allowance is free; otherwise free time + earned time, up to the cap.
  const budget = learningOff ? cap : Math.min(cap, s.allowance.freePlayMin * 60 + day.earnedSec);
  const remainingSec = Math.max(0, budget - day.spentSec);
  const atCap = budget >= cap;
  const out = remainingSec <= 0;
  const reason = !out ? undefined : atCap || s.enforcement === "hard" || learningOff ? "limit" : "learn";
  const everyN = s.mix.breakEveryRounds;
  const roundBreak = !learningOff && everyN > 0 && day.rounds > 0 && day.rounds % everyN === 0;
  return {
    ok: !out, remainingSec, reason,
    breakNow: reason === "learn" || (!out && roundBreak && day.questions < s.mix.dailyLearningTarget),
    questionsPerBreak: s.mix.questionsPerBreak, learnedToday: day.correct, dailyLearningTarget: s.mix.dailyLearningTarget,
  };
}

/** Guests (no account) get one flat daily allowance and cannot earn more; the only way on is to make a profile. */
export const DEFAULT_GUEST_MIN = 15;
/** Seconds of guest play per day from GUEST_PLAY_MIN (default 15; "off" = unlimited => null). */
export function guestLimitSec(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return DEFAULT_GUEST_MIN * 60;
  if (raw.trim().toLowerCase() === "off") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : DEFAULT_GUEST_MIN * 60;
}
export function guestStatus(day: Day, limitSec: number | null): PlayStatus & { guest: true; limitSec: number | null } {
  const remainingSec = limitSec === null ? 99 * 3600 : Math.max(0, limitSec - day.spentSec);
  const out = remainingSec <= 0;
  return { ok: !out, remainingSec, reason: out ? "limit" : undefined, breakNow: false, questionsPerBreak: 0, learnedToday: 0, dailyLearningTarget: 0, guest: true, limitSec };
}

/** Credit elapsed play. The client reports seconds; the server trusts at most what the clock allows. */
export function tick(day: Day, reportedSec: number, nowMs: number): Day {
  const gap = day.lastTick ? (nowMs - day.lastTick) / 1000 : 0;
  // Credit is bounded by real elapsed time (credit is rounded). A flat per-tick allowance would let a
  // burst of ticks in one instant drain a child's whole day, so tolerance must not accumulate.
  const max = day.lastTick && gap < 90 ? gap : 10; // a first/stale tick can only claim 10s
  const credit = Math.max(0, Math.min(reportedSec, 30, max));
  return { ...day, spentSec: day.spentSec + Math.round(credit), lastTick: nowMs };
}
