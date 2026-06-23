export interface UserRecord {
  pinHash: string;
  createdAt: number; // epoch ms
  avatar?: string; // allowlisted emoji (see avatars.ts); absent on pre-avatar records
  avatarColor?: string; // allowlisted hex
}

export interface Completion {
  game: string;
  puzzleId: string;
  grade: string;
  ts: number; // epoch ms
}

/** The value stored per completion hash field. */
export interface CompletionValue {
  grade: string;
  ts: number; // epoch ms
}

/** One row of a game's leaderboard. */
export interface ScoreEntry {
  username: string;
  score: number;
}

export interface Store {
  getUser(username: string): Promise<UserRecord | null>;
  /** Atomic create. Returns false if the username already exists. */
  createUser(username: string, rec: UserRecord): Promise<boolean>;
  /**
   * Completions hash: field "game:puzzleId" -> CompletionValue. Stored as an
   * object (the @upstash/redis client (de)serializes JSON automatically, the
   * same way user records are stored/read).
   */
  getCompletions(username: string): Promise<Record<string, unknown>>;
  putCompletion(username: string, field: string, value: CompletionValue): Promise<void>;
  /** Increment the lockout counter, setting TTL on first hit. Returns new count. */
  bumpLockout(username: string, ttlSec: number): Promise<number>;
  getLockout(username: string): Promise<number>;
  /**
   * Leaderboard sorted set per game ("leaderboard:<game>"): member=username,
   * score=best. Raises the player's entry to max(existing, score) and returns
   * the resulting best.
   */
  bumpScore(game: string, username: string, score: number): Promise<number>;
  /** Top N rows for a game, highest score first. */
  topScores(game: string, limit: number): Promise<ScoreEntry[]>;
  /** A single player's best for a game (0 if none recorded). */
  userBest(game: string, username: string): Promise<number>;
}

export type Cookie = { value: string; maxAgeSec: number } | { clear: true };

export interface HandlerResult {
  status: number;
  json?: unknown;
  cookie?: Cookie;
}

export interface Deps {
  store: Store;
  secret: string;
  now: number; // epoch ms
}
