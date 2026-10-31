import type { Preset, ProfileSettings } from "./types";

export const SUBJECTS = ["math", "logic", "language", "spatial"] as const;

/** Presets are just shortcuts over playPerLearn; "custom" keeps whatever the parent typed. */
export const PRESETS: Record<Exclude<Preset, "custom">, number> = { off: 0, light: 4, balanced: 2, heavy: 1 };

export function defaultSettings(): ProfileSettings {
  return {
    version: 1,
    mix: { preset: "balanced", playPerLearn: PRESETS.balanced, dailyLearningTarget: 10 },
    allowance: { freePlayMin: 20, maxPlayMin: 90 },
    enforcement: "soft",
    subjects: Object.fromEntries(SUBJECTS.map((s) => [s, true])),
    gradeOffset: 0,
    leaderboard: true,
  };
}

const num = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.min(hi, Math.max(lo, n));
};

/** Validate any (possibly partial / hostile) settings patch against the defaults. Never throws. */
export function sanitizeSettings(input: unknown, base: ProfileSettings = defaultSettings()): ProfileSettings {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const mix = i.mix ?? {};
  const preset: Preset = ["off", "light", "balanced", "heavy", "custom"].includes(mix.preset) ? mix.preset : base.mix.preset;
  const playPerLearn = preset === "custom"
    ? num(mix.playPerLearn, 0, 20, base.mix.playPerLearn)
    : PRESETS[preset];
  const a = i.allowance ?? {};
  const freePlayMin = num(a.freePlayMin, 0, 600, base.allowance.freePlayMin);
  const maxPlayMin = Math.max(freePlayMin, num(a.maxPlayMin, 0, 1440, base.allowance.maxPlayMin));
  const subjects = { ...base.subjects };
  if (i.subjects && typeof i.subjects === "object") {
    for (const s of SUBJECTS) if (typeof i.subjects[s] === "boolean") subjects[s] = i.subjects[s];
  }
  return {
    version: 1,
    mix: { preset, playPerLearn, dailyLearningTarget: Math.round(num(mix.dailyLearningTarget, 0, 200, base.mix.dailyLearningTarget)) },
    allowance: { freePlayMin, maxPlayMin },
    enforcement: i.enforcement === "hard" || i.enforcement === "soft" ? i.enforcement : base.enforcement,
    subjects,
    gradeOffset: Math.round(num(i.gradeOffset, -2, 2, base.gradeOffset)),
    leaderboard: typeof i.leaderboard === "boolean" ? i.leaderboard : base.leaderboard,
  };
}

/** Grade implied by birth year (age 6 -> grade 1), clamped to the platform's g1-g8 range, plus the parent's offset. */
export function gradeFor(birthYear: number, offset: number, nowYear: number): number {
  const age = nowYear - birthYear;
  return Math.min(8, Math.max(1, age - 5 + offset));
}
