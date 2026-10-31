// Learning + play-time endpoints for the signed-in child.
import type { FamilyDeps, FamilyResult } from "./accounts";
import { dataKey, householdKey, profileKey } from "./accounts";
import type { Household, ProfileRecord } from "./types";
import { verifySession } from "../profile/session";
import { featuresFor } from "./plans";
import { gradeFor } from "./settings";
import { SKILL_BY_ID, SKILL_FOR_GAME, SKILLS } from "./skills";
import { record, selectNext, simpleStrategy, type Mastery } from "./mastery";
import { askable, checkAnswer, makeItem, mulberry32 } from "./questions";
import * as W from "./wallet";
import { register, setProgressRoute, type Req } from "./router";
import { parentFrom } from "./accounts";

const err = (status: number, error: string): FamilyResult => ({ status, json: { error } });
const masteryKey = (u: string) => dataKey(u, "mastery");
const dayStore = (u: string, k: string) => dataKey(u, `day:${k}`);
const DAY_TTL = 60 * 24 * 3600;

interface Ctx { username: string; profile: ProfileRecord; hh: Household; day: string }

/** Resolve the signed-in child to a managed profile. null child => 401; unmanaged (legacy) => {unmanaged:true}. */
async function ctx(r: Req, d: FamilyDeps): Promise<Ctx | "unmanaged" | null> {
  const s = verifySession(r.childToken, d.secret, Math.floor(d.now / 1000));
  if (!s) return null;
  const profile = await d.kv.get<ProfileRecord>(profileKey(s.username));
  if (!profile) return "unmanaged";
  const hh = (await d.kv.get<Household>(householdKey(profile.householdId)))!;
  return { username: s.username, profile, hh, day: W.dayKey(d.now, hh.timezone) };
}
const loadDay = async (c: Ctx, d: FamilyDeps) => (await d.kv.get<W.Day>(dayStore(c.username, c.day))) ?? W.emptyDay();
const saveDay = (c: Ctx, day: W.Day, d: FamilyDeps) => d.kv.set(dayStore(c.username, c.day), day, { ttlSec: DAY_TTL });
const loadMastery = async (u: string, d: FamilyDeps) => (await d.kv.get<Mastery>(masteryKey(u))) ?? {};

export async function playStatus(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const c = await ctx(r, d);
  if (!c) return err(401, "unauthenticated");
  if (c === "unmanaged") return { status: 200, json: { ok: true, unmanaged: true } };
  return { status: 200, json: W.status(c.profile.settings, await loadDay(c, d)) };
}

export async function playTick(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const c = await ctx(r, d);
  if (!c) return err(401, "unauthenticated");
  if (c === "unmanaged") return { status: 200, json: { ok: true, unmanaged: true } };
  let day = W.tick(await loadDay(c, d), Number(r.body.seconds) || 0, d.now);
  if (r.body.round === true) day = { ...day, rounds: day.rounds + 1 };
  await saveDay(c, day, d);
  return { status: 200, json: W.status(c.profile.settings, day) };
}

export async function learnNext(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const c = await ctx(r, d);
  if (!c) return err(401, "unauthenticated");
  if (c === "unmanaged") return err(409, "not-in-household");
  const day = await loadDay(c, d);
  const features = await featuresFor(d.kv, c.hh.id, d.now);
  const count = Math.min(10, Math.max(1, Number(r.query.count) || c.profile.settings.mix.questionsPerBreak));
  if ((day.asked ?? 0) >= features.dailyQuestions) return err(402, "daily-limit");
  const mastery = await loadMastery(c.username, d);
  const grade = gradeFor(c.profile.birthYear, c.profile.settings.gradeOffset, new Date(d.now).getUTCFullYear());
  const rand = mulberry32((d.now ^ ((day.asked ?? 0) * 2654435761)) >>> 0);
  const items = [];
  for (let i = 0; i < count; i++) {
    const skill = selectNext({ grade, subjects: c.profile.settings.subjects, mastery, rand });
    if (skill && askable(skill.id)) items.push(makeItem(skill.id, grade, rand, d.secret));
  }
  if (!items.length) return err(409, "no-content");
  return { status: 200, json: { items, grade } };
}

