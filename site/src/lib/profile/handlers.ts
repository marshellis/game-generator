import type { Deps, HandlerResult } from "./types";
import { normalizeUsername, validateUsername, validatePin, hashPin, verifyPin } from "./auth";
import { signSession, verifySession, SESSION_MAX_AGE_SEC } from "./session";
import { parseCompletions, groupByGame, completionField } from "./completions";
import { sanitizeAvatar, sanitizeColor } from "./avatars";
import { scoreGameAllowed, coopScoreGameAllowed, canonicalPair, validateScore, clampLimit } from "./scores";

const LOCKOUT_MAX = 8;
const LOCKOUT_TTL_SEC = 15 * 60;
const KNOWN_GAMES = new Set([
  "logic-grid", "math-packet", "maze", "sudoku", "word-search", "kenken",
]);

function sessionCookie(username: string, deps: Deps) {
  const nowSec = Math.floor(deps.now / 1000);
  return { value: signSession(username, deps.secret, nowSec), maxAgeSec: SESSION_MAX_AGE_SEC };
}

function authed(token: string | undefined, deps: Deps): string | null {
  const s = verifySession(token, deps.secret, Math.floor(deps.now / 1000));
  return s?.username ?? null;
}

export async function signup(
  input: { username?: string; pin?: string; avatar?: string; avatarColor?: string },
  deps: Deps,
): Promise<HandlerResult> {
  const username = normalizeUsername(input.username ?? "");
  const pin = (input.pin ?? "").trim();
  if (!validateUsername(username) || !validatePin(pin)) return { status: 400, json: { error: "invalid" } };
  const avatar = sanitizeAvatar(input.avatar);
  const avatarColor = sanitizeColor(input.avatarColor);
  const created = await deps.store.createUser(username, { pinHash: hashPin(pin), createdAt: deps.now, avatar, avatarColor });
  if (!created) return { status: 409, json: { error: "taken" } };
  return { status: 201, json: { username, avatar, avatarColor }, cookie: sessionCookie(username, deps) };
}

export async function login(input: { username?: string; pin?: string }, deps: Deps): Promise<HandlerResult> {
  const username = normalizeUsername(input.username ?? "");
  const pin = (input.pin ?? "").trim();
  if (!validateUsername(username) || !validatePin(pin)) return { status: 400, json: { error: "invalid" } };
  if ((await deps.store.getLockout(username)) >= LOCKOUT_MAX) return { status: 429, json: { error: "locked" } };
  const user = await deps.store.getUser(username);
  if (!user || !verifyPin(pin, user.pinHash)) {
    await deps.store.bumpLockout(username, LOCKOUT_TTL_SEC);
    return { status: 401, json: { error: "bad-credentials" } };
  }
  return {
    status: 200,
    json: { username, avatar: sanitizeAvatar(user.avatar), avatarColor: sanitizeColor(user.avatarColor) },
    cookie: sessionCookie(username, deps),
  };
}

export function logout(): HandlerResult {
  return { status: 204, cookie: { clear: true } };
}

export async function me(token: string | undefined, deps: Deps): Promise<HandlerResult> {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  const user = await deps.store.getUser(username);
  return { status: 200, json: { username, avatar: sanitizeAvatar(user?.avatar), avatarColor: sanitizeColor(user?.avatarColor) } };
}

export async function listCompletions(token: string | undefined, deps: Deps): Promise<HandlerResult> {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  const completions = parseCompletions(await deps.store.getCompletions(username));
  return { status: 200, json: { completions, groups: groupByGame(completions), total: completions.length } };
}

export async function recordCompletion(
  token: string | undefined,
  input: { game?: string; puzzleId?: string; grade?: string },
  deps: Deps,
): Promise<HandlerResult> {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  const game = String(input.game ?? "");
  const puzzleId = String(input.puzzleId ?? "");
  const grade = String(input.grade ?? "");
  if (!KNOWN_GAMES.has(game) || !puzzleId) return { status: 400, json: { error: "invalid" } };
  await deps.store.putCompletion(username, completionField(game, puzzleId), { grade, ts: deps.now });
  return { status: 200, json: { ok: true } };
}

export async function submitScore(
  token: string | undefined,
  input: { game?: string; score?: unknown },
  deps: Deps,
): Promise<HandlerResult> {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  const game = String(input.game ?? "");
  if (!scoreGameAllowed(game) || !validateScore(input.score)) {
    return { status: 400, json: { error: "invalid" } };
  }
  const prev = await deps.store.userBest(game, username);
  const best = await deps.store.bumpScore(game, username, input.score);
  return { status: 200, json: { game, score: input.score, best, improved: input.score > prev } };
}

/**
 * Delete the caller's OWN leaderboard entry for a game. Auth-scoped to the
 * session user, so nobody can wipe anyone else's record server-side — in
 * Glass Bridge the wheel of misfortune makes the LOSER's client call this.
 */
export async function deleteScore(
  token: string | undefined,
  input: { game?: string },
  deps: Deps,
): Promise<HandlerResult> {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  const game = String(input.game ?? "");
  if (!scoreGameAllowed(game)) return { status: 400, json: { error: "invalid" } };
  await deps.store.removeScore(game, username);
  return { status: 200, json: { ok: true, game } };
}

/**
 * Co-op leaderboard: a score belongs to the *pair* (caller + partner), stored
 * under one canonical member so ("alice","bob") and ("bob","alice") share a row.
 * Both players post the same pair + score independently; the highest is kept.
 * The partner must be a real existing user, which bounds the pair key space.
 */
export async function submitPairScore(
  token: string | undefined,
  input: { game?: string; score?: unknown; partner?: string },
  deps: Deps,
): Promise<HandlerResult> {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  const game = String(input.game ?? "");
  if (!coopScoreGameAllowed(game) || !validateScore(input.score)) {
    return { status: 400, json: { error: "invalid" } };
  }
  const partner = normalizeUsername(input.partner ?? "");
  if (!validateUsername(partner) || partner === username) return { status: 400, json: { error: "invalid-partner" } };
  if (!(await deps.store.getUser(partner))) return { status: 400, json: { error: "no-partner" } };
  const pair = canonicalPair(username, partner);
  const prev = await deps.store.userBest(game, pair);
  const best = await deps.store.bumpScore(game, pair, input.score);
  return { status: 200, json: { game, pair, score: input.score, best, improved: input.score > prev } };
}

/** Public — no auth. Anyone can read a game's leaderboard. */
export async function leaderboard(
  input: { game?: string; limit?: unknown },
  deps: Deps,
): Promise<HandlerResult> {
  const game = String(input.game ?? "");
  if (!scoreGameAllowed(game) && !coopScoreGameAllowed(game)) return { status: 400, json: { error: "invalid" } };
  const rows = await deps.store.topScores(game, clampLimit(input.limit));
  const top = rows.map((row, i) => ({ rank: i + 1, ...row }));
  return { status: 200, json: { game, top } };
}
