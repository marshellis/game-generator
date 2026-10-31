import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed, expiring, kind-scoped token: "<kind>~<id>~<iat>~<sig>". A token of one kind never verifies as another. */
export function signToken(kind: string, id: string, secret: string, nowSec: number): string {
  const payload = `${kind}~${id}~${nowSec}`;
  return `${payload}~${mac(payload, secret)}`;
}

export function verifyToken(kind: string, token: string | undefined, secret: string, nowSec: number, maxAgeSec: number): string | null {
  if (!token || !secret) return null;
  const parts = token.split("~");
  if (parts.length !== 4 || parts[0] !== kind) return null;
  const payload = parts.slice(0, 3).join("~");
  const a = Buffer.from(parts[3]), b = Buffer.from(mac(payload, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const iat = Number(parts[2]);
  if (!Number.isFinite(iat) || nowSec - iat > maxAgeSec || iat > nowSec + 60) return null;
  return parts[1];
}

function mac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
