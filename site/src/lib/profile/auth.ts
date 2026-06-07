import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;
export function validateUsername(u: string): boolean {
  return USERNAME_RE.test(u);
}

const PIN_RE = /^[0-9]{4,8}$/;
export function validatePin(p: string): boolean {
  return PIN_RE.test(p);
}

const KEYLEN = 32;
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const got = scryptSync(pin, salt, KEYLEN);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
