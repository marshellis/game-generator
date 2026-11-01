// Marshellis game-pass kit for room servers (CommonJS, zero dependencies). Copy this file next to your
// server; it supersedes the pass.js copies in hide-and-seek-server / battle-royale-server / galaga.
// Protocol and usage: docs/game-pass.md and docs/room-kit/README.md. Keep the copies identical to this file.
//
//   const { identify, watchPass } = require('./pass');
//   const who = identify(url.searchParams.get('pass'), process.env, undefined, { room: 'nexus' });
//   if (!who) return ws.close(4001, 'pass required');            // GAME_PASS_REQUIRED=1 and no valid pass
//   const watch = watchPass(ws, who, { room: 'nexus', secret: process.env.GAME_PASS_SECRET });
//   ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.type === 'renew') return watch.renew(m.pass); ... });
const { createHmac, timingSafeEqual } = require('crypto');

const TIMEUP_CLOSE_CODE = 4003;

// The pass claims ({ u, a, c, room, exp, lb }) when the signature is good and exp is in the future, else null.
function verifyPass(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || !secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString());
    return c && typeof c.u === 'string' && c.exp > nowSec ? c : null;
  } catch { return null; }
}

// null => refuse the connection (GAME_PASS_REQUIRED=1 and no valid pass for this room).
// { verified:false } => guest: give them a Guest-1234 name. Without GAME_PASS_SECRET nothing is enforced.
// A pass whose `room` claim differs from opts.room counts as invalid (it was issued for another game).
function identify(pass, env = process.env, nowSec, opts = {}) {
  const secret = env.GAME_PASS_SECRET;
  if (!secret) return { verified: false };
  let c = verifyPass(pass, secret, nowSec);
  if (c && opts.room && c.room !== opts.room) c = null;
  if (c) return { name: c.u.slice(0, 20), expiresAt: c.exp, verified: true, claims: c };
  if (env.GAME_PASS_REQUIRED === '1') return null;
  return { verified: false };
}

// Enforce the pass on an open socket. `who` is identify()'s result; a guest is not metered (no-op watcher).
// At expiry: send {"type":"timeup"}, call onTimeUp(), close with 4003 (clients must not reconnect without a
// fresh pass). renew(token) takes a fresh pass from the client: same user and same room as the original, else
// ignored and the original expiry stands; on success the timer is re-armed to the new exp and the client gets
// {"type":"renewed","exp"}. Returns true when the renewal was accepted. stop() clears the timer (also on close).
function watchPass(ws, who, { room, secret, onTimeUp, now = Date.now } = {}) {
  if (!who || !who.verified) return { renew: () => false, stop() {} };
  const user = who.claims.u, claimRoom = who.claims.room;
  let timer = null, done = false;
  const send = (o) => { try { ws.send(JSON.stringify(o)); } catch { /* socket already gone */ } };
  function arm() {
    clearTimeout(timer);
    // setTimeout caps at 2^31-1 ms; passes last minutes, but never overflow into an immediate fire.
    timer = setTimeout(expire, Math.min(Math.max(0, who.expiresAt * 1000 - now()), 2 ** 31 - 1));
  }
  function expire() {
    if (done) return;
    if (who.expiresAt * 1000 > now()) return arm(); // clamped long wait
    done = true;
    send({ type: 'timeup' });
    if (onTimeUp) onTimeUp(who);
    try { ws.close(TIMEUP_CLOSE_CODE, 'timeup'); } catch { /* already closed */ }
  }
  function stop() { done = true; clearTimeout(timer); }
  function renew(token) {
    if (done) return false;
    const c = verifyPass(token, secret, Math.floor(now() / 1000));
    if (!c || c.u !== user || c.room !== claimRoom || (room && c.room !== room)) return false;
    who.expiresAt = c.exp;
    arm();
    send({ type: 'renewed', exp: c.exp });
    return true;
  }
  if (typeof ws.on === 'function') ws.on('close', stop);
  arm();
  return { renew, stop };
}

module.exports = { verifyPass, identify, watchPass, TIMEUP_CLOSE_CODE };
