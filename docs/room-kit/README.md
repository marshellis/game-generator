# Room-server kit

The canonical game-pass code for the kids' multiplayer room servers (Node on Fly). One file, no dependencies:
[`pass.js`](pass.js), tested by [`pass.test.js`](pass.test.js) (`node --test docs/room-kit/pass.test.js`).
The protocol itself is in [`../game-pass.md`](../game-pass.md).

## Using it
**Copy `pass.js` into the server repo** (next to its entry file) and keep it byte-identical to this one; when this
file changes, re-copy it. There is deliberately no npm package: each server is a tiny standalone repo.

Current users (replace their own `pass.js` / `auth/pass.ts` with this file): `hide-and-seek-server`,
`battle-royale-server`, `galaga` (its `server/`), and `nexus-server`.

```js
const { identify, watchPass } = require('./pass');
const ROOM = 'nexus';                         // the room name the client asks getPass() for

wss.on('connection', (ws, req) => {
  const pass = new URL(req.url, 'http://x').searchParams.get('pass');
  const who = identify(pass, process.env, undefined, { room: ROOM });
  if (!who) return ws.close(4001, 'pass required');            // only when GAME_PASS_REQUIRED=1
  const name = who.verified ? who.name : `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
  const watch = watchPass(ws, who, { room: ROOM, secret: process.env.GAME_PASS_SECRET,
                                     onTimeUp: () => leaveRoom(ws) });
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type === 'renew') return watch.renew(m.pass);        // replies {"type":"renewed","exp"} itself
    /* ...game messages... */
  });
});
```

API:
- `verifyPass(token, secret, nowSec?)` -> claims `{u, a, c, room, exp, lb}` or `null` (bad signature, expired, malformed).
- `identify(pass, env, nowSec?, {room}?)` -> `null` (refuse: `GAME_PASS_REQUIRED=1` and no valid pass) |
  `{verified:false}` (guest) | `{name, expiresAt, verified:true, claims}`. With `room` set, a pass issued for another
  room counts as invalid. Without `GAME_PASS_SECRET` everything is a guest, so deploying it is safe.
- `watchPass(ws, who, {room, secret, onTimeUp})` -> `{renew(token) -> boolean, stop()}`. Arms a re-armable timer for
  `who.expiresAt`; at expiry sends `{"type":"timeup"}`, calls `onTimeUp`, closes with **4003**. Guests are not metered.

## Protocol (fixed)
- **Transport:** the client gets a pass with `mg.getPass(room)` (POST `/api/family/pass {room}`) and connects to
  `wss://<app>.fly.dev/?pass=<token>`.
- **Renew:** client sends `{"type":"renew","pass":"<fresh token>"}` on the open socket. The server verifies it with the
  same secret; the username `u` and `room` must equal the original pass's, else it is ignored (the original expiry
  stands). On success the expiry becomes the new pass's `exp` and the server replies `{"type":"renewed","exp":<unix s>}`.
  Passes live 15 minutes; clients renew about every 10.
- **Expiry:** server sends `{"type":"timeup"}` then closes with code **4003**. The client must not auto-reconnect after
  4003 without a fresh pass (a 403 from the pass endpoint means no play time is left).
- **Guests** (no pass, or no secret configured) connect unless `GAME_PASS_REQUIRED=1`.

## Server conventions (from the Bailey `game-servers` skill)
- `GET /health` answers `{"ok":true}`.
- **One machine per app**, `auto_stop_machines = "stop"`, `min_machines_running = 0`: it sleeps when idle and wakes in
  a few seconds on the next connection. Rooms live in that machine's memory, so two machines would silently split
  players into rooms that cannot see each other (Fly creates two on first deploy: `fly scale count 1`).
- `GAME_PASS_SECRET` is a Fly secret with the same value as the site's Vercel env var.
