// Arcade high-score leaderboards. Arcade games are discovered dynamically, but
// only games on this allowlist may post to the shared leaderboard — so a random
// or hostile slug can't create unbounded Redis keys. Add a slug here when a new
// arcade game should keep a global leaderboard.
export const SCORE_GAMES = new Set<string>(["flappy", "snowball-arena", "bounce", "net-rally", "ragdoll-siege", "ragdoll-soccer", "glass-bridge", "hex-collapse", "nexus-stairs", "nexus-race"]);

// Boards where the LOWEST value wins (race times). Every other board ranks highest first. A slug here must
// also be in SCORE_GAMES (or COOP_SCORE_GAMES). Values are integers; "nexus-race" is the finish time in
// centiseconds. A lower-is-better value must be > 0: 0 is also the "no entry" answer of Store.userBest.
export const LOWER_IS_BETTER = new Set<string>(["nexus-race"]);

export type ScoreDirection = "higher" | "lower";

export function scoreDirection(game: string): ScoreDirection {
  return LOWER_IS_BETTER.has(game) ? "lower" : "higher";
}

/** True when `a` beats `b` on this board (strictly). */
export function beats(game: string, a: number, b: number): boolean {
  return scoreDirection(game) === "lower" ? a < b : a > b;
}

export function scoreGameAllowed(game: string): boolean {
  return SCORE_GAMES.has(game);
}

// Co-op leaderboards are keyed by a *pair* of players, not a single user. A
// separate allowlist keeps these slugs distinct from the solo boards so a pair
// score can never be posted to (or read from) a single-player board.
export const COOP_SCORE_GAMES = new Set<string>(["net-rally-duo", "ragdoll-siege-coop"]);

export function coopScoreGameAllowed(game: string): boolean {
  return COOP_SCORE_GAMES.has(game);
}

/**
 * A stable, order-independent leaderboard member for a pair of players.
 * Usernames match /^[a-z0-9_-]{3,20}$/, so "&" never occurs inside one — it's a
 * safe separator, and sorting makes ("alice","bob") and ("bob","alice") collide.
 */
export function canonicalPair(a: string, b: string): string {
  return [a, b].sort().join("&");
}

// A sane upper bound: high enough that no honest run hits it, low enough that a
// tampered request can't poison the board with Number.MAX_SAFE_INTEGER.
export const MAX_SCORE = 1_000_000;

/** A valid score is a non-negative integer within the cap. */
export function validateScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;
}

/** validateScore for a specific board: lower-is-better boards also refuse 0 (an impossible time). */
export function validateScoreFor(game: string, n: unknown): n is number {
  return validateScore(n) && (n > 0 || scoreDirection(game) === "higher");
}

export const DEFAULT_LEADERBOARD_LIMIT = 10;
export const MAX_LEADERBOARD_LIMIT = 100;

/** Clamp a caller-supplied limit to [1, MAX], defaulting when absent/garbage. */
export function clampLimit(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LEADERBOARD_LIMIT;
  return Math.min(n, MAX_LEADERBOARD_LIMIT);
}
