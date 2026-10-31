# Game pass - verifying a player in a multiplayer server

The site issues a signed pass to a signed-in child: `POST /api/family/pass {"room":"galaga"}`
(browser, with cookies) -> `{ "pass": "<token>", "exp": <unix seconds> }`. It returns **403** when the
parent's play-time limit is used up. Guests get no pass; give them a `Guest-1234` name server-side.

The client sends the token when joining the room (Colyseus: `client.joinOrCreate("room", { pass })`;
raw ws: first message). The server verifies it **offline** with the shared secret `GAME_PASS_SECRET`
(set the same value on the site's Vercel project and as a Fly secret: `fly secrets set GAME_PASS_SECRET=...`).
It is a separate secret from the site's `SESSION_SECRET` on purpose: a game server must never be able
to forge site logins. Remove the player when `exp` passes.

```js
// verify-pass.js - drop-in, no dependencies
import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyPass(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !secret) return null;
  const want = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString());
    return c.exp > nowSec ? c : null;   // { u: username, a: avatar, c: color, room, exp, lb: showOnLeaderboard }
  } catch { return null; }
}
```
Use `c.u` as the display name, ignore any name the browser sends, and disconnect at `c.exp`.
