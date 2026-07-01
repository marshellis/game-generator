/*
 * game.js — Ragdoll Siege
 * ---------------------------------------------------------------------------
 * A physics archery survival game in the spirit of the ragdoll-archer genre
 * (original art + logic). You control a FLOPPY RAGDOLL archer: click, hold and
 * drag to draw the bow — the longer you hold the harder the shot, but drawing
 * drains STAMINA, and your ragdoll body leans and flails as you pull. Release
 * to loose a gravity-arced arrow; HEADSHOTS kill instantly.
 *
 * Survive endless waves of enemy archers (grunts, armored, and giant
 * mini-bosses). Shoot flying APPLES to restore health / stamina / lives. Kills
 * earn SKULLS you spend between waves on an UPGRADE shop (damage, max health,
 * stamina, pull speed, extra lives, armor, and multi-shot arrow slots).
 *
 * Modes: solo, or co-op with a friend on the SAME team via a 4-letter code
 * (host runs the authoritative sim; guest streams draw/fire and renders state).
 * Networking is in net.js (window.RagdollNet).
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // ---- world constants ----
  const W = 960, H = 540;
  const GROUND_Y = H - 60;
  const GRAV = 0.42;
  const P0X = 150, P1X = 250;            // player platform x positions
  const AIM_MIN = 9, AIM_MAX = 27;       // arrow launch speed range
  const CHARGE_TIME = 0.9;               // base seconds to full draw
  const STAM_DRAIN = 42;                 // stamina/sec while drawing
  const START_LIVES = 3;

  const ENEMY_TYPES = {
    grunt:  { hp: 2, scale: 1.0, speed: 1.15, color: "#c65b4e", fire: 2400, reach: 470, skulls: 3,  armor: 0 },
    archer: { hp: 3, scale: 1.0, speed: 0.95, color: "#d98a2b", fire: 1900, reach: 560, skulls: 4,  armor: 0 },
    heavy:  { hp: 6, scale: 1.1, speed: 0.62, color: "#8a52c4", fire: 3000, reach: 430, skulls: 7,  armor: 0.4 },
    giant:  { hp: 22,scale: 1.9, speed: 0.5,  color: "#4a7a3a", fire: 2500, reach: 520, skulls: 30, armor: 0.25 },
  };

  const UPGRADES = [
    { key: "dmg",   name: "Damage",        icon: "🗡️", base: 3, desc: (l) => "+25% arrow damage" },
    { key: "hp",    name: "Max Health",    icon: "❤️", base: 3, desc: (l) => "+40 max health" },
    { key: "stam",  name: "Max Stamina",   icon: "⚡", base: 3, desc: (l) => "+35 max stamina" },
    { key: "regen", name: "Stamina Refresh", icon: "🔄", base: 4, desc: (l) => "+12/s regen" },
    { key: "pull",  name: "Pull Speed",    icon: "🏹", base: 4, desc: (l) => "draw 25% faster" },
    { key: "armor", name: "Armor",         icon: "🛡️", base: 5, desc: (l) => "-12% damage taken" },
    { key: "slots", name: "Arrow Slots",   icon: "🎯", base: 8, desc: (l) => (l < 2 ? "+1 arrow per shot" : "maxed"), max: 2 },
    { key: "life",  name: "Extra Life",    icon: "💚", base: 10, desc: (l) => "+1 life now" },
  ];
  function upCost(u, level) { return Math.round(u.base * Math.pow(1.7, level)); }

  // ---- canvas ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;

  // ---- session state ----
  let mode = "solo";
  let role = null;            // null | "host" | "guest"
  let running = false;
  let net = null;
  let me = null;
  let partnerName = null;
  let localSlot = 0;

  const state = freshState();
  let remote = null;          // guest's view of host world
  const deaths = [];          // buffered ragdoll spawns for co-op

  function freshState() {
    return {
      players: [], enemies: [], arrows: [], apples: [], ragdolls: [], particles: [],
      wave: 0, waveState: "rest", restTimer: 0, toSpawn: 0, spawnTimer: 0, appleTimer: 4,
      skulls: 0, score: 0, over: false, overWave: 0, ready: {},
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const el = (id) => document.getElementById(id);
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------------------------------------------------------------------------
  // Player: a pinned-foot verlet ragdoll you drag to draw
  // ---------------------------------------------------------------------------
  function makePlayer(slot) {
    const baseX = slot === 0 ? P0X : P1X;
    const p = {
      slot, baseX, ups: { dmg: 0, hp: 0, stam: 0, regen: 0, pull: 0, armor: 0, slots: 0, life: 0 },
      lives: START_LIVES, down: false, invuln: 0,
      hp: 100, maxHp: 100, stamina: 100, maxStam: 100,
      drawing: false, charge: 0, aim: -0.5, cooldown: 0, flash: 0, kills: 0,
    };
    buildBody(p);
    recompute(p);
    p.hp = p.maxHp; p.stamina = p.maxStam;
    return p;
  }

  function buildBody(p) {
    const x = p.baseX, fy = GROUND_Y;
    const P = (px, py) => ({ x: px, y: py, px: px, py: py });
    p.body = {
      footL: P(x - 9, fy), footR: P(x + 9, fy),
      pelvis: P(x, fy - 40), chest: P(x, fy - 66), head: P(x, fy - 90),
      handBow: P(x + 22, fy - 60),   // front hand (holds bow)
      handDraw: P(x + 6, fy - 62),   // back hand (draws string)
    };
    p.footAL = { x: x - 9, y: fy }; p.footAR = { x: x + 9, y: fy };
    const b = p.body, L = (a, c) => ({ a, b: c, len: Math.hypot(a.x - c.x, a.y - c.y) });
    p.cons = [
      L(b.pelvis, b.footL), L(b.pelvis, b.footR), L(b.chest, b.pelvis),
      L(b.head, b.chest), L(b.chest, b.handBow), L(b.chest, b.handDraw), L(b.head, b.pelvis),
    ];
  }

  function recompute(p) {
    const u = p.ups;
    p.maxHp = 100 + u.hp * 40;
    p.maxStam = 100 + u.stam * 35;
    p.regen = 22 + u.regen * 12;
    p.pullMul = 1 + u.pull * 0.25;
    p.armor = Math.min(0.7, u.armor * 0.12);
    p.dmgMul = 1 + u.dmg * 0.25;
    p.slots = 1 + Math.min(2, u.slots);
    p.hp = Math.min(p.hp, p.maxHp);
    p.stamina = Math.min(p.stamina, p.maxStam);
  }

  function shoulder(p) { return p.body.chest; }

  function stepPlayer(p, dt) {
    if (p.flash > 0) p.flash -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.down) return;

    // charge / stamina
    if (p.cooldown > 0) p.cooldown -= dt;
    if (p.drawing) {
      p.charge = clamp(p.charge + (dt / CHARGE_TIME) * p.pullMul, 0, 1);
      p.stamina -= STAM_DRAIN * dt;
      if (p.stamina <= 0) { p.stamina = 0; releaseShot(p); }
    } else {
      p.stamina = Math.min(p.maxStam, p.stamina + p.regen * dt);
    }

    // verlet integrate
    const b = p.body;
    for (const k in b) {
      const pt = b[k];
      const nx = pt.x + (pt.x - pt.px) * 0.9;
      const ny = pt.y + (pt.y - pt.py) * 0.9 + GRAV;
      pt.px = pt.x; pt.py = pt.y; pt.x = nx; pt.y = ny;
    }
    // pin feet
    hardPin(b.footL, p.footAL); hardPin(b.footR, p.footAR);

    // postural springs (keep it standing but floppy)
    const midx = (p.footAL.x + p.footAR.x) / 2, fy = p.footAL.y;
    spring(b.pelvis, midx, fy - 40, 0.06);
    spring(b.chest, midx, fy - 66, 0.05);
    spring(b.head, midx, fy - 90, 0.04);

    // draw pose: reach the bow arm toward the aim, pull the back hand back
    if (p.drawing) {
      const sh = shoulder(p);
      const ax = Math.cos(p.aim), ay = Math.sin(p.aim);
      const reach = 26 + p.charge * 8;
      spring(b.handBow, sh.x + ax * reach, sh.y + ay * reach, 0.5);
      const pull = -(6 + p.charge * 16);
      spring(b.handDraw, sh.x + ax * pull, sh.y + ay * pull, 0.4);
    } else {
      // rest arms near chest
      spring(b.handBow, b.chest.x + 20, b.chest.y + 4, 0.15);
      spring(b.handDraw, b.chest.x + 4, b.chest.y + 4, 0.15);
    }

    // constraints
    for (let it = 0; it < 5; it++) {
      for (const c of p.cons) solveCon(c);
      hardPin(b.footL, p.footAL); hardPin(b.footR, p.footAR);
    }
  }

  function hardPin(pt, a) { pt.x = a.x; pt.y = a.y; pt.px = a.x; pt.py = a.y; }
  function spring(pt, tx, ty, k) { pt.x += (tx - pt.x) * k; pt.y += (ty - pt.y) * k; }
  function solveCon(c) {
    const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const diff = (c.len - d) / d * 0.5;
    const ox = dx * diff, oy = dy * diff;
    c.a.x -= ox; c.a.y -= oy; c.b.x += ox; c.b.y += oy;
  }

  function releaseShot(p) {
    if (!p.drawing) return;
    const charge = p.charge, aim = p.aim;
    p.drawing = false; p.charge = 0;
    if (p.cooldown > 0 || p.down) return;
    p.cooldown = 0.14;
    const o = p.body.handBow;
    const speed = lerp(AIM_MIN, AIM_MAX, charge);
    const n = p.slots;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * 0.06;
      const a = aim + spread;
      state.arrows.push({
        x: o.x, y: o.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        team: "player", fromSlot: p.slot, stuck: false, life: 6, dmg: (30 + charge * 34) * p.dmgMul,
      });
    }
    // recoil kick to the bow arm
    const b = p.body, kx = -Math.cos(aim) * (2 + charge * 4), ky = -Math.sin(aim) * (2 + charge * 4);
    b.handBow.px -= kx; b.handBow.py -= ky; b.chest.px -= kx * 0.5;
  }

  // ---------------------------------------------------------------------------
  // Verlet ragdoll for deaths (free-flopping)
  // ---------------------------------------------------------------------------
  function makeRagdoll(cx, feetY, color, scale, vx, vy, ix, iy) {
    scale = scale || 1;
    const P = (x, y, ivx, ivy) => ({ x, y, px: x - (vx + (ivx || 0)), py: y - (vy + (ivy || 0)) });
    const s = scale;
    const pts = {
      head: P(cx, feetY - 90 * s, ix * 1.1, iy * 1.1), chest: P(cx, feetY - 66 * s, ix, iy),
      pelvis: P(cx, feetY - 42 * s, ix * 0.6, iy * 0.6),
      handL: P(cx - 15 * s, feetY - 56 * s, ix * 1.3, iy), handR: P(cx + 15 * s, feetY - 56 * s, ix * 1.3, iy),
      footL: P(cx - 9 * s, feetY - 1, 0, 0), footR: P(cx + 9 * s, feetY - 1, 0, 0),
    };
    const arr = Object.values(pts);
    const link = (a, b) => ({ a, b, len: Math.hypot(a.x - b.x, a.y - b.y) });
    const cons = [link(pts.head, pts.chest), link(pts.chest, pts.pelvis), link(pts.chest, pts.handL),
      link(pts.chest, pts.handR), link(pts.pelvis, pts.footL), link(pts.pelvis, pts.footR), link(pts.head, pts.pelvis)];
    return { pts, arr, cons, color, life: 3.4, alpha: 1, s };
  }
  function stepRagdoll(r, dt) {
    for (const p of r.arr) {
      const nx = p.x + (p.x - p.px) * 0.985, ny = p.y + (p.y - p.py) * 0.985 + GRAV;
      p.px = p.x; p.py = p.y; p.x = nx; p.y = ny;
      if (p.y > GROUND_Y) { p.y = GROUND_Y; p.py = p.y + (p.y - p.py) * 0.4; p.px = p.x - (p.x - p.px) * 0.55; }
      if (p.x < 4) { p.x = 4; p.px = p.x + (p.px - p.x) * 0.5; }
      if (p.x > W - 4) { p.x = W - 4; p.px = p.x + (p.px - p.x) * 0.5; }
    }
    for (let it = 0; it < 6; it++) for (const c of r.cons) solveCon(c);
    r.life -= dt; r.alpha = clamp(r.life / 1.0, 0, 1);
  }
  function drawRagdoll(r) {
    const p = r.pts;
    ctx.save(); ctx.globalAlpha = r.alpha; ctx.strokeStyle = r.color; ctx.lineCap = "round"; ctx.lineWidth = 7 * r.s;
    ctx.beginPath();
    seg(p.chest, p.pelvis); seg(p.chest, p.handL); seg(p.chest, p.handR); seg(p.pelvis, p.footL); seg(p.pelvis, p.footR);
    ctx.stroke();
    ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(p.head.x, p.head.y, 11 * r.s, 0, 7); ctx.fill();
    ctx.restore();
  }
  function seg(a, b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }

  // ---------------------------------------------------------------------------
  // Enemies — posed archers that draw + fire, flop into ragdolls on death
  // ---------------------------------------------------------------------------
  function spawnEnemy() {
    const w = state.wave;
    let type = "grunt";
    const roll = Math.random();
    if (w >= 4 && state.giantPending) { type = "giant"; state.giantPending = false; }
    else if (w >= 3 && roll < 0.20) type = "heavy";
    else if (w >= 2 && roll < 0.50) type = "archer";
    const def = ENEMY_TYPES[type];
    const hp = Math.round(def.hp + w * 0.5);
    state.enemies.push({
      type, def, color: def.color, scale: def.scale, x: W + rnd(10, 90), y: GROUND_Y,
      hp, maxHp: hp, armor: def.armor, speed: def.speed * (1 + w * 0.02),
      stopX: def.reach + rnd(-40, 40), drawT: 0, drawing: false, fireCd: rnd(700, def.fire),
      aim: Math.PI, flash: 0,
    });
  }

  function stepEnemy(e, dt, fr) {
    if (e.flash > 0) e.flash -= dt;
    const tgt = nearestAlivePlayer(e.x);
    if (!tgt) return;
    e.aim = Math.atan2((GROUND_Y - 62 * e.scale) - (GROUND_Y - 62 * e.scale), tgt.baseX - e.x); // horizontal baseline
    // approach then draw + fire
    if (e.x > e.stopX) {
      e.x -= e.speed * fr; e.drawing = false; e.drawT = 0;
    } else {
      e.fireCd -= dt * 1000;
      if (e.fireCd > 0 && e.fireCd < 900) { e.drawing = true; e.drawT = clamp(1 - e.fireCd / 900, 0, 1); }
      if (e.fireCd <= 0) { enemyFire(e, tgt); e.drawing = false; e.drawT = 0; e.fireCd = e.def.fire * rnd(0.8, 1.25); }
    }
  }

  function enemyFire(e, tgt) {
    const ox = e.x, oy = GROUND_Y - 62 * e.scale;
    const dx = tgt.baseX - ox;
    const speed = 12 + Math.min(7, Math.abs(dx) / 80);
    const ang = Math.atan2((-1.1 - rnd(0, 0.7)), dx / 90);
    state.arrows.push({ x: ox, y: oy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, team: "enemy", fromSlot: -1, stuck: false, life: 6, dmg: e.type === "giant" ? 26 : 14 });
  }

  // draw a posed archer (enemy or resting player fallback) facing a direction
  function drawPosed(cx, fy, scale, aim, drawT, color, faceRight, flash) {
    ctx.save();
    const s = scale, col = flash > 0 ? "#fff" : color;
    const pelvis = { x: cx, y: fy - 40 * s }, chest = { x: cx, y: fy - 66 * s }, head = { x: cx, y: fy - 90 * s };
    ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineWidth = 7 * s;
    ctx.beginPath();
    ctx.moveTo(pelvis.x, pelvis.y); ctx.lineTo(cx - 9 * s, fy);
    ctx.moveTo(pelvis.x, pelvis.y); ctx.lineTo(cx + 9 * s, fy);
    ctx.moveTo(chest.x, chest.y); ctx.lineTo(pelvis.x, pelvis.y);
    ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(head.x, head.y, 11 * s, 0, 7); ctx.fill();
    drawBow(chest, aim, drawT, s, col);
    ctx.restore();
  }

  function drawBow(sh, aim, charge, s, col) {
    const ax = Math.cos(aim), ay = Math.sin(aim);
    const bow = { x: sh.x + ax * 26 * s, y: sh.y + 4 + ay * 26 * s };
    ctx.strokeStyle = col; ctx.lineWidth = 6 * s;
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y + 4); ctx.lineTo(bow.x, bow.y); ctx.stroke();
    const perp = aim + Math.PI / 2, R = 15 * s;
    ctx.strokeStyle = "#5b3b1a"; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.arc(bow.x, bow.y, R, perp - 1.1, perp + 1.1); ctx.stroke();
    const tipA = { x: bow.x + Math.cos(perp - 1.1) * R, y: bow.y + Math.sin(perp - 1.1) * R };
    const tipB = { x: bow.x + Math.cos(perp + 1.1) * R, y: bow.y + Math.sin(perp + 1.1) * R };
    const nock = { x: bow.x + ax * -charge * 12 * s, y: bow.y + ay * -charge * 12 * s };
    ctx.strokeStyle = "#eee"; ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.moveTo(tipA.x, tipA.y); ctx.lineTo(nock.x, nock.y); ctx.lineTo(tipB.x, tipB.y); ctx.stroke();
    if (charge > 0.02) { ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 2.5 * s; ctx.beginPath(); ctx.moveTo(nock.x, nock.y); ctx.lineTo(bow.x + ax * 16 * s, bow.y + ay * 16 * s); ctx.stroke(); }
  }

  // draw the live player ragdoll from its physics points
  function drawPlayerBody(p, localAimOverride) {
    const b = p.body;
    ctx.save();
    if (p.down) ctx.globalAlpha = 0.3; else if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2) ctx.globalAlpha = 0.4;
    const col = p.flash > 0 ? "#fff" : (p.slot === localSlot ? "#4fc3ff" : "#7ee081");
    ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineWidth = 7;
    ctx.beginPath();
    seg(b.chest, b.pelvis); seg(b.pelvis, b.footL); seg(b.pelvis, b.footR);
    seg(b.chest, b.handDraw);
    ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.head.x, b.head.y, 11, 0, 7); ctx.fill();
    // bow arm + bow at handBow, oriented along aim
    const aim = (p.slot === localSlot && !p.down) ? (localAimOverride != null ? localAimOverride : p.aim) : p.aim;
    ctx.strokeStyle = col; ctx.lineWidth = 6;
    ctx.beginPath(); seg(b.chest, b.handBow); ctx.stroke();
    drawBow(b.handBow, aim, p.drawing ? p.charge : 0, 1, col);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Apples
  // ---------------------------------------------------------------------------
  const APPLE = { red: "#e23b3b", green: "#4fce54", gold: "#ffcf3f", winged: "#ffe07a" };
  function spawnApple() {
    const r = Math.random();
    let type = "red";
    if (r < 0.08) type = "winged"; else if (r < 0.35) type = "gold"; else if (r < 0.62) type = "green";
    const fromLeft = Math.random() < 0.4;
    const y = rnd(90, GROUND_Y - 120);
    state.apples.push({
      type, x: fromLeft ? -20 : W + 20, y, vx: (fromLeft ? 1 : -1) * rnd(1.6, 2.8) * (type === "winged" ? 1.5 : 1),
      bob: rnd(0, 6.28), r: type === "winged" ? 15 : 13, life: 14,
    });
  }
  function hitApple(a, p) {
    if (a.type === "red") p.hp = Math.min(p.maxHp, p.hp + 30);
    else if (a.type === "green") p.stamina = Math.min(p.maxStam, p.stamina + 30);
    else if (a.type === "gold") { p.hp = Math.min(p.maxHp, p.hp + 30); p.stamina = Math.min(p.maxStam, p.stamina + 30); }
    else { p.hp = Math.min(p.maxHp, p.hp + 90); p.stamina = Math.min(p.maxStam, p.stamina + 90); p.lives++; }
    for (let i = 0; i < 12; i++) state.particles.push({ x: a.x, y: a.y, vx: rnd(-3, 3), vy: rnd(-3, 2), life: rnd(0.3, 0.7), color: APPLE[a.type] });
  }

  // ---------------------------------------------------------------------------
  // Waves + combat
  // ---------------------------------------------------------------------------
  function startNextWave() {
    state.wave++;
    state.waveState = "fight";
    state.toSpawn = 3 + Math.floor(state.wave * 1.5);
    state.spawnTimer = 0;
    state.giantPending = state.wave >= 4 && state.wave % 3 === 0;
    for (const p of state.players) {
      if (p.down && p.lives > 0) { p.down = false; p.hp = Math.round(p.maxHp * 0.6); p.stamina = p.maxStam; p.invuln = 1.5; buildBody(p); }
    }
    state.ready = {};
  }

  function nearestAlivePlayer(x) {
    let best = null, bd = 1e9;
    for (const p of state.players) { if (p.down) continue; const d = Math.abs(p.baseX - x); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  function headHit(cx, fy, s, x, y) { return Math.hypot(x - cx, y - (fy - 90 * s)) < 13 * s; }
  function bodyHit(cx, fy, s, x, y) { const dx = x - cx, dy = y - (fy - 58 * s); return Math.abs(dx) < 15 * s && dy > -20 * s && dy < 24 * s; }

  function damagePlayer(p, dmg) {
    if (p.down || p.invuln > 0) return;
    p.hp -= dmg * (1 - p.armor); p.flash = 0.14;
    if (p.hp <= 0) {
      p.lives--; p.hp = 0;
      state.ragdolls.push(makeRagdoll(p.body.pelvis.x, GROUND_Y, p.slot === localSlot ? "#4fc3ff" : "#7ee081", 1, 0, 0, rnd(-2, 2), -3));
      if (p.lives > 0) { p.down = true; setTimeout(() => {}, 0); scheduleRespawn(p); }
      else { p.down = true; }
    }
  }
  function scheduleRespawn(p) { p._respawn = 1.6; }

  function killEnemy(e, hx, hy, vx, vy, headshot) {
    if (e.dead) return; e.dead = true;
    const imp = clamp(Math.hypot(vx, vy), 0, 30);
    const ix = Math.sign(vx || -1) * imp * 0.35, iy = -Math.abs(imp) * 0.3 - 2;
    state.ragdolls.push(makeRagdoll(e.x, GROUND_Y, e.color, e.scale, vx * 0.22, vy * 0.22, ix, iy));
    spawnBlood(hx, hy, e.color, headshot ? 16 : 9);
    const s = e.def.skulls + (headshot ? 2 : 0);
    state.skulls += s; state.score += s;
    deaths.push({ x: e.x, y: GROUND_Y, c: e.color, s: e.scale, vx: vx * 0.22, vy: vy * 0.22, ix, iy });
  }
  function spawnBlood(x, y, color, n) { n = n || 8; for (let i = 0; i < n; i++) state.particles.push({ x, y, vx: rnd(-3, 3), vy: rnd(-4, 1), life: rnd(0.3, 0.7), color }); }

  function simulate(dt) {
    if (state.over) return;
    const fr = dt * 60;

    if (state.waveState === "rest") {
      // shop is open; host advances when everyone is ready (or solo: player presses start)
    } else {
      if (state.toSpawn > 0) {
        state.spawnTimer -= dt * 1000;
        if (state.spawnTimer <= 0) { spawnEnemy(); state.toSpawn--; state.spawnTimer = Math.max(400, 1500 - state.wave * 55); }
      } else if (state.enemies.length === 0) {
        state.waveState = "rest"; onWaveCleared();
      }
    }

    // apples
    state.appleTimer -= dt;
    if (state.appleTimer <= 0 && state.waveState === "fight") { spawnApple(); state.appleTimer = rnd(4.5, 8); }
    for (const a of state.apples) { a.bob += dt * 3; a.x += a.vx * fr; a.y += Math.sin(a.bob) * 0.6; a.life -= dt; }

    // players
    for (const p of state.players) {
      stepPlayer(p, dt);
      if (p._respawn != null) { p._respawn -= dt; if (p._respawn <= 0) { p._respawn = null; if (p.lives > 0 && state.waveState === "fight") { p.down = false; p.hp = Math.round(p.maxHp * 0.5); p.stamina = p.maxStam; p.invuln = 1.5; buildBody(p); } } }
    }

    // enemies
    for (const e of state.enemies) stepEnemy(e, dt, fr);

    // arrows
    for (const a of state.arrows) {
      if (a.stuck) { a.life -= dt; continue; }
      a.vy += GRAV * fr; a.x += a.vx * fr; a.y += a.vy * fr; a.life -= dt;
      if (a.y >= GROUND_Y) { a.y = GROUND_Y; a.stuck = true; a.life = Math.min(a.life, 1.0); continue; }
      if (a.team === "player") {
        // apples first
        let hit = false;
        for (const ap of state.apples) { if (!ap.dead && Math.hypot(a.x - ap.x, a.y - ap.y) < ap.r + 4) { ap.dead = true; hitApple(ap, state.players[a.fromSlot] || state.players[0]); a.stuck = true; a.life = 0; hit = true; break; } }
        if (hit) continue;
        for (const e of state.enemies) {
          if (e.dead) continue;
          if (headHit(e.x, GROUND_Y, e.scale, a.x, a.y)) { registerKill(e, a, true); a.stuck = true; a.life = 0; break; }
          if (bodyHit(e.x, GROUND_Y, e.scale, a.x, a.y)) {
            e.hp -= Math.max(1, a.dmg * (1 - e.armor) / 20); e.flash = 0.12; a.stuck = true; a.life = 0;
            spawnBlood(a.x, a.y, e.color);
            if (e.hp <= 0) registerKill(e, a, false); break;
          }
        }
      } else {
        for (const p of state.players) {
          if (p.down || p.invuln > 0) continue;
          if (headHit(p.baseX, GROUND_Y, 1, a.x, a.y)) { damagePlayer(p, 55); a.stuck = true; a.life = 0; break; }
          if (bodyHit(p.baseX, GROUND_Y, 1, a.x, a.y)) { damagePlayer(p, a.dmg); a.stuck = true; a.life = 0; break; }
        }
      }
    }

    for (const r of state.ragdolls) stepRagdoll(r, dt);
    for (const pt of state.particles) { pt.vy += GRAV * fr * 0.6; pt.x += pt.vx * fr; pt.y += pt.vy * fr; pt.life -= dt; }

    state.arrows = state.arrows.filter((a) => a.life > 0 && a.x > -60 && a.x < W + 60);
    state.enemies = state.enemies.filter((e) => !e.dead);
    state.apples = state.apples.filter((a) => !a.dead && a.life > 0 && a.x > -60 && a.x < W + 60);
    state.ragdolls = state.ragdolls.filter((r) => r.life > 0);
    state.particles = state.particles.filter((p) => p.life > 0);

    // defeat: all players out of lives and down
    if (state.players.length && state.players.every((p) => p.down && p.lives <= 0)) { state.over = true; state.overWave = state.wave; onGameOver(); }
  }

  function registerKill(e, arrow, headshot) {
    if (arrow && arrow.fromSlot >= 0 && state.players[arrow.fromSlot]) state.players[arrow.fromSlot].kills++;
    killEnemy(e, arrow.x, arrow.y, arrow.vx, arrow.vy, headshot);
  }

  function onWaveCleared() { openShop(); if (role === "host" && net) net.send({ t: "shop", sk: state.skulls, w: state.wave }); }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1b2a4a"); g.addColorStop(0.6, "#26406b"); g.addColorStop(1, "#3a5a86");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#2f4a3a"; ctx.beginPath(); ctx.moveTo(0, GROUND_Y);
    for (let x = 0; x <= W; x += 80) ctx.lineTo(x, GROUND_Y - 40 - Math.sin(x * 0.01) * 22);
    ctx.lineTo(W, GROUND_Y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3d3324"; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "#4a3f2c"; ctx.fillRect(0, GROUND_Y, W, 5);
    // player platform
    ctx.fillStyle = "#5b5b63"; ctx.fillRect(80, GROUND_Y, 200, 6);

    const S = renderSource();
    for (const p of S.particles || []) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    ctx.globalAlpha = 1;
    for (const r of S.ragdolls || []) drawRagdoll(r);

    for (const e of S.enemies) {
      drawPosed(e.x, GROUND_Y, e.scale, e.aim != null ? e.aim : Math.PI, e.drawT || 0, e.flash > 0 ? "#fff" : e.color, false, e.flash);
      if (e.maxHp > 2 && e.hp > 0) { ctx.fillStyle = "#000a"; ctx.fillRect(e.x - 16 * e.scale, GROUND_Y - 112 * e.scale, 32 * e.scale, 5); ctx.fillStyle = "#7ee081"; ctx.fillRect(e.x - 15 * e.scale, GROUND_Y - 111 * e.scale, 30 * e.scale * clamp(e.hp / e.maxHp, 0, 1), 3); }
    }

    for (const p of S.players) {
      if (role === "guest" && p.body) drawPlayerBodyRemote(p);
      else drawPlayerBody(p, p.slot === localSlot ? localAim() : null);
    }

    for (const a of S.apples) drawApple(a);

    for (const a of S.arrows) {
      const ang = a.ang != null ? a.ang : Math.atan2(a.vy, a.vx);
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
      ctx.strokeStyle = a.team === "enemy" ? "#e0574a" : "#f4e2b8"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(1, -3); ctx.moveTo(6, 0); ctx.lineTo(1, 3); ctx.stroke();
      ctx.restore();
    }

    const lp = localPlayer();
    if (lp && lp.drawing && !lp.down && !state.over && (S.waveState === "fight")) drawTrajectory(lp);

    drawHud(S);
  }

  function drawApple(a) {
    ctx.save();
    ctx.fillStyle = APPLE[a.type]; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#3a5a2a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y - a.r); ctx.lineTo(a.x + 3, a.y - a.r - 5); ctx.stroke();
    if (a.type === "winged") { ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(a.x - a.r, a.y, 8, 4, -0.4, 0, 7); ctx.ellipse(a.x + a.r, a.y, 8, 4, 0.4, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  function drawPlayerBodyRemote(p) {
    // guest renders host's synced points
    const b = p.body; if (!b) return;
    ctx.save(); if (p.down) ctx.globalAlpha = 0.3;
    const col = p.flash ? "#fff" : (p.slot === localSlot ? "#4fc3ff" : "#7ee081");
    ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineWidth = 7;
    ctx.beginPath(); seg(b.chest, b.pelvis); seg(b.pelvis, b.footL); seg(b.pelvis, b.footR); seg(b.chest, b.handDraw); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.head.x, b.head.y, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.beginPath(); seg(b.chest, b.handBow); ctx.stroke();
    const aim = p.slot === localSlot ? localAim() : p.aim;
    drawBow(b.handBow, aim, p.drawing ? p.charge : 0, 1, col);
    ctx.restore();
  }

  function drawTrajectory(p) {
    const aim = localAim(), o = p.body.handBow;
    const speed = lerp(AIM_MIN, AIM_MAX, p.charge);
    let x = o.x, y = o.y, vx = Math.cos(aim) * speed, vy = Math.sin(aim) * speed;
    ctx.save(); ctx.fillStyle = "#fff";
    for (let i = 0; i < 50; i++) { vy += GRAV; x += vx; y += vy; if (y > GROUND_Y || x > W || x < 0) break; if (i % 3 === 0) { ctx.globalAlpha = clamp(0.5 - i * 0.01, 0.05, 0.5); ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); } }
    ctx.restore();
  }

  function drawHud(S) {
    ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 20px system-ui,sans-serif";
    ctx.fillText("Wave " + (S.wave || 0), 16, 28);
    ctx.textAlign = "right"; ctx.fillStyle = "#ffd76b"; ctx.font = "bold 20px system-ui,sans-serif";
    ctx.fillText("💀 " + (S.skulls != null ? S.skulls : 0), W - 16, 28);
    ctx.textAlign = "left";
    let hy = 42;
    for (const p of S.players) {
      const name = p.slot === localSlot ? "You" : (partnerName || "Ally");
      // hp
      ctx.fillStyle = "#000a"; ctx.fillRect(16, hy, 150, 12);
      ctx.fillStyle = p.down ? "#c0392b" : "#e2564a"; ctx.fillRect(17, hy + 1, 148 * clamp(p.hp / p.maxHp, 0, 1), 10);
      // stamina
      ctx.fillStyle = "#000a"; ctx.fillRect(16, hy + 14, 150, 8);
      ctx.fillStyle = "#4fce54"; ctx.fillRect(17, hy + 15, 148 * clamp(p.stamina / p.maxStam, 0, 1), 6);
      ctx.fillStyle = "#fff"; ctx.font = "11px system-ui,sans-serif";
      ctx.fillText(name + "  " + "❤".repeat(Math.max(0, p.lives)), 20, hy + 10);
      hy += 30;
    }
  }

  function renderSource() {
    if (role === "guest" && remote) return remote;
    return state;
  }

  // ---------------------------------------------------------------------------
  // Input — hold to draw, release to fire
  // ---------------------------------------------------------------------------
  const pointer = { x: W * 0.7, y: H * 0.4, down: false };
  function canvasPoint(ev) { const r = canvas.getBoundingClientRect(); const t = ev.touches ? ev.touches[0] : ev; return { x: (t.clientX - r.left) / r.width * W, y: (t.clientY - r.top) / r.height * H }; }
  function localPlayer() { return (role === "guest" && remote) ? remote.players[localSlot] : state.players[localSlot]; }
  function localAim() { const p = localPlayer(); const sx = p && p.body ? p.body.chest.x : (localSlot === 0 ? P0X : P1X); const sy = p && p.body ? p.body.chest.y : GROUND_Y - 66; return Math.atan2(pointer.y - sy, pointer.x - sx); }

  function onDown(ev) {
    if (!running || state.over) return; ev.preventDefault();
    const pt = canvasPoint(ev); pointer.x = pt.x; pointer.y = pt.y; pointer.down = true;
    const p = localPlayer(); if (!p || p.down) return;
    if (p.stamina < 8) return;
    if (role === "guest") { _gDrawing = true; _gCharge = 0; net && net.send({ t: "draw", a: localAim(), d: 1 }); }
    else { p.drawing = true; p.charge = 0; p.aim = localAim(); }
  }
  function onMove(ev) {
    const pt = canvasPoint(ev); pointer.x = pt.x; pointer.y = pt.y;
    const p = localPlayer();
    if (p && !p.down && role !== "guest") p.aim = localAim();
    if (role === "guest" && _gDrawing) net && net.send({ t: "draw", a: localAim(), d: 1 });
  }
  function onUp(ev) {
    if (!running) return; pointer.down = false;
    const p = localPlayer(); if (!p) return;
    if (role === "guest") { if (_gDrawing) { _gDrawing = false; net && net.send({ t: "fire", a: localAim() }); } return; }
    if (p.drawing) { p.aim = localAim(); releaseShot(p); }
  }
  let _gDrawing = false, _gCharge = 0;

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove", (e) => { e.preventDefault(); onMove(e); }, { passive: false });
  canvas.addEventListener("touchend", onUp);

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = 0, netAccum = 0;
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (role === "guest") { tickGuestLocal(dt); }
    else {
      simulate(dt);
      if (role === "host" && net) { netAccum += dt; if (netAccum >= 0.05) { netAccum = 0; broadcastState(); } }
    }
    draw();
    requestAnimationFrame(loop);
  }
  function tickGuestLocal(dt) {
    for (const r of state.ragdolls) stepRagdoll(r, dt);
    for (const pt of state.particles) { pt.vy += GRAV * dt * 36; pt.x += pt.vx * dt * 60; pt.y += pt.vy * dt * 60; pt.life -= dt; }
    state.ragdolls = state.ragdolls.filter((r) => r.life > 0);
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  // ---------------------------------------------------------------------------
  // Networking glue (host authoritative)
  // ---------------------------------------------------------------------------
  function pointsOf(p) { const b = p.body; return [b.head, b.chest, b.pelvis, b.handBow, b.handDraw, b.footL, b.footR].map((q) => [Math.round(q.x), Math.round(q.y)]); }
  function broadcastState() {
    const msg = {
      t: "state", w: state.wave, ws: state.waveState, sk: state.skulls, o: state.over ? 1 : 0,
      ps: state.players.map((p) => ({ h: Math.round(p.hp), mh: p.maxHp, st: Math.round(p.stamina), ms: p.maxStam, lv: p.lives, dn: p.down ? 1 : 0, ai: +p.aim.toFixed(2), ch: +p.charge.toFixed(2), dr: p.drawing ? 1 : 0, fl: p.flash > 0 ? 1 : 0, pt: pointsOf(p) })),
      es: state.enemies.slice(0, 40).map((e) => [Math.round(e.x), e.type[0], Math.round(e.hp), Math.round(e.maxHp), +e.scale.toFixed(2), +(e.aim || Math.PI).toFixed(2), +(e.drawT || 0).toFixed(2), e.flash > 0 ? 1 : 0]),
      as: state.arrows.slice(0, 50).map((a) => [Math.round(a.x), Math.round(a.y), +Math.atan2(a.vy, a.vx).toFixed(2), a.team === "enemy" ? 1 : 0]),
      ap: state.apples.slice(0, 12).map((a) => [Math.round(a.x), Math.round(a.y), a.type[0], a.r]),
      dk: deaths.splice(0, deaths.length),
    };
    net.send(msg);
  }
  const ETYPE = { g: "grunt", a: "archer", h: "heavy", i: "giant" };
  const ATYPE = { r: "red", g: "green", o: "gold", w: "winged" };
  function applyState(m) {
    remote = {
      wave: m.w, waveState: m.ws, skulls: m.sk, over: !!m.o, ragdolls: state.ragdolls, particles: state.particles,
      players: m.ps.map((d, i) => ({ slot: i, baseX: i === 0 ? P0X : P1X, hp: d.h, maxHp: d.mh, stamina: d.st, maxStam: d.ms, lives: d.lv, down: !!d.dn, aim: d.ai, charge: d.ch, drawing: !!d.dr, flash: d.fl, body: bodyFromPts(d.pt) })),
      enemies: m.es.map((e) => { const type = ETYPE[e[1]] || "grunt"; return { x: e[0], type, hp: e[2], maxHp: e[3], scale: e[4], aim: e[5], drawT: e[6], flash: e[7] ? 0.1 : 0, color: ENEMY_TYPES[type].color }; }),
      arrows: m.as.map((a) => ({ x: a[0], y: a[1], ang: a[2], team: a[3] ? "enemy" : "player" })),
      apples: m.ap.map((a) => ({ x: a[0], y: a[1], type: ATYPE[a[2]] || "red", r: a[3] })),
    };
    if (m.dk) for (const d of m.dk) state.ragdolls.push(makeRagdoll(d.x, d.y, d.c, d.s, d.vx, d.vy, d.ix, d.iy));
    if (m.o) { state.over = true; state.overWave = m.w; }
  }
  function bodyFromPts(pt) { const P = (a) => ({ x: a[0], y: a[1] }); return { head: P(pt[0]), chest: P(pt[1]), pelvis: P(pt[2]), handBow: P(pt[3]), handDraw: P(pt[4]), footL: P(pt[5]), footR: P(pt[6]) }; }

  // ---------------------------------------------------------------------------
  // Upgrade shop
  // ---------------------------------------------------------------------------
  let shopOpen = false;
  function openShop() {
    shopOpen = true;
    renderShop();
    el("shop").hidden = false;
    el("startWaveBtn").hidden = role === "guest";
    el("shopWaitMsg").hidden = role !== "guest";
  }
  function closeShop() { shopOpen = false; el("shop").hidden = true; }
  function shopPlayer() { return state.players[localSlot] || state.players[0]; }
  function renderShop() {
    const skulls = (role === "guest" && remote) ? remote.skulls : state.skulls;
    el("shopSkulls").textContent = "💀 " + skulls;
    const p = (role === "guest") ? null : shopPlayer();
    const grid = el("shopGrid"); grid.innerHTML = "";
    for (const u of UPGRADES) {
      const lvl = p ? p.ups[u.key] : 0;
      const maxed = u.max != null && lvl >= u.max;
      const cost = upCost(u, lvl);
      const afford = skulls >= cost && !maxed;
      const b = document.createElement("button");
      b.className = "up-btn" + (afford ? "" : " off");
      b.disabled = !afford;
      b.innerHTML = "<span class='up-ic'>" + u.icon + "</span><span class='up-name'>" + u.name + (lvl ? " <em>Lv" + lvl + "</em>" : "") + "</span>" +
        "<span class='up-desc'>" + escapeHtml(u.desc(lvl)) + "</span><span class='up-cost'>" + (maxed ? "MAX" : "💀 " + cost) + "</span>";
      b.onclick = () => buyUpgrade(u.key);
      grid.appendChild(b);
    }
  }
  function buyUpgrade(key) {
    if (role === "guest") { net && net.send({ t: "buy", key }); return; }
    const p = shopPlayer(); const u = UPGRADES.find((x) => x.key === key);
    const lvl = p.ups[key]; if (u.max != null && lvl >= u.max) return;
    const cost = upCost(u, lvl); if (state.skulls < cost) return;
    state.skulls -= cost; p.ups[key]++;
    if (key === "life") p.lives++;
    if (key === "hp") { p.ups.hp; }
    recompute(p);
    if (key === "hp") p.hp = p.maxHp;
    if (key === "stam") p.stamina = p.maxStam;
    renderShop();
    if (role === "host" && net) net.send({ t: "shop", sk: state.skulls, w: state.wave });
  }

  // ---------------------------------------------------------------------------
  // Score submission
  // ---------------------------------------------------------------------------
  const SOLO_GAME = "ragdoll-siege", COOP_GAME = "ragdoll-siege-coop";
  async function api(path, opts) { return await fetch(path, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...opts }); }
  async function submitSolo(score) { if (!me) return; try { await api("/api/scores", { method: "POST", body: JSON.stringify({ game: SOLO_GAME, score }) }); } catch (_) {} }
  async function submitCoop(score, partner) { if (!me || !partner) return; try { await api("/api/scores", { method: "POST", body: JSON.stringify({ game: COOP_GAME, score, partner }) }); } catch (_) {} }

  function onGameOver() {
    closeShop();
    const s = state.score;
    if (mode === "coop") { if (role === "host") { submitCoop(s, partnerName); net && net.send({ t: "over", sc: s, w: state.overWave }); } }
    else submitSolo(s);
    showOver(s, state.overWave);
  }

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  function showScreen(name) {
    for (const s of ["menu", "lobby", "over", "shop"]) el(s).hidden = s !== name;
    canvas.style.filter = (name && !running) ? "blur(2px)" : "none";
    if (name !== "shop") shopOpen = false;
  }
  function resetWorld(n) {
    Object.assign(state, freshState());
    for (let i = 0; i < n; i++) state.players.push(makePlayer(i));
    state.waveState = "rest"; deaths.length = 0; remote = null;
  }
  function startLoop() { running = true; last = performance.now(); el("hud").hidden = false; requestAnimationFrame(loop); }

  function beginSolo() { mode = "solo"; role = null; localSlot = 0; partnerName = null; resetWorld(1); startLoop(); openShop(); showScreenKeepShop(); }
  function beginCoopHost() { mode = "coop"; role = "host"; localSlot = 0; resetWorld(2); startLoop(); net && net.send({ t: "start" }); openShop(); showScreenKeepShop(); }
  function beginCoopGuest() { mode = "coop"; role = "guest"; localSlot = 1; resetWorld(2); state.players = []; startLoop(); showScreen(null); }
  function showScreenKeepShop() { for (const s of ["menu", "lobby", "over"]) el(s).hidden = true; canvas.style.filter = "none"; }

  el("startWaveBtn").onclick = () => {
    if (role === "guest") return;
    closeShop(); startNextWave();
  };

  function showOver(score, wave) {
    running = false; closeShop();
    el("overScore").textContent = score; el("overWave").textContent = wave;
    el("overMsg").textContent = mode === "coop" ? (partnerName ? "Team run with " + partnerName : "Co-op run") : "Solo run";
    el("hud").hidden = true; showScreen("over");
  }

  // ------- co-op lobby -------
  let currentCode = null;
  function setLobby(html, code) { el("lobbyStatus").innerHTML = html; el("lobbyCode").textContent = code || "----"; }
  function teardownNet() { if (net) { try { net.close(); } catch (_) {} net = null; } partnerName = null; }

  function doHost(code) {
    currentCode = code;
    net = RagdollNet.host(code, me.username, {
      onStatus(s) {
        if (s === "waiting") setLobby("Share code <b>" + code + "</b> with your friend.<br><span class='muted'>Waiting for them to join…</span>", code);
        else if (s === "connecting") setLobby("Opening room…", code);
        else if (s === "taken") { currentCode = RagdollNet.randomCode(); return doHost(currentCode); }
        else setLobby("<span class='err'>Connection error. Try again.</span>", code);
      },
      onJoin() { setLobby("Friend connected! Starting…", code); },
      onData(m) { onGuestMsg(m); },
      onLeft() { partnerName = null; },
    });
    setLobby("Opening room…", code);
  }
  function doJoin(code) {
    currentCode = code;
    net = RagdollNet.join(code, me.username, {
      onStatus(s) {
        if (s === "connecting") setLobby("Connecting to <b>" + code + "</b>…", code);
        else if (s === "notfound") setLobby("<span class='err'>No room with that code.</span>", code);
        else setLobby("<span class='err'>Connection error.</span>", code);
      },
      onJoin() { net.send({ t: "hello", name: me.username }); setLobby("Connected! Waiting for host…", code); },
      onData(m) { onHostMsg(m); },
      onLeft() { if (running) showOver(state.score, state.wave); else setLobby("<span class='err'>Host left.</span>", code); },
    });
    setLobby("Connecting…", code);
  }

  function onGuestMsg(m) {
    if (!m) return;
    if (m.t === "hello") { partnerName = m.name; net.send({ t: "hello", name: me.username }); if (!running) beginCoopHost(); }
    else if (m.t === "draw") { const p = state.players[1]; if (p && !p.down) { p.aim = m.a; if (m.d && !p.drawing && p.stamina > 8) { p.drawing = true; p.charge = 0; } } }
    else if (m.t === "fire") { const p = state.players[1]; if (p && !p.down) { p.aim = m.a; releaseShot(p); } }
    else if (m.t === "buy") { const saved = localSlot; localSlot = 1; buyUpgrade(m.key); localSlot = saved; }
  }
  function onHostMsg(m) {
    if (!m) return;
    if (m.t === "hello") partnerName = m.name;
    else if (m.t === "start") { if (!running) beginCoopGuest(); }
    else if (m.t === "state") { if (!running) beginCoopGuest(); applyState(m); if (m.ws === "fight" && shopOpen) closeShop(); }
    else if (m.t === "shop") { if (remote) remote.skulls = m.sk; if (!shopOpen) openShop(); else renderShop(); }
    else if (m.t === "over") { state.score = m.sc; showOver(m.sc, m.w); }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    me = RagdollNet.online() ? await RagdollNet.getMe() : null;
    const coopReady = !!me;
    el("coopBtn").disabled = !coopReady;
    el("coopHint").textContent = coopReady ? "Play the waves with a friend on the same team." : "Log in on the arcade to unlock co-op + leaderboards.";
    if (!RagdollNet.online()) el("coopHint").textContent = "Co-op needs a network connection.";

    el("soloBtn").onclick = beginSolo;
    el("coopBtn").onclick = () => { if (!coopReady) return; showScreen("lobby"); setLobby("Host a room or join a friend's code.", "----"); };
    el("hostBtn").onclick = () => { if (me) doHost(RagdollNet.randomCode()); };
    el("joinBtn").onclick = () => { const c = RagdollNet.cleanCode(el("codeInput").value); if (c.length < 3) { el("codeInput").style.borderColor = "#ff5b5b"; return; } doJoin(c); };
    el("codeInput").addEventListener("input", () => { el("codeInput").style.borderColor = ""; el("codeInput").value = RagdollNet.cleanCode(el("codeInput").value); });
    el("lobbyBack").onclick = () => { teardownNet(); showScreen("menu"); };
    el("againBtn").onclick = () => { teardownNet(); running = false; showScreen("menu"); idle(); };
    el("menuBtn").onclick = () => { running = false; teardownNet(); showScreen("menu"); idle(); };

    showScreen("menu");
    idle();
  }
  function idle() { if (running) return; draw(); if (!running) requestAnimationFrame(function again() { if (!running) { draw(); requestAnimationFrame(again); } }); }

  boot();
})();
