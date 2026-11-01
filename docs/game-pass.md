# Game pass - verifying a player in a multiplayer server

The site issues a signed pass to a signed-in child: `POST /api/family/pass {"room":"galaga"}`
(browser, with cookies) -> `{ "pass": "<token>", "exp": <unix seconds> }`. It returns **403** when the
parent's play-time limit is used up. Guests get no pass; give them a `Guest-1234` name server-side.

The client gets a pass with the SDK, `await mg.getPass(room)`, which works same-origin and from the isolated
arcade origin (it relays `POST /api/family/pass`). It resolves `{ pass, exp }`, `{ noTime: true }` when the API says
403 (the parent's limit is used up: do not connect), or `null` for a guest or any error (connect as a guest).

## Protocol
- **Transport:** put the token on the WebSocket URL as a query parameter: `wss://<app>.fly.dev/?pass=<token>`.
  (Colyseus: `client.joinOrCreate("room", { pass })`.)
- **Verify offline** with the shared secret `GAME_PASS_SECRET` (set the same value on the site's Vercel project and as
  a Fly secret: `fly secrets set GAME_PASS_SECRET=...`). It is a separate secret from the site's `SESSION_SECRET` on
  purpose: a game server must never be able to forge site logins. Use `c.u` as the display name and ignore any name
  the browser sends.
- **Room check:** a pass carries a `room` claim. A server that passes `{room: "nexus"}` to `identify()` rejects a pass
  issued for another room (treated as invalid, so a guest unless `GAME_PASS_REQUIRED=1`).
- **Renew (in-band):** a pass lasts 15 minutes (`PASS_TTL_SEC`, shorter when the child has less time left), but a game
  socket can live longer. The client calls `mg.getPass(room)` again about every **10 minutes** and sends
  `{"type":"renew","pass":"<fresh token>"}` on the open socket. The server verifies it with the same secret; it must
  have the same username `u` and `room` as the original pass, else it is ignored (the original expiry stands). On
  success the expiry becomes the new pass's `exp` and the server replies `{"type":"renewed","exp":<unix seconds>}`.
- **Time up:** when the expiry passes, the server sends `{"type":"timeup"}` and closes with code **4003**. The client
  must NOT auto-reconnect after 4003 without a fresh pass (and if `getPass` says `noTime`, show the time-up screen).
- **Guests** (no pass, or no `GAME_PASS_SECRET` configured) still connect, unless the server sets
  `GAME_PASS_REQUIRED=1`. Give them a `Guest-1234` name server-side.

## Server code
Copy [`docs/room-kit/pass.js`](room-kit/pass.js) (CommonJS, no dependencies, tested): `verifyPass`, `identify`
(with the room check) and `watchPass` (the timeup/4003 close and the renew rule). See
[`docs/room-kit/README.md`](room-kit/README.md) for usage and the Fly conventions (`/health`, one machine).
The verifier is the same algorithm as `verifyPass` in `site/src/lib/family/pass.ts`.
