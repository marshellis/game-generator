/*
 * server.ts — Snowball Arena authoritative live-PvP server (PartyKit)
 * ----------------------------------------------------------------------------
 * Each PartyKit "room" is one 1v1 match. The server owns the simulation:
 * clients send inputs, the server steps physics at a fixed rate and broadcasts
 * snapshots. This mirrors the client sim in site/public/arcade/snowball-arena/
 * game.js — keep the constants in sync.
 *
 * Run locally:   cd realtime && npm install && npm run dev   (ws://localhost:1999)
 * Deploy:        npm run deploy                              (wss://snowball-arena.<you>.partykit.dev)
 * Then point the client at it: open /arcade/snowball-arena?server=wss://...
 * or set SERVER_URL in net.js.
 *
 * Protocol (see net.js):
 *   client -> { t:"join", name } | { t:"input", seq, input }
 *   server -> { t:"welcome", id, arena } | { t:"state", ... } | { t:"score", you, foe } | { t:"left", id }
 * ----------------------------------------------------------------------------
 */
import type * as Party from "partykit/server";

// ---- constants (keep in sync with game.js) ----
const W = 960, H = 540;
const GROUND_Y = H - 46;
const TICK_HZ = 30;
const STEP = 1000 / 60;          // sim still steps at 60Hz; we broadcast at 30Hz
const GRAVITY = 0.62, MOVE_ACCEL = 0.9, MAX_SPEED = 4.4;
const GROUND_FRICTION = 0.78, AIR_FRICTION = 0.94, JUMP_V = -13.2;
const P_W = 30, P_STAND = 58, P_DUCK = 36;
const BALL_R = 7, BALL_GRAVITY = 0.42, THROW_MIN = 9.5, THROW_MAX = 21.5;
const CHARGE_MS = 620, THROW_CD = 360, MAX_HP = 100;
const RESPAWN_MS = 1600, INVULN_MS = 1100, WIN_SCORE = 5;

const BUNKERS = [
  { x: 150, y: GROUND_Y - 90, w: 70, h: 90 },
  { x: W - 220, y: GROUND_Y - 90, w: 70, h: 90 },
  { x: 330, y: GROUND_Y - 130, w: 60, h: 130 },
  { x: W - 390, y: GROUND_Y - 130, w: 60, h: 130 },
  { x: W / 2 - 70, y: GROUND_Y - 64, w: 140, h: 64 },
  { x: W / 2 - 26, y: 150, w: 52, h: 150 },
];
const SPAWN = [
  { x: 70, y: GROUND_Y - P_STAND },
  { x: W - 70 - P_W, y: GROUND_Y - P_STAND },
];

type Input = {
  left?: boolean; right?: boolean; jump?: boolean; duck?: boolean;
  aimAngle?: number; throw?: boolean;
};

type Player = {
  conn: string; slot: number; name: string;
  x: number; y: number; vx: number; vy: number; w: number; h: number;
  onGround: boolean; facing: number; duck: boolean; hp: number; alive: boolean;
  charge: number; prevThrow: boolean; cd: number; invuln: number; respawn: number;
  aim: number; input: Input;
};

type Ball = { id: number; x: number; y: number; vx: number; vy: number; owner: number };

export default class SnowballRoom implements Party.Server {
  players = new Map<string, Player>();
  balls: Ball[] = [];
  score = [0, 0];
  ballId = 1;
  events: any[] = [];
  loop: ReturnType<typeof setInterval> | null = null;

  constructor(readonly room: Party.Room) {}

  // ---- connection lifecycle ----
  onConnect(conn: Party.Connection) {
    const slot = this.freeSlot();
    if (slot < 0) { // room full (1v1)
      conn.send(JSON.stringify({ t: "full" }));
      conn.close();
      return;
    }
    const p = this.makePlayer(conn.id, slot, "Player");
    this.players.set(conn.id, p);
    conn.send(JSON.stringify({ t: "welcome", id: slot, arena: { W, H, bunkers: BUNKERS } }));
    if (this.players.size >= 1 && !this.loop) this.start();
  }

