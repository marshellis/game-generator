export interface Consent { ts: number; textVersion: string; method: "attestation" | "card-check"; }

export interface ParentRecord {
  id: string;
  email: string;
  pwHash: string;
  householdId: string;
  createdAt: number;
  consent: Consent;
}

export interface Household {
  id: string;
  name: string;
  timezone: string; // IANA, decides when "a day" rolls over for allowances
  parentIds: string[];
  profiles: string[]; // child usernames (same namespace as legacy accounts)
  createdAt: number;
}

export interface ProfileRecord {
  username: string;
  householdId: string;
  birthYear: number;
  createdAt: number;
  pinHash?: string; // optional profile lock for the phone-handoff picker
  settings: ProfileSettings;
}

export type Preset = "off" | "light" | "balanced" | "heavy" | "custom";

export interface ProfileSettings {
  version: 1;
  mix: {
    preset: Preset;
    /** Minutes of play earned per minute of learning (a question is counted as ~20s). */
    playPerLearn: number;
    /** Questions the parent wants done per day (a target shown in reports; also the soft cap before bonus). */
    dailyLearningTarget: number;
    /** Show a short learning break every N finished rounds (0 = only when out of play time). */
    breakEveryRounds: number;
    questionsPerBreak: number;
  };
  allowance: {
    freePlayMin: number; // given each day without learning
    maxPlayMin: number; // hard ceiling per day, free + earned
  };
  enforcement: "soft" | "hard"; // soft: out of time -> offer a learning break; hard: just stop
  subjects: Record<string, boolean>; // subject id -> enabled
  gradeOffset: number; // -2..2 relative to the grade implied by birth year
  leaderboard: boolean; // show nickname on public leaderboards
}
