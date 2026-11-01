// node --test docs/room-kit/pass.test.js
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { verifyPass, identify, watchPass } = require('./pass');

const SECRET = 'test-secret';
const NOW = 1_800_000_000;
// Same shape as site/src/lib/family/pass.ts signPass.
function sign(claims, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
const claims = (o = {}) => ({ u: 'ava', a: '🦊', c: '#fde68a', room: 'nexus', exp: NOW + 900, lb: true, ...o });
const env = (o = {}) => ({ GAME_PASS_SECRET: SECRET, ...o });

function fakeWs() {
  const ws = { sent: [], closed: null, handlers: {} };
  ws.send = (s) => ws.sent.push(JSON.parse(s));
  ws.close = (code, reason) => { ws.closed = { code, reason }; };
  ws.on = (ev, fn) => { ws.handlers[ev] = fn; };
  return ws;
}

test('valid pass verifies and identifies', () => {
  const t = sign(claims());
  assert.equal(verifyPass(t, SECRET, NOW).u, 'ava');
  const who = identify(t, env(), NOW, { room: 'nexus' });
  assert.equal(who.verified, true);
  assert.equal(who.name, 'ava');
  assert.equal(who.expiresAt, NOW + 900);
  assert.equal(who.claims.room, 'nexus');
});

test('tampered or wrong-secret pass is rejected', () => {
  const t = sign(claims());
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify(claims({ u: 'mallory' }))).toString('base64url');
  assert.equal(verifyPass(`${forged}.${sig}`, SECRET, NOW), null);
  assert.equal(verifyPass(`${body}.x${sig}`, SECRET, NOW), null);
  assert.equal(verifyPass(sign(claims(), 'other'), SECRET, NOW), null);
  assert.equal(verifyPass('garbage', SECRET, NOW), null);
  assert.equal(verifyPass(undefined, SECRET, NOW), null);
  assert.deepEqual(identify(`${forged}.${sig}`, env(), NOW), { verified: false });
});

test('expired pass is rejected', () => {
  assert.equal(verifyPass(sign(claims({ exp: NOW - 1 })), SECRET, NOW), null);
  assert.equal(verifyPass(sign(claims({ exp: NOW })), SECRET, NOW), null);
  assert.deepEqual(identify(sign(claims({ exp: NOW - 1 })), env(), NOW), { verified: false });
});

test('a pass for another room is rejected when a room is given', () => {
  const t = sign(claims({ room: 'galaga' }));
  assert.deepEqual(identify(t, env(), NOW, { room: 'nexus' }), { verified: false });
  assert.equal(identify(t, env({ GAME_PASS_REQUIRED: '1' }), NOW, { room: 'nexus' }), null);
  assert.equal(identify(t, env(), NOW).verified, true); // no room given: not checked (legacy callers)
});

test('guest: no pass, or no secret configured, still connects', () => {
  assert.deepEqual(identify(undefined, env(), NOW), { verified: false });
  assert.deepEqual(identify('', env(), NOW, { room: 'nexus' }), { verified: false });
  assert.deepEqual(identify(sign(claims()), {}, NOW, { room: 'nexus' }), { verified: false });
  assert.deepEqual(identify(sign(claims()), { GAME_PASS_REQUIRED: '1' }, NOW), { verified: false });
});

test('GAME_PASS_REQUIRED=1 refuses a missing or invalid pass but accepts a valid one', () => {
  const req = env({ GAME_PASS_REQUIRED: '1' });
  assert.equal(identify(undefined, req, NOW, { room: 'nexus' }), null);
  assert.equal(identify('nope', req, NOW, { room: 'nexus' }), null);
  assert.equal(identify(sign(claims({ exp: NOW - 5 })), req, NOW, { room: 'nexus' }), null);
  assert.equal(identify(sign(claims()), req, NOW, { room: 'nexus' }).verified, true);
});

// Fake clock: Date and setTimeout both follow mock.timers, so a 15-minute pass expires instantly.
function clock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: NOW * 1000 });
  return { tick: (s) => t.mock.timers.tick(s * 1000), nowSec: () => Math.floor(Date.now() / 1000) };
}
function watched(t, o = {}) {
  const k = clock(t);
  const ws = fakeWs();
  const who = identify(sign(claims({ exp: NOW + 60, ...o.claims })), env(), NOW, { room: 'nexus' });
  const watch = watchPass(ws, who, { room: 'nexus', secret: SECRET, onTimeUp: o.onTimeUp });
  return { k, ws, who, watch };
}

test('renew extends the expiry and replies renewed', (t) => {
  const { k, ws, who, watch } = watched(t);
  k.tick(50);
  assert.equal(watch.renew(sign(claims({ exp: NOW + 50 + 900 }))), true);
  assert.deepEqual(ws.sent, [{ type: 'renewed', exp: NOW + 950 }]);
  assert.equal(who.expiresAt, NOW + 950);
  k.tick(100); // past the ORIGINAL expiry
  assert.equal(ws.closed, null);
  k.tick(900);
  assert.equal(ws.closed.code, 4003);
});

test('renew with another user, another room or a bad token is ignored', (t) => {
  const { k, ws, who, watch } = watched(t);
  assert.equal(watch.renew(sign(claims({ u: 'bob', exp: NOW + 900 }))), false);
  assert.equal(watch.renew(sign(claims({ room: 'galaga', exp: NOW + 900 }))), false);
  assert.equal(watch.renew(sign(claims({ exp: NOW + 900 }), 'other')), false);
  assert.equal(watch.renew(sign(claims({ exp: NOW - 10 }))), false);
  assert.equal(watch.renew(undefined), false);
  assert.deepEqual(ws.sent, []);
  assert.equal(who.expiresAt, NOW + 60); // original expiry stands
  k.tick(61);
  assert.equal(ws.closed.code, 4003);
});

test('timeup fires at expiry: message, onTimeUp, then close 4003', (t) => {
  let called = null;
  const { k, ws } = watched(t, { onTimeUp: (who) => { called = who.name; } });
  k.tick(59);
  assert.equal(ws.closed, null);
  k.tick(1);
  assert.deepEqual(ws.sent, [{ type: 'timeup' }]);
  assert.equal(ws.closed.code, 4003);
  assert.equal(called, 'ava');
});

test('stop() cancels the timer and refuses further renewals', (t) => {
  const a = watched(t);
  a.watch.stop();
  a.k.tick(120);
  assert.equal(a.ws.closed, null);
  assert.equal(a.watch.renew(sign(claims({ exp: NOW + 900 }))), false);
});

test('a socket close cancels the timer', (t) => {
  const b = watched(t);
  b.ws.handlers.close();
  b.k.tick(120);
  assert.equal(b.ws.closed, null);
});

test('guests are never metered', () => {
  const ws = fakeWs();
  const g = watchPass(ws, { verified: false }, { room: 'nexus', secret: SECRET });
  assert.equal(g.renew(sign(claims())), false);
  assert.equal(watchPass(ws, null, {}).renew('x'), false);
});
