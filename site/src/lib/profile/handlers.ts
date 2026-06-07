import type { Deps, HandlerResult } from "./types";
import { normalizeUsername, validateUsername, validatePin, hashPin, verifyPin } from "./auth";
import { signSession, verifySession, SESSION_MAX_AGE_SEC } from "./session";
import { parseCompletions, groupByGame, completionField } from "./completions";

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

export async function signup(input: { username?: string; pin?: string }, deps: Deps): Promise<HandlerResult> {
  const username = normalizeUsername(input.username ?? "");
  const pin = (input.pin ?? "").trim();
  if (!validateUsername(username) || !validatePin(pin)) return { status: 400, json: { error: "invalid" } };
  const created = await deps.store.createUser(username, { pinHash: hashPin(pin), createdAt: deps.now });
  if (!created) return { status: 409, json: { error: "taken" } };
  return { status: 201, json: { username }, cookie: sessionCookie(username, deps) };
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
  return { status: 200, json: { username }, cookie: sessionCookie(username, deps) };
}

export function logout(): HandlerResult {
  return { status: 204, cookie: { clear: true } };
}

export function me(token: string | undefined, deps: Deps): HandlerResult {
  const username = authed(token, deps);
  if (!username) return { status: 401, json: { error: "unauthenticated" } };
  return { status: 200, json: { username } };
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
  await deps.store.putCompletion(username, completionField(game, puzzleId), JSON.stringify({ grade, ts: deps.now }));
  return { status: 200, json: { ok: true } };
}
