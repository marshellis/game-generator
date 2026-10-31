// Parent accounts, households and child profiles.
//
// A child profile IS a legacy games account (same username namespace) so leaderboards, trophies and
// saved puzzles keep working; the profile just also belongs to a household. Profiles created here have
// no PIN-login of their own (pinHash ""), they are reached only through a parent's device.
//
// Three cookies, three strengths:
//   mg_parent    30 min  - parent proved the password; needed for settings, billing, deleting data
//   mg_household 1 year  - this device belongs to the household; can list + switch child profiles
//   mg_session   90 days - the existing per-child session (see ../profile/session.ts)
import { randomBytes } from "node:crypto";
import type { KV } from "./kv";
import type { Store } from "../profile/types";
import type { Household, ParentRecord, ProfileRecord, ProfileSettings } from "./types";
import { defaultSettings, sanitizeSettings } from "./settings";
import { hashPin as hashSecret, verifyPin as verifySecret, normalizeUsername, validateUsername, validatePin } from "../profile/auth";
import { signSession, SESSION_MAX_AGE_SEC } from "../profile/session";
import { sanitizeAvatar, sanitizeColor } from "../profile/avatars";
import { signToken, verifyToken } from "./token";
import { featuresFor } from "./plans";

export const CONSENT_TEXT_VERSION = "2026-10-30-draft";
export const PARENT_COOKIE = "mg_parent";
export const HOUSEHOLD_COOKIE = "mg_household";
export const PARENT_MAX_AGE = 30 * 60;
export const HOUSEHOLD_MAX_AGE = 365 * 24 * 3600;

export interface FamilyDeps { kv: KV; store: Store; secret: string; now: number; }
export type CookieOp = { name: string; value?: string; maxAgeSec?: number; clear?: true };
export interface FamilyResult { status: number; json?: unknown; cookies?: CookieOp[]; }
export interface Tokens { parent?: string; household?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rid = () => randomBytes(8).toString("hex");
const nowSec = (d: FamilyDeps) => Math.floor(d.now / 1000);
const err = (status: number, error: string): FamilyResult => ({ status, json: { error } });

export const parentKey = (email: string) => `parent:${email}`;
export const parentIdKey = (id: string) => `parentid:${id}`;
export const householdKey = (id: string) => `hh:${id}`;
export const profileKey = (u: string) => `profile:${u}`;

// ---- session resolution -----------------------------------------------------------------------
export async function parentFrom(t: Tokens, d: FamilyDeps): Promise<ParentRecord | null> {
  const id = verifyToken("parent", t.parent, d.secret, nowSec(d), PARENT_MAX_AGE);
  return id ? d.kv.get<ParentRecord>(parentIdKey(id)) : null;
}
export async function householdIdFrom(t: Tokens, d: FamilyDeps): Promise<string | null> {
  return verifyToken("household", t.household, d.secret, nowSec(d), HOUSEHOLD_MAX_AGE) ?? (await parentFrom(t, d))?.householdId ?? null;
}
const deviceCookies = (p: ParentRecord, d: FamilyDeps): CookieOp[] => [
  { name: PARENT_COOKIE, value: signToken("parent", p.id, d.secret, nowSec(d)), maxAgeSec: PARENT_MAX_AGE },
  { name: HOUSEHOLD_COOKIE, value: signToken("household", p.householdId, d.secret, nowSec(d)), maxAgeSec: HOUSEHOLD_MAX_AGE },
];

// ---- parent signup / login ---------------------------------------------------------------------
export async function signupParent(
  input: { email?: string; password?: string; householdName?: string; timezone?: string; consent?: boolean },
  d: FamilyDeps,
): Promise<FamilyResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  if (!EMAIL_RE.test(email) || email.length > 120) return err(400, "invalid-email");
  if (password.length < 10 || password.length > 200) return err(400, "weak-password");
  if (input.consent !== true) return err(400, "consent-required");
  const householdId = rid(), id = rid();
  const parent: ParentRecord = {
    id, email, householdId, createdAt: d.now, pwHash: hashSecret(password),
    // Method upgrades to "card-check" once the Stripe setup-intent check is wired (see billing.ts).
    consent: { ts: d.now, textVersion: CONSENT_TEXT_VERSION, method: "attestation" },
  };
  if (!(await d.kv.set(parentKey(email), id, { nx: true }))) return err(409, "email-taken");
  const tz = typeof input.timezone === "string" && validTz(input.timezone) ? input.timezone : "America/Denver";
  const hh: Household = {
    id: householdId, name: String(input.householdName ?? "").trim().slice(0, 40) || "Our family",
    timezone: tz, parentIds: [id], profiles: [], createdAt: d.now,
  };
  await d.kv.set(parentIdKey(id), parent);
  await d.kv.set(householdKey(householdId), hh);
  return { status: 201, json: { household: publicHousehold(hh) }, cookies: deviceCookies(parent, d) };
}

function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