export async function learnAnswer(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const c = await ctx(r, d);
  if (!c) return err(401, "unauthenticated");
  if (c === "unmanaged") return err(409, "not-in-household");
  const id = String(r.body.id ?? ""), token = String(r.body.token ?? ""), choice = String(r.body.choice ?? "");
  const skill = id.split("~")[0];
  if (!SKILL_BY_ID.has(skill) || !token) return err(400, "invalid");
  if (!(await d.kv.set(dataKey(c.username, `ans:${id}`), 1, { nx: true, ttlSec: 3600 }))) return err(409, "already-answered");
  const correct = checkAnswer(d.secret, id, token, choice);
  const day = await loadDay(c, d);
  const next: W.Day = {
    ...day, asked: (day.asked ?? 0) + 1, questions: day.questions + 1, correct: day.correct + (correct ? 1 : 0),
    earnedSec: day.earnedSec + (correct ? W.earnFor(c.profile.settings, 1) : 0),
  };
  await saveDay(c, next, d);
  await d.kv.set(masteryKey(c.username), record(await loadMastery(c.username, d), skill, correct, d.now));
  return { status: 200, json: { correct, ...W.status(c.profile.settings, next) } };
}

/** A finished puzzle from one of the educational games: counts toward its skill and earns time. */
export async function learnReport(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const c = await ctx(r, d);
  if (!c) return err(401, "unauthenticated");
  if (c === "unmanaged") return { status: 200, json: { ok: true, unmanaged: true } };
  const skill = SKILL_FOR_GAME.get(String(r.body.game ?? ""));
  if (!skill) return err(400, "unknown-game");
  const puzzleId = String(r.body.puzzleId ?? "");
  if (!puzzleId || !(await d.kv.set(dataKey(c.username, `done:${c.day}:${r.body.game}:${puzzleId}`), 1, { nx: true, ttlSec: DAY_TTL }))) {
    return { status: 200, json: { ok: true, duplicate: true } }; // same puzzle twice in a day earns once
  }
  const day = await loadDay(c, d);
  const next: W.Day = { ...day, correct: day.correct + W.PUZZLE_WEIGHT, questions: day.questions + W.PUZZLE_WEIGHT, earnedSec: day.earnedSec + W.earnFor(c.profile.settings, W.PUZZLE_WEIGHT) };
  await saveDay(c, next, d);
  await d.kv.set(masteryKey(c.username), record(await loadMastery(c.username, d), skill, true, d.now, 2));
  return { status: 200, json: W.status(c.profile.settings, next) };
}

/** Mastery summary for one child (their own via /me/progress, or a parent via /profiles/:u/progress). */
export async function progressFor(u: string, d: FamilyDeps): Promise<FamilyResult> {
  const m = await loadMastery(u, d);
  // Last 7 days of activity (newest first), from the per-day wallet records.
  const dayKeys = (await d.kv.keys(dataKey(u, "day:"))).sort().reverse().slice(0, 7);
  const days = await Promise.all(dayKeys.map(async (k) => {
    const x = (await d.kv.get<W.Day>(k))!;
    return { day: k.slice(dataKey(u, "day:").length), questions: x.questions, correct: x.correct, playMin: Math.round(x.spentSec / 60), earnedMin: Math.round(x.earnedSec / 60) };
  }));
  return {
    status: 200,
    json: {
      days,
      skills: SKILLS.filter((s) => m[s.id]).map((s) => ({ id: s.id, label: s.label, subject: s.subject, p: m[s.id].p, n: m[s.id].n, mastered: simpleStrategy.isMastered(m[s.id]) })),
    },
  };
}

register({
  "GET play/status": playStatus,
  "POST play/tick": playTick,
  "GET learn/next": learnNext,
  "POST learn/answer": learnAnswer,
  "POST learn/report": learnReport,
  "GET me/progress": async (r, d) => {
    const c = await ctx(r, d);
    return !c || c === "unmanaged" ? err(401, "unauthenticated") : progressFor(c.username, d);
  },
});

setProgressRoute(async (r, u, d) => {
  const parent = await parentFrom(r.tokens, d);
  if (!parent) return err(401, "parent-required");
  const p = await d.kv.get<ProfileRecord>(profileKey(u));
  if (!p || p.householdId !== parent.householdId) return err(404, "not-found");
  if (!(await featuresFor(d.kv, parent.householdId, d.now)).progressReports) return err(402, "plan-required");
  return progressFor(u, d);
});
