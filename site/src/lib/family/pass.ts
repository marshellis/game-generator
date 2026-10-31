// "Game pass": a short-lived signed statement "this is <nickname> playing, with N seconds left" that
// a multiplayer server (Colyseus on Fly, a raw ws server) can verify OFFLINE with a shared secret -
// no call back to the site. It makes names in online games real, and lets the parent's time limit
// reach the room: the server drops the player when `exp` passes.
//
// Issuing a pass runs the same wallet check as gate(): a managed child with no time left gets 403,
// so a kid cannot dodge limits by launching the online version of a game.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { FamilyDeps, FamilyResult } from "./accounts";
import { profileKey } from "./accounts";
import type { ProfileRecord } from "./types";
import { verifySession } from "../profile/session";
import { sanitizeAvatar, sanitizeColor } from "../profile/avatars";
import { register } from "./router";

export const PASS_TTL_SEC = 15 * 60;
export interface PassClaims { u: string; a: string; c: string; room: string; exp: number; lb: boolean }

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signPass(c: PassClaims, secret: string): string { const body = b64(c); return `${body}.${mac(body, secret)}`; }

/** Same algorithm servers use - see docs/game-pass.md for a drop-in copy. */
export function verifyPass(token: string | undefined, secret: string, nowSec: number): PassClaims | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString()) as PassClaims;
    return c.exp > nowSec ? c : null;
  } catch { return null; }
}

register({
  "POST pass": async (r, d: FamilyDeps): Promise<FamilyResult> => {
    const s = verifySession(r.childToken, d.secret, Math.floor(d.now / 1000));
    if (!s) return { status: 401, json: { error: "unauthenticated" } };
    // Passes use their OWN secret (shared with the game servers). Never the session secret: a game server
    // holding that could forge logins for the whole site.
    const passSecret = process.env.GAME_PASS_SECRET ?? "";
    if (!passSecret) return { status: 503, json: { error: "passes-not-configured" } };
    const room = String(r.body.room ?? "").slice(0, 40);
    if (!/^[a-z0-9-]{1,40}$/.test(room)) return { status: 400, json: { error: "invalid-room" } };
    const [user, profile] = await Promise.all([d.store.getUser(s.username), d.kv.get<ProfileRecord>(profileKey(s.username))]);
    if (!user) return { status: 401, json: { error: "unauthenticated" } };
    let ttl = PASS_TTL_SEC;
    if (profile) {
      // Managed child: honour the parent's limits. Ask the wallet through the normal status route.
      const { handle } = await import("./router");
      const st: any = (await handle({ ...r, method: "GET", path: ["play", "status"], body: {}, query: {} }, d)).json;
      if (st && st.ok === false) return { status: 403, json: { error: "no-time", reason: st.reason } };
      if (st && typeof st.remainingSec === "number") ttl = Math.min(ttl, Math.max(30, st.remainingSec));
    }
    const exp = Math.floor(d.now / 1000) + ttl;
    const claims: PassClaims = {
      u: s.username, a: sanitizeAvatar(user.avatar), c: sanitizeColor(user.avatarColor), room, exp, lb: profile?.settings.leaderboard ?? true,
    };
    return { status: 200, json: { pass: signPass(claims, passSecret), exp } };
  },
});
