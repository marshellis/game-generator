// Mastery tracking + "what next". Deliberately simple and swappable: `Strategy` is the seam where
// Bayesian knowledge tracing (or anything else) can replace the default without touching callers.
import { SKILLS, SKILL_BY_ID, type Skill } from "./skills";

export interface SkillState { p: number; n: number; last: number } // p = estimated chance the kid knows it
export type Mastery = Record<string, SkillState>;

export interface Strategy {
  update(prev: SkillState | undefined, correct: boolean, nowMs: number): SkillState;
  isMastered(s: SkillState | undefined): boolean;
}

export const simpleStrategy: Strategy = {
  update(prev, correct, now) {
    const p0 = prev?.p ?? 0.3; // prior: probably not yet known
    const p = correct ? p0 + (1 - p0) * 0.3 : p0 - p0 * 0.25;
    return { p: Math.round(p * 1000) / 1000, n: (prev?.n ?? 0) + 1, last: now };
  },
  isMastered: (s) => !!s && s.p >= 0.85 && s.n >= 5,
};

export function record(m: Mastery, skill: string, correct: boolean, nowMs: number, weight = 1, st: Strategy = simpleStrategy): Mastery {
  let cur = m[skill];
  for (let i = 0; i < weight; i++) cur = st.update(cur, correct, nowMs);
  return { ...m, [skill]: cur };
}

export interface PickInput {
  grade: number;
  subjects: Record<string, boolean>;
  mastery: Mastery;
  rand: () => number;
  strategy?: Strategy;
}

/** Pick the next askable skill: in-grade, subject enabled, prerequisites ready, weighted to the weakest. */
export function selectNext(x: PickInput): Skill | null {
  const st = x.strategy ?? simpleStrategy;
  const ok = SKILLS.filter((s) => s.ask && x.subjects[s.subject] !== false && s.grades[0] <= x.grade && x.grade <= s.grades[1]);
  if (!ok.length) return null;
  const ready = (s: Skill) => s.prereqs.every((id) => {
    const pre = SKILL_BY_ID.get(id)!, state = x.mastery[id];
    // A prerequisite counts as satisfied when learned, or when it is a grade-level behind the kid and untouched.
    return (state && state.p >= 0.6) || (!state && pre.grades[1] < x.grade);
  });
  const fresh = ok.filter((s) => ready(s) && !st.isMastered(x.mastery[s.id]));
  const review = ok.filter((s) => ready(s) && st.isMastered(x.mastery[s.id]));
  // One question in five revisits something already mastered, so skills do not decay unnoticed.
  const pool = fresh.length && !(review.length && x.rand() < 0.2) ? fresh : review.length ? review : ok;
  const weights = pool.map((s) => 1.1 - (x.mastery[s.id]?.p ?? 0.3));
  let r = x.rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