export async function loginParent(input: { email?: string; password?: string }, d: FamilyDeps): Promise<FamilyResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return err(400, "invalid");
  const lockKey = `plock:${email}`;
  if (Number((await d.kv.get<number>(lockKey)) ?? 0) >= 8) return err(429, "locked");
  const id = await d.kv.get<string>(parentKey(email));
  const parent = id ? await d.kv.get<ParentRecord>(parentIdKey(id)) : null;
  if (!parent || !verifySecret(String(input.password ?? ""), parent.pwHash)) {
    await d.kv.incr(lockKey, 15 * 60);
    return err(401, "bad-credentials");
  }
  const hh = (await d.kv.get<Household>(householdKey(parent.householdId)))!;
  return { status: 200, json: { household: publicHousehold(hh) }, cookies: deviceCookies(parent, d) };
}

/** Leave "parent mode" (the kid gets the phone back); the device stays linked to the household. */
export function lockParent(): FamilyResult {
  return { status: 204, cookies: [{ name: PARENT_COOKIE, clear: true }] };
}

const publicHousehold = (h: Household) => ({ id: h.id, name: h.name, timezone: h.timezone });

// ---- profiles ----------------------------------------------------------------------------------
async function loadProfiles(hh: Household, d: FamilyDeps) {
  return (await Promise.all(hh.profiles.map((u) => d.kv.get<ProfileRecord>(profileKey(u))))).filter(Boolean) as ProfileRecord[];
}

/** Picker data for the kid-facing screen: needs only the device link, reveals no birth year or settings. */
export async function listPicker(t: Tokens, d: FamilyDeps): Promise<FamilyResult> {
  const hid = await householdIdFrom(t, d);
  const hh = hid ? await d.kv.get<Household>(householdKey(hid)) : null;
  if (!hh) return err(401, "no-household");
  const rows = await Promise.all(hh.profiles.map(async (u) => {
    const [p, user] = await Promise.all([d.kv.get<ProfileRecord>(profileKey(u)), d.store.getUser(u)]);
    return { username: u, avatar: sanitizeAvatar(user?.avatar), avatarColor: sanitizeColor(user?.avatarColor), locked: !!p?.pinHash };
  }));
  return { status: 200, json: { household: publicHousehold(hh), profiles: rows } };
}

export async function switchProfile(t: Tokens, input: { username?: string; pin?: string }, d: FamilyDeps): Promise<FamilyResult> {
  const hid = await householdIdFrom(t, d);
  const username = normalizeUsername(input.username ?? "");
  const p = await d.kv.get<ProfileRecord>(profileKey(username));
  if (!hid || !p || p.householdId !== hid) return err(403, "not-in-household");
  if (p.pinHash) {
    const lock = `slock:${username}`;
    if (Number((await d.kv.get<number>(lock)) ?? 0) >= 8) return err(429, "locked");
    if (!verifySecret(String(input.pin ?? ""), p.pinHash)) { await d.kv.incr(lock, 15 * 60); return err(401, "bad-pin"); }
  }
  // Same cookie the legacy login sets, so every existing endpoint recognises this child.
  return { status: 200, json: { username }, cookies: [{ name: "mg_session", value: signSession(username, d.secret, nowSec(d)), maxAgeSec: SESSION_MAX_AGE_SEC }] };
}

export async function getHousehold(t: Tokens, d: FamilyDeps): Promise<FamilyResult> {
  const parent = await parentFrom(t, d);
  if (!parent) return err(401, "parent-required");
  const hh = (await d.kv.get<Household>(householdKey(parent.householdId)))!;
  const profiles = await loadProfiles(hh, d);
  const features = await featuresFor(d.kv, hh.id, d.now);
  return {
    status: 200,
    json: {
      household: publicHousehold(hh), email: parent.email, plan: features.plan, limits: { maxProfiles: features.maxProfiles },
      profiles: profiles.map((p) => ({ username: p.username, birthYear: p.birthYear, locked: !!p.pinHash, settings: p.settings })),
    },
  };
}

export async function addProfile(
  t: Tokens,
  input: { nickname?: string; birthYear?: number; avatar?: string; avatarColor?: string; pin?: string },
  d: FamilyDeps,
): Promise<FamilyResult> {
  const parent = await parentFrom(t, d);
  if (!parent) return err(401, "parent-required");
  const username = normalizeUsername(input.nickname ?? "");
  const year = Number(input.birthYear);
  const thisYear = new Date(d.now).getUTCFullYear();
  if (!validateUsername(username)) return err(400, "invalid-nickname");
  if (!Number.isInteger(year) || year < thisYear - 18 || year > thisYear) return err(400, "invalid-birth-year");
  if (input.pin && !validatePin(String(input.pin))) return err(400, "invalid-pin");
  const hh = (await d.kv.get<Household>(householdKey(parent.householdId)))!;
  const features = await featuresFor(d.kv, hh.id, d.now);
  if (hh.profiles.length >= features.maxProfiles) return err(402, "profile-limit");
  const created = await d.store.createUser(username, {
    pinHash: "", createdAt: d.now, avatar: sanitizeAvatar(input.avatar), avatarColor: sanitizeColor(input.avatarColor),
  });
  if (!created) return err(409, "taken");
  const profile: ProfileRecord = {
    username, householdId: hh.id, birthYear: year, createdAt: d.now, settings: defaultSettings(),
    ...(input.pin ? { pinHash: hashSecret(String(input.pin)) } : {}),
  };
  await d.kv.set(profileKey(username), profile);
  hh.profiles.push(username);
  await d.kv.set(householdKey(hh.id), hh);
  return { status: 201, json: { username, settings: profile.settings } };
}

