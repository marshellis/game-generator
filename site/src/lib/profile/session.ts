import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "mg_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 90; // 90 days

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Token = "<username>.<issuedAtSec>.<sig>". Username has no dots (validated). */
export function signSession(username: string, secret: string, issuedAtSec: number): string {
  // An empty HMAC key is a key anyone can guess: refuse to mint with it (SESSION_SECRET unset).
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const payload = `${username}.${issuedAtSec}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  nowSec: number,
  maxAgeSec: number = SESSION_MAX_AGE_SEC,
): { username: string } | null {
  if (!token || !secret) return null; // fail closed: never verify against an empty key
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const firstDot = payload.indexOf(".");
  if (firstDot < 0) return null;
  const username = payload.slice(0, firstDot);
  const issuedAt = Number(payload.slice(firstDot + 1));
  if (!username || !Number.isFinite(issuedAt)) return null;
  if (nowSec - issuedAt > maxAgeSec) return null;
  return { username };
}
