export interface UserRecord {
  pinHash: string;
  createdAt: number; // epoch ms
}

export interface Completion {
  game: string;
  puzzleId: string;
  grade: string;
  ts: number; // epoch ms
}

export interface Store {
  getUser(username: string): Promise<UserRecord | null>;
  /** Atomic create. Returns false if the username already exists. */
  createUser(username: string, rec: UserRecord): Promise<boolean>;
  /** Raw completions hash: field "game:puzzleId" -> JSON string. */
  getCompletions(username: string): Promise<Record<string, string>>;
  putCompletion(username: string, field: string, value: string): Promise<void>;
  /** Increment the lockout counter, setting TTL on first hit. Returns new count. */
  bumpLockout(username: string, ttlSec: number): Promise<number>;
  getLockout(username: string): Promise<number>;
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