/** Adopt an existing standalone kid account (username + PIN) into this household. */
export async function claimLegacy(t: Tokens, input: { username?: string; pin?: string; birthYear?: number }, d: FamilyDeps): Promise<FamilyResult> {
  const parent = await parentFrom(t, d);
  if (!parent) return err(401, "parent-required");
  const username = normalizeUsername(input.username ?? "");
  const user = await d.store.getUser(username);
  if (!user || !user.pinHash || !verifySecret(String(input.pin ?? ""), user.pinHash)) return err(401, "bad-credentials");
  if (await d.kv.get(profileKey(username))) return err(409, "already-claimed");
  const year = Number(input.birthYear), thisYear = new Date(d.now).getUTCFullYear();
  if (!Number.isInteger(year) || year < thisYear - 18 || year > thisYear) return err(400, "invalid-birth-year");
  const hh = (await d.kv.get<Household>(householdKey(parent.householdId)))!;
  const features = await featuresFor(d.kv, hh.id, d.now);
  if (hh.profiles.length >= features.maxProfiles) return err(402, "profile-limit");
  await d.kv.set(profileKey(username), { username, householdId: hh.id, birthYear: year, createdAt: d.now, settings: defaultSettings() } satisfies ProfileRecord);
  hh.profiles.push(username);
  await d.kv.set(householdKey(hh.id), hh);
  return { status: 201, json: { username } };
}

export async function updateProfile(
  t: Tokens,
  username: string,
  patch: { settings?: unknown; birthYear?: number; pin?: string | null },
  d: FamilyDeps,
): Promise<FamilyResult> {
  const parent = await parentFrom(t, d);
  if (!parent) return err(401, "parent-required");
  const p = await d.kv.get<ProfileRecord>(profileKey(normalizeUsername(username)));
  if (!p || p.householdId !== parent.householdId) return err(404, "not-found");
  if (patch.settings !== undefined) p.settings = sanitizeSettings(patch.settings, p.settings);
  if (patch.birthYear !== undefined) {
    const y = Number(patch.birthYear), thisYear = new Date(d.now).getUTCFullYear();
    if (!Number.isInteger(y) || y < thisYear - 18 || y > thisYear) return err(400, "invalid-birth-year");
    p.birthYear = y;
  }
  if (patch.pin === null) delete p.pinHash;
  else if (typeof patch.pin === "string") {
    if (!validatePin(patch.pin)) return err(400, "invalid-pin");
    p.pinHash = hashSecret(patch.pin);
  }
  await d.kv.set(profileKey(p.username), p);
  return { status: 200, json: { username: p.username, birthYear: p.birthYear, locked: !!p.pinHash, settings: p.settings } };
}

/** Everything we hold about one child, as plain JSON, so a parent can download it. */
export async function exportProfile(t: Tokens, username: string, d: FamilyDeps): Promise<FamilyResult> {
  const parent = await parentFrom(t, d);
  if (!parent) return err(401, "parent-required");
  const u = normalizeUsername(username);
  const p = await d.kv.get<ProfileRecord>(profileKey(u));
  if (!p || p.householdId !== parent.householdId) return err(404, "not-found");
  const data: Record<string, unknown> = { profile: { ...p, pinHash: p.pinHash ? "(set)" : undefined } };
  for (const key of await d.kv.keys(`data:${u}:`)) data[key.slice(`data:${u}:`.length)] = await d.kv.get(key);
  data.completions = await d.store.getCompletions(u);
  return { status: 200, json: data };
}

/** Real deletion: profile, learning data, completions and every leaderboard entry. */
export async function deleteProfile(t: Tokens, username: string, scoreGames: Iterable<string>, d: FamilyDeps): Promise<FamilyResult> {
  const parent = await parentFrom(t, d);
  if (!parent) return err(401, "parent-required");
  const u = normalizeUsername(username);
  const p = await d.kv.get<ProfileRecord>(profileKey(u));
  if (!p || p.householdId !== parent.householdId) return err(404, "not-found");
  for (const key of await d.kv.keys(`data:${u}:`)) await d.kv.del(key);
  for (const g of scoreGames) await d.store.removeScore(g, u);
  await d.store.deleteUser?.(u);
  await d.kv.del(profileKey(u));
  const hh = (await d.kv.get<Household>(householdKey(parent.householdId)))!;
  hh.profiles = hh.profiles.filter((x) => x !== u);
  await d.kv.set(householdKey(hh.id), hh);
  return { status: 200, json: { deleted: u } };
}

/** The per-profile data key space (mastery, wallet, events). Everything under it is exported/deleted with the profile. */
export const dataKey = (username: string, part: string) => `data:${username}:${part}`;