  onClose(conn: Party.Connection) {
    this.players.delete(conn.id);
    this.room.broadcast(JSON.stringify({ t: "left", id: conn.id }));
    if (this.players.size === 0) this.stop();
  }

  onMessage(raw: string, conn: Party.Connection) {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = this.players.get(conn.id);
    if (!p) return;
    if (msg.t === "join") {
      p.name = String(msg.name || "Player").slice(0, 16);
    } else if (msg.t === "input") {
      p.input = msg.input || {};
    }
  }

  // ---- sim loop ----
  start() {
    this.score = [0, 0];
    this.loop = setInterval(() => this.tick(), 1000 / TICK_HZ);
  }
  stop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.balls = [];
  }

  tick() {
    // step the 60Hz sim twice per 30Hz broadcast
    for (let i = 0; i < 2; i++) this.step();
    this.broadcast();
  }

  step() {
    for (const p of this.players.values()) this.applyInput(p, p.input);
    for (const p of this.players.values()) this.stepPlayer(p);
    this.balls = this.balls.filter((b) => this.stepBall(b));
  }

  // ---- physics (mirrors game.js) ----
  makePlayer(conn: string, slot: number, name: string): Player {
    const s = SPAWN[slot] || SPAWN[0];
    return {
      conn, slot, name,
      x: s.x, y: s.y, vx: 0, vy: 0, w: P_W, h: P_STAND,
      onGround: false, facing: slot === 0 ? 1 : -1, duck: false,
      hp: MAX_HP, alive: true, charge: 0, prevThrow: false, cd: 0,
      invuln: 0, respawn: 0, aim: slot === 0 ? 0 : Math.PI, input: {},
    };
  }

  freeSlot(): number {
    const used = new Set([...this.players.values()].map((p) => p.slot));
    if (!used.has(0)) return 0;
    if (!used.has(1)) return 1;
    return -1;
  }

  bySlot(slot: number): Player | undefined {
    for (const p of this.players.values()) if (p.slot === slot) return p;
    return undefined;
  }

  respawnPlayer(p: Player) {
    const s = SPAWN[p.slot];
    p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0;
    p.hp = MAX_HP; p.alive = true; p.duck = false; p.h = P_STAND;
    p.charge = 0; p.cd = 0; p.invuln = INVULN_MS; p.respawn = 0;
  }

  handPos(p: Player) {
    return { x: p.x + p.w / 2 + p.facing * 10, y: p.y + (p.duck ? 12 : 18) };
  }

  applyInput(p: Player, inp: Input) {
    if (!p.alive) return;
    if (inp.left) p.vx -= MOVE_ACCEL;
    if (inp.right) p.vx += MOVE_ACCEL;
    p.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vx));
    p.duck = !!inp.duck && p.onGround;
    const targetH = p.duck ? P_DUCK : P_STAND;
    if (targetH !== p.h) { p.y += p.h - targetH; p.h = targetH; }
    if (inp.jump && p.onGround && !p.duck) { p.vy = JUMP_V; p.onGround = false; }
    p.aim = typeof inp.aimAngle === "number" ? inp.aimAngle : p.aim;
    p.facing = Math.cos(p.aim) >= 0 ? 1 : -1;
    p.cd = Math.max(0, p.cd - STEP);
    const held = !!inp.throw;
    if (held && p.cd <= 0) p.charge = Math.min(1, p.charge + STEP / CHARGE_MS);
    const released = p.prevThrow && !held;
    if (released && p.cd <= 0 && p.charge > 0.04) {
      this.throwBall(p);
      p.charge = 0; p.cd = THROW_CD;
    }
    if (!held && !released) p.charge = 0;
    p.prevThrow = held;
  }

  throwBall(p: Player) {
    const speed = THROW_MIN + p.charge * (THROW_MAX - THROW_MIN);
    const hand = this.handPos(p);
    this.balls.push({
      id: this.ballId++,
      x: hand.x + Math.cos(p.aim) * 14,
      y: hand.y + Math.sin(p.aim) * 14,
      vx: Math.cos(p.aim) * speed + p.vx * 0.3,
      vy: Math.sin(p.aim) * speed,
      owner: p.slot,
    });
  }

  stepPlayer(p: Player) {
    if (!p.alive) {
      p.respawn -= STEP;
      if (p.respawn <= 0) this.respawnPlayer(p);
      return;
    }
    p.invuln = Math.max(0, p.invuln - STEP);
    p.vy += GRAVITY;
    p.vx *= p.onGround ? GROUND_FRICTION : AIR_FRICTION;
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    p.x += p.vx;
    for (const b of BUNKERS) {
      if (this.aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
        if (p.vx > 0) p.x = b.x - p.w; else if (p.vx < 0) p.x = b.x + b.w;
        p.vx = 0;
      }
    }
    p.x = Math.max(0, Math.min(W - p.w, p.x));

    p.onGround = false;
    p.y += p.vy;
    for (const b of BUNKERS) {
      if (this.aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
        if (p.vy > 0) { p.y = b.y - p.h; p.onGround = true; }
        else if (p.vy < 0) { p.y = b.y + b.h; }
        p.vy = 0;
      }
    }
    if (p.y + p.h >= GROUND_Y) { p.y = GROUND_Y - p.h; p.vy = 0; p.onGround = true; }
  }

  stepBall(b: Ball): boolean {
    b.vy += BALL_GRAVITY;
    b.x += b.vx; b.y += b.vy;
    if (b.x < -20 || b.x > W + 20 || b.y + BALL_R >= GROUND_Y) return false;
    for (const bk of BUNKERS) {
      if (this.circleRect(b.x, b.y, BALL_R, bk.x, bk.y, bk.w, bk.h)) return false;
    }
    for (const p of this.players.values()) {
      if (p.slot === b.owner || !p.alive || p.invuln > 0) continue;
      if (this.circleRect(b.x, b.y, BALL_R, p.x, p.y, p.w, p.h)) {
        const speed = Math.hypot(b.vx, b.vy);
        let dmg = Math.round(6 + speed * 0.78);
        if (p.duck) dmg = Math.round(dmg * 0.65);
        this.hitPlayer(p, dmg, b.owner);
        return false;
      }
    }
    return true;
  }

  hitPlayer(p: Player, dmg: number, attacker: number) {
    p.hp -= dmg;
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false; p.respawn = RESPAWN_MS;
      this.score[attacker] = (this.score[attacker] || 0) + 1;
      this.events.push({ kind: "kill", attacker, victim: p.slot });
      if (this.score[attacker] >= WIN_SCORE) {
        this.events.push({ kind: "win", winner: attacker });
        this.score = [0, 0]; // reset for a rematch
      }
    }
  }

  aabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  circleRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
  }

  // ---- snapshot ----
  broadcast() {
    const players = [0, 1].map((slot) => {
      const p = this.bySlot(slot);
      if (!p) return null;
      return {
        id: p.slot, name: p.name,
        x: Math.round(p.x), y: Math.round(p.y),
        vx: p.vx, vy: p.vy, hp: p.hp, facing: p.facing,
        duck: p.duck, alive: p.alive, aim: p.aim, charge: p.charge,
      };
    }).filter(Boolean);

    const balls = this.balls.map((b) => ({
      id: b.id, x: Math.round(b.x), y: Math.round(b.y),
      vx: b.vx, vy: b.vy, owner: b.owner,
    }));

    const events = this.events;
    this.events = [];
    this.room.broadcast(JSON.stringify({
      t: "state", players, balls, score: this.score, events,
    }));
  }
}
