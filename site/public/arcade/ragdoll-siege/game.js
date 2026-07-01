/*
 * game.js — Ragdoll Siege (rebuilt from the ground up)
 * ---------------------------------------------------------------------------
 * A physics archery duel. EVERY character is a floppy verlet ragdoll that
 * stands via balance springs. You aim SLINGSHOT-style: press, drag away from
 * your target, release to fire the opposite way — pull distance is power.
 *
 * The soul of the game is physical hit reactions: every arrow hit slams an
 * impulse into the ragdoll, leaves a red wound, and the arrow STICKS in the
 * body. Hits knock bodies flat; downed archers can still shoot, and stand
 * back up with the JUMP/STAND UP button (costs stamina) while under fire.
 *
 * Structure: 1v1 duels, endless. One enemy at a time spawns on a floating
 * platform cluster at a random spot; kill it (💀 skulls, streak +1) and a
 * tougher one appears. Dying resets your streak — skulls persist and buy
 * upgrades in the hub. Apples drift across the sky; shoot them to recover
 * (red = health, green = stamina, gold = both, winged = big heal + a life).
 *
 * Modes: solo, or two-player co-op on the same team via a 4-letter room code
 * (host-authoritative sim; guest streams aim/fire and renders host state).
 * Networking lives in net.js (window.RagdollNet).
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // ---- world ----
  const W = 960, H = 540;
  const FLOOR = 522;                  // invisible safety floor (void below towers)
  const G = 0.42;                     // gravity px/frame² (frame = 1/60s)
  const MAXPULL = 150;                // drag length for full power
  const HEAD = 0, CHEST = 1, PELVIS = 2, HBOW = 3, HDRAW = 4, FOOTL = 5, FOOTR = 6;

  const TOWERS = [
    { x: 118, y: 386, w: 142, h: H - 386 },   // slot 0 (host / solo)
    { x: 296, y: 350, w: 112, h: H - 350 },   // slot 1 (co-op guest)
  ];

  const ENEMY_DEFS = {
    scout:   { hp: 60,  s: 1.0,  skulls: 3,  fire: [2.3, 3.3], dmg: 16, spd: 15, col: "#d9d9de" },
    soldier: { hp: 110, s: 1.08, skulls: 5,  fire: [1.8, 2.7], dmg: 21, spd: 16, col: "#c9c9d1" },
    brute:   { hp: 240, s: 1.5,  skulls: 12, fire: [2.6, 3.7], dmg: 32, spd: 15, col: "#b3b3bd" },
  };

  const UPGRADES = [
    { key: "dmg",   name: "Damage",          icon: "🗡️", base: 10, desc: "+20% arrow damage" },
    { key: "hp",    name: "Health",          icon: "❤️", base: 10, desc: "+30 max health" },
    { key: "stam",  name: "Stamina",         icon: "⚡", base: 10, desc: "+25 max stamina" },
    { key: "regen", name: "Stamina Refresh", icon: "🔄", base: 10, desc: "+5/s stamina regen" },
    { key: "pull",  name: "Pull Strength",   icon: "🏹", base: 12, desc: "+12% arrow speed" },
    { key: "armor", name: "Armor",           icon: "🛡️", base: 15, desc: "-10% damage taken", max: 5 },
    { key: "slots", name: "Arrow Slots",     icon: "🎯", base: 50, desc: "+1 arrow per shot", max: 2 },
    { key: "life",  name: "Extra Life",      icon: "💚", base: 40, desc: "keep your streak on death", max: 5 },
  ];
  const upCost = (u, l) => Math.round(u.base * Math.pow(1.75, l));

  // ---- canvas ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;

  // ---- helpers ----
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const el = (id) => document.getElementById(id);
  const dist2seg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
    const qx = ax + dx * t, qy = ay + dy * t;
    return { d: Math.hypot(px - qx, py - qy), qx, qy };
  };

  // ---- persistence (skulls + upgrades survive sessions; namespaced) ----
  const LS = "ragdoll-siege:";
  function loadWallet() { try { return Math.max(0, parseInt(localStorage.getItem(LS + "skulls") || "0", 10) || 0); } catch (_) { return 0; } }
  function saveWallet(n) { try { localStorage.setItem(LS + "skulls", String(n)); } catch (_) {} }
  function loadUps() { try { const u = JSON.parse(localStorage.getItem(LS + "ups") || "{}"); return { dmg: 0, hp: 0, stam: 0, regen: 0, pull: 0, armor: 0, slots: 0, life: 0, ...u }; } catch (_) { return { dmg: 0, hp: 0, stam: 0, regen: 0, pull: 0, armor: 0, slots: 0, life: 0 }; } }
  function saveUps(u) { try { localStorage.setItem(LS + "ups", JSON.stringify(u)); } catch (_) {} }

  // ---------------------------------------------------------------------------
  // Verlet ragdoll — one shape for players AND enemies
  // pts: 0 head, 1 chest, 2 pelvis, 3 bow hand, 4 draw hand, 5 foot L, 6 foot R
  // ---------------------------------------------------------------------------
  function pt(x, y) { return { x, y, px: x, py: y }; }
  function makeBody(x, top, s, facing) {
    const f = facing || 1;
    const pts = [
      pt(x, top - 84 * s), pt(x, top - 62 * s), pt(x, top - 38 * s),
      pt(x + 16 * s * f, top - 56 * s), pt(x + 5 * s * f, top - 54 * s),
      pt(x - 9 * s, top), pt(x + 9 * s, top),
    ];
    const L = (a, b) => ({ a, b, len: Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) });
    return {
      pts, s, f, ax: x, top,
      cons: [L(HEAD, CHEST), L(CHEST, PELVIS), L(PELVIS, FOOTL), L(PELVIS, FOOTR), L(CHEST, HBOW), L(CHEST, HDRAW), L(HEAD, PELVIS)],
      mode: "stand", downT: 0, airT: 0, fade: 1,
    };
  }

  function addVel(p, vx, vy) { p.px -= vx; p.py -= vy; }

  function stepBody(b, dt, pose, rects) {
    const damp = b.mode === "stand" ? 0.90 : 0.975;
    for (const p of b.pts) {
      const nx = p.x + (p.x - p.px) * damp;
      const ny = p.y + (p.y - p.py) * damp + G;
      p.px = p.x; p.py = p.y; p.x = nx; p.y = ny;
    }

    const s = b.s, P = b.pts;
    if (b.mode === "stand") {
      // balance springs hold it upright — floppy but standing
      const lean = pose ? -Math.cos(pose.ang) * 9 * pose.pow : 0;
      spring(P[PELVIS], b.ax + lean * 0.4, b.top - 38 * s, 0.12);
      spring(P[CHEST], b.ax + lean, b.top - 62 * s, 0.09);
      spring(P[HEAD], b.ax + lean * 1.3, b.top - 84 * s, 0.07);
      spring(P[FOOTL], b.ax - 9 * s, b.top, 0.55);
      spring(P[FOOTR], b.ax + 9 * s, b.top, 0.55);
    } else if (b.mode === "air") {
      b.airT += dt;
    } else { // down / dead — free flop
      b.downT += dt;
    }

    // arms: draw pose (works standing OR downed — you can shoot from the floor)
    if (pose) {
      const ax = Math.cos(pose.ang), ay = Math.sin(pose.ang);
      spring(P[HBOW], P[CHEST].x + ax * 30 * s, P[CHEST].y + ay * 30 * s, 0.55);
      spring(P[HDRAW], P[CHEST].x - ax * (6 + 15 * pose.pow) * s, P[CHEST].y - ay * (6 + 15 * pose.pow) * s, 0.45);
    } else if (b.mode === "stand") {
      spring(P[HBOW], P[CHEST].x + 17 * s * b.f, P[CHEST].y + 13 * s, 0.18);
      spring(P[HDRAW], P[CHEST].x + 5 * s * b.f, P[CHEST].y + 11 * s, 0.18);
    }

    for (let i = 0; i < 5; i++) for (const c of b.cons) {
      const A = b.pts[c.a], B = b.pts[c.b];
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 0.001;
      const off = (c.len - d) / d * 0.5;
      A.x -= dx * off; A.y -= dy * off; B.x += dx * off; B.y += dy * off;
    }

    // collide points with platforms + safety floor
    for (const p of b.pts) {
      if (p.y > FLOOR) { p.y = FLOOR; p.px = p.x - (p.x - p.px) * 0.5; p.py = p.y + (p.y - p.py) * 0.4; }
      if (p.x < 6) p.x = 6; if (p.x > W - 6) p.x = W - 6;
      for (const r of rects) {
        if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) {
          const dl = p.x - r.x, dr = r.x + r.w - p.x, dtp = p.y - r.y;
          if (dtp <= dl && dtp <= dr) { p.y = r.y; p.px = p.x - (p.x - p.px) * 0.5; p.py = p.y + (p.y - p.py) * 0.4; }
          else if (dl < dr) p.x = r.x; else p.x = r.x + r.w;
        }
      }
    }

    // landing after a jump → stand back up where we are
    if (b.mode === "air" && b.airT > 0.35) {
      const fy = Math.max(P[FOOTL].y, P[FOOTR].y);
      const vy = P[PELVIS].y - P[PELVIS].py;
      if (Math.abs(vy) < 1.2 && (onSupport(P[FOOTL], rects) || onSupport(P[FOOTR], rects) || fy >= FLOOR - 2)) reanchor(b, rects);
    }
  }
  function spring(p, tx, ty, k) { p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; }
  function onSupport(p, rects) { for (const r of rects) if (p.x > r.x - 4 && p.x < r.x + r.w + 4 && Math.abs(p.y - r.y) < 5) return true; return false; }
  function reanchor(b, rects) {
    const px = b.pts[PELVIS].x;
    let top = FLOOR;
    for (const r of rects) if (px > r.x - 6 && px < r.x + r.w + 6 && r.y >= b.pts[PELVIS].y - 20 && r.y < top) top = r.y;
    b.ax = px; b.top = top; b.mode = "stand";
  }
  function knockdown(b) { if (b.mode !== "dead") { b.mode = "down"; b.downT = 0; } }
  function jumpBody(b) { if (b.mode !== "stand") return false; b.mode = "air"; b.airT = 0; for (const p of b.pts) addVel(p, 0, -6.2); return true; }

  // ---------------------------------------------------------------------------
  // Session / state
  // ---------------------------------------------------------------------------
  let mode = "solo", role = null, running = false, paused = false;
  let net = null, me = null, partnerName = null, localSlot = 0;
  let wallet = loadWallet();          // 💀 persistent
  let remote = null;                  // guest's snapshot of host world

  const S = {
    inRun: false, players: [], enemies: [], arrows: [], apples: [], bows: [],
    parts: [], texts: [], stuckWorld: [], cluster: null, clusterRects: [],
    streak: 0, best: 0, spawnT: 0, appleT: 5, fx: [],
  };

  function makePlayer(slot, ups) {
    const t = TOWERS[slot];
    const p = {
      slot, ups: ups || loadUps(), tower: t,
      wounds: [], stuck: [], drag: null, cd: 0, deadT: 0, alive: true, respawnKeep: false,
    };
    p.body = makeBody(t.x + t.w / 2, t.y, 1, 1);
    recompute(p);
    p.hp = p.maxHp; p.stam = p.maxStam; p.lives = p.ups.life;
    return p;
  }
  function recompute(p) {
    p.maxHp = 100 + 30 * p.ups.hp;
    p.maxStam = 100 + 25 * p.ups.stam;
    p.regen = 14 + 5 * p.ups.regen;
    p.spdMul = 1 + 0.12 * p.ups.pull;
    p.dmgMul = 1 + 0.2 * p.ups.dmg;
    p.armor = Math.min(0.5, 0.1 * p.ups.armor);
    p.slots = 1 + Math.min(2, p.ups.slots);
  }

  // ---------------------------------------------------------------------------
  // Enemy spawning — one duelist at a time, on a fresh platform cluster
  // ---------------------------------------------------------------------------
  function pickEnemyType() {
    if (S.streak > 0 && (S.streak + 1) % 5 === 0) return "brute";
    if (S.streak < 3) return "scout";
    return Math.random() < 0.55 ? "soldier" : "scout";
  }
  function spawnCluster() {
    const cx = rnd(560, 840), top = rnd(215, 415);
    const kind = Math.floor(rnd(0, 4));
    const rects = [], deco = { kind, cx, top };
    if (kind === 0) rects.push({ x: cx - 32, y: top, w: 64, h: 64 });                                   // block
    else if (kind === 1) { rects.push({ x: cx - 50, y: top, w: 44, h: 44 }); rects.push({ x: cx + 6, y: top, w: 44, h: 44 }); } // two diamonds
    else if (kind === 2) rects.push({ x: cx - 28, y: top, w: 56, h: 110 });                             // column
    else rects.push({ x: cx - 60, y: top, w: 120, h: 26 });                                             // slab
    S.cluster = deco; S.clusterRects = rects;
  }
  function spawnEnemy() {
    spawnCluster();
    const type = pickEnemyType();
    const def = ENEMY_DEFS[type];
    const hp = Math.round(def.hp * (1 + S.streak * 0.045));
    const x = S.cluster.cx, top = Math.min(...S.clusterRects.map((r) => r.y));
    const e = {
      type, def, hp, maxHp: hp, wounds: [], stuck: [], deadT: 0,
      draw: null, fireT: rnd(def.fire[0], def.fire[1]) * 0.6, aimAng: Math.PI,
    };
    e.body = makeBody(x, top - 26, def.s, -1);       // drops in from just above its platform
    S.enemies.push(e);
  }

  // ballistic solver: scan launch angles, keep the one that lands nearest target
  function solveAim(ox, oy, tx, ty, spd) {
    const base = Math.atan2(ty - oy, tx - ox);
    let bestA = base, bestD = 1e9;
    for (let a = base - 1.2; a <= base + 0.45; a += 0.045) {
      let x = ox, y = oy, vx = Math.cos(a) * spd, vy = Math.sin(a) * spd, d = 1e9;
      for (let i = 0; i < 110; i++) {
        vy += G; x += vx; y += vy;
        const dd = Math.hypot(x - tx, y - ty); if (dd < d) d = dd;
        if (y > FLOOR || x < 0 || x > W + 100) break;
      }
      if (d < bestD) { bestD = d; bestA = a; }
    }
    return bestA;
  }

  function stepEnemy(e, dt) {
    if (e.body.mode === "dead") { e.deadT += dt; e.body.fade = clamp(1 - (e.deadT - 1.6) / 0.6, 0, 1); return; }
    // recover after being knocked flat
    if (e.body.mode === "down" && e.downRecover == null) e.downRecover = 1.2 + rnd(0, 0.7);
    if (e.body.mode === "down" && e.body.downT > e.downRecover) { reanchor(e.body, S.clusterRects.concat(worldRects())); e.downRecover = null; }

    const tgt = nearestAlivePlayer(e.body.pts[CHEST].x);
    if (!tgt || e.body.mode === "down" || e.body.mode === "air") return;
    e.fireT -= dt;
    if (e.fireT <= 0.55 && !e.draw) {
      const c = e.body.pts[CHEST], t = tgt.body.pts[CHEST];
      e.aimAng = solveAim(c.x, c.y, t.x + rnd(-30, 30), t.y + rnd(-25, 15), e.def.spd) + rnd(-0.045, 0.045);
      e.draw = { ang: e.aimAng, pow: 0 };
    }
    if (e.draw) e.draw.pow = clamp(e.draw.pow + dt / 0.55, 0, 1);
    if (e.fireT <= 0) {
      const hb = e.body.pts[HBOW];
      S.arrows.push({ x: hb.x, y: hb.y, vx: Math.cos(e.aimAng) * e.def.spd, vy: Math.sin(e.aimAng) * e.def.spd, team: "e", slot: -1, dmg: e.def.dmg, life: 7 });
      addVel(e.body.pts[HBOW], -Math.cos(e.aimAng) * 2, -Math.sin(e.aimAng) * 2);
      e.draw = null; e.fireT = rnd(e.def.fire[0], e.def.fire[1]);
    }
  }

  function nearestAlivePlayer(x) {
    let best = null, bd = 1e9;
    for (const p of S.players) { if (!p.alive) continue; const d = Math.abs(p.body.pts[CHEST].x - x); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function worldRects() {
    const rs = [TOWERS[0]];
    if (S.players.length > 1) rs.push(TOWERS[1]);
    return rs;
  }

  // ---------------------------------------------------------------------------
  // Hits — impulse, wound, stuck arrow, blood. The juice.
  // ---------------------------------------------------------------------------
  function attach(list, body, x, y, extra) {
    let pi = 0, bd = 1e9;
    for (let i = 0; i < body.pts.length; i++) { const d = Math.hypot(body.pts[i].x - x, body.pts[i].y - y); if (d < bd) { bd = d; pi = i; } }
    list.push({ pi, dx: x - body.pts[pi].x, dy: y - body.pts[pi].y, ...extra });
    if (list.length > 12) list.shift();
  }
  function hitBody(char, a, qx, qy, isHead) {
    const spd = Math.hypot(a.vx, a.vy);
    const iv = clamp(spd * 0.5, 3, 12);
    const ux = a.vx / (spd || 1), uy = a.vy / (spd || 1);
    const b = char.body;
    // impulse the nearest two points along the arrow's direction
    const order = b.pts.map((p, i) => ({ i, d: Math.hypot(p.x - qx, p.y - qy) })).sort((m, n) => m.d - n.d);
    addVel(b.pts[order[0].i], ux * iv, uy * iv - 1.5);
    addVel(b.pts[order[1].i], ux * iv * 0.5, uy * iv * 0.5);
    knockdown(b);
    attach(char.wounds, b, qx, qy, { r: isHead ? 4.5 : 3.5 });
    attach(char.stuck, b, qx, qy, { ang: Math.atan2(a.vy, a.vx) });
    blood(qx, qy, isHead ? 16 : 9);
    S.fx.push([Math.round(qx), Math.round(qy), isHead ? 1 : 0]);
  }
  function blood(x, y, n) { for (let i = 0; i < n; i++) S.parts.push({ x, y, vx: rnd(-2.6, 2.6), vy: rnd(-3.5, 0.5), life: rnd(0.3, 0.7), col: Math.random() < 0.7 ? "#c93a34" : "#e8693f" }); }
  function floatText(x, y, str, col) { S.texts.push({ x, y, str, col, t: 0 }); }
  function dropBow(body, col) { const hb = body.pts[HBOW]; S.bows.push({ x: hb.x, y: hb.y, vx: rnd(-1.5, 1.5), vy: -4, rot: 0, vr: rnd(-0.25, 0.25), life: 2.4, col }); }

  // capsule hit test vs one character; returns {qx,qy,head} or null
  function testChar(char, x, y) {
    const P = char.body.pts, s = char.body.s;
    if (Math.hypot(x - P[HEAD].x, y - P[HEAD].y) < 12 * s) return { qx: x, qy: y, head: true };
    const segs = [[CHEST, PELVIS, 9], [PELVIS, FOOTL, 5.5], [PELVIS, FOOTR, 5.5], [CHEST, HBOW, 4.5], [CHEST, HDRAW, 4.5]];
    for (const [i, j, r] of segs) {
      const h = dist2seg(x, y, P[i].x, P[i].y, P[j].x, P[j].y);
      if (h.d < r * s + 2.5) return { qx: h.qx, qy: h.qy, head: false };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Firing
  // ---------------------------------------------------------------------------
  function fireFrom(p, ang, pow) {
    if (p.cd > 0 || !p.alive) return;
    const cost = 4 + 6 * pow;
    if (p.stam < 2) return;
    p.stam = Math.max(0, p.stam - cost);
    p.cd = 0.18;
    const hb = p.body.pts[HBOW];
    const spd = (9 + 17 * pow) * p.spdMul;
    for (let i = 0; i < p.slots; i++) {
      const a2 = ang + (i - (p.slots - 1) / 2) * 0.055;
      S.arrows.push({ x: hb.x, y: hb.y, vx: Math.cos(a2) * spd, vy: Math.sin(a2) * spd, team: "p", slot: p.slot, dmg: (28 + 42 * pow) * p.dmgMul, life: 7 });
    }
    addVel(p.body.pts[HBOW], -Math.cos(ang) * (1 + pow * 2.5), -Math.sin(ang) * (1 + pow * 2.5));
    p.drag = null;
  }

  // ---------------------------------------------------------------------------
  // Apples
  // ---------------------------------------------------------------------------
  const APPLES = { r: { col: "#e23b3b", hp: 30, st: 0 }, g: { col: "#58cd52", hp: 0, st: 30 }, o: { col: "#f5c33b", hp: 30, st: 30 }, w: { col: "#ffe27a", hp: 90, st: 90, life: 1 } };
  function spawnApple() {
    const roll = Math.random();
    const ty = roll < 0.08 ? "w" : roll < 0.36 ? "o" : roll < 0.64 ? "g" : "r";
    const fromLeft = Math.random() < 0.5;
    S.apples.push({ ty, x: fromLeft ? -16 : W + 16, y: rnd(95, 265), vx: (fromLeft ? 1 : -1) * rnd(0.9, 1.6) * (ty === "w" ? 0.75 : 1), ph: rnd(0, 6.28) });
  }
  function appleHit(a, slot) {
    const d = APPLES[a.ty], p = S.players[slot] || S.players[0];
    if (!p) return;
    if (d.hp) { p.hp = Math.min(p.maxHp, p.hp + d.hp); floatText(a.x, a.y - 6, "+" + d.hp + " ❤", "#ff6a5e"); }
    if (d.st) { p.stam = Math.min(p.maxStam, p.stam + d.st); floatText(a.x, a.y + 8, "+" + d.st + " ⚡", "#6ed4ff"); }
    if (d.life) { p.lives = Math.min(5, p.lives + 1); floatText(a.x, a.y - 20, "+1 LIFE", "#8dff8d"); }
    for (let i = 0; i < 10; i++) S.parts.push({ x: a.x, y: a.y, vx: rnd(-2.5, 2.5), vy: rnd(-3, 1), life: rnd(0.3, 0.6), col: d.col });
  }

  // ---------------------------------------------------------------------------
  // Simulation (host / solo authoritative)
  // ---------------------------------------------------------------------------
  function simulate(dt) {
    const fr = dt * 60;
    const rects = worldRects().concat(S.clusterRects);

    // players
    for (const p of S.players) {
      if (p.cd > 0) p.cd -= dt;
      if (!p.alive) {
        p.deadT -= dt;
        if (p.deadT <= 0) respawn(p);
      } else if (p.drag) {
        p.stam -= 9 * dt;
        if (p.stam <= 0) { p.stam = 0; fireFrom(p, p.drag.ang, p.drag.pow); }
      } else {
        p.stam = Math.min(p.maxStam, p.stam + p.regen * dt);
      }
      stepBody(p.body, dt, p.alive ? p.drag : null, rects);
    }

    // enemies
    for (const e of S.enemies) { stepEnemy(e, dt); stepBody(e.body, dt, e.draw, rects); }

    // spawn flow — one duelist at a time
    if (S.inRun && !S.enemies.some((e) => e.body.mode !== "dead")) {
      S.spawnT -= dt;
      if (S.spawnT <= 0) { spawnEnemy(); S.spawnT = 1.3; }
    }
    S.enemies = S.enemies.filter((e) => e.body.mode !== "dead" || e.deadT < 2.3);

    // apples
    if (S.inRun) { S.appleT -= dt; if (S.appleT <= 0 && S.apples.length < 3) { spawnApple(); S.appleT = rnd(6, 10); } }
    for (const a of S.apples) { a.x += a.vx * fr; a.ph += 0.035 * fr; a.y += Math.sin(a.ph) * 0.55; }
    S.apples = S.apples.filter((a) => a.x > -40 && a.x < W + 40 && !a.dead);

    // arrows
    for (const a of S.arrows) {
      a.vy += G * fr; a.x += a.vx * fr; a.y += a.vy * fr; a.life -= dt;
      if (a.dead) continue;
      if (a.team === "p") {
        for (const ap of S.apples) if (!ap.dead && Math.hypot(a.x - ap.x, a.y - ap.y) < 15) { ap.dead = true; appleHit(ap, a.slot); a.dead = true; break; }
        if (a.dead) continue;
        for (const e of S.enemies) {
          if (e.body.mode === "dead") continue;
          const h = testChar(e, a.x, a.y);
          if (h) { a.dead = true; damageEnemy(e, a, h); break; }
        }
      } else {
        for (const p of S.players) {
          if (!p.alive) continue;
          const h = testChar(p, a.x, a.y);
          if (h) { a.dead = true; damagePlayer(p, a, h); break; }
        }
      }
      if (a.dead) continue;
      // stick into terrain
      if (a.y > FLOOR) { a.dead = true; }
      else for (const r of rects) if (a.x > r.x && a.x < r.x + r.w && a.y > r.y && a.y < r.y + r.h) {
        S.stuckWorld.push({ x: a.x, y: a.y, ang: Math.atan2(a.vy, a.vx) });
        if (S.stuckWorld.length > 36) S.stuckWorld.shift();
        a.dead = true; break;
      }
    }
    S.arrows = S.arrows.filter((a) => !a.dead && a.life > 0 && a.x > -60 && a.x < W + 60);

    // juice
    for (const b of S.bows) { b.vy += G * fr * 0.8; b.x += b.vx * fr; b.y += b.vy * fr; b.rot += b.vr * fr; b.life -= dt; }
    S.bows = S.bows.filter((b) => b.life > 0);
    for (const q of S.parts) { q.vy += G * fr * 0.6; q.x += q.vx * fr; q.y += q.vy * fr; q.life -= dt; }
    S.parts = S.parts.filter((q) => q.life > 0);
    for (const t of S.texts) t.t += dt;
    S.texts = S.texts.filter((t) => t.t < 1.1);
  }

  function damageEnemy(e, a, h) {
    const dmg = a.dmg * (h.head ? 3 : 1);
    e.hp -= dmg;
    hitBody(e, a, h.qx, h.qy, h.head);
    if (e.hp <= 0 && e.body.mode !== "dead") {
      e.body.mode = "dead"; e.deadT = 0;
      dropBow(e.body, "#e8a33d");
      const earn = e.def.skulls + (h.head ? 2 : 0);
      awardSkulls(a.slot, earn);
      floatText(e.body.pts[HEAD].x, e.body.pts[HEAD].y - 14, "💀 +" + earn, "#ffd76b");
      S.streak++; if (S.streak > S.best) S.best = S.streak;
    }
  }
  function damagePlayer(p, a, h) {
    const dmg = a.dmg * (h.head ? 3 : 1) * (1 - p.armor);
    p.hp -= dmg;
    hitBody(p, a, h.qx, h.qy, h.head);
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false; p.deadT = 1.7; p.body.mode = "dead";
      dropBow(p.body, "#e8a33d");
      p.respawnKeep = p.lives > 0;
      if (p.respawnKeep) { p.lives--; floatText(p.body.pts[HEAD].x, p.body.pts[HEAD].y - 14, "LIFE USED", "#8dff8d"); }
      else endStreak();
    }
  }
  function endStreak() {
    if (S.streak > 0) { postScore(S.streak); }
    S.streak = 0;
    if (role === "host" && net) net.send({ t: "reset" });
  }
  function respawn(p) {
    const keep = p.respawnKeep;
    p.body = makeBody(p.tower.x + p.tower.w / 2, p.tower.y, 1, 1);
    p.wounds = []; p.stuck = []; p.hp = p.maxHp; p.stam = p.maxStam; p.alive = true; p.drag = null; p.respawnKeep = false;
    if (!keep && mode === "solo") { /* streak already reset */ }
  }
  function awardSkulls(slot, n) {
    if (slot === localSlot || mode === "solo" || slot < 0) { wallet += n; saveWallet(wallet); }
    else if (role === "host" && net) net.send({ t: "skull", n });
  }

  // ---------------------------------------------------------------------------
  // Player actions
  // ---------------------------------------------------------------------------
  function actionJump(p) {
    if (!p.alive) return;
    if (p.body.mode === "down") {
      if (p.stam >= 1) { p.stam = Math.max(0, p.stam - 5); reanchor(p.body, worldRects().concat(S.clusterRects)); }
    } else if (p.body.mode === "stand" && p.stam >= 5) {
      p.stam -= 5; jumpBody(p.body);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering — dark minimal: charcoal void, dust, chunky white ragdolls
  // ---------------------------------------------------------------------------
  const DUST = Array.from({ length: 64 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: rnd(0.7, 2), v: rnd(2, 7), a: rnd(0.06, 0.2) }));
  let dustT = 0;

  function draw() {
    ctx.fillStyle = "#2c2c30"; ctx.fillRect(0, 0, W, H);
    dustT += 1 / 60;
    ctx.fillStyle = "#ffffff";
    for (const d of DUST) {
      const y = (d.y + dustT * d.v) % H;
      ctx.globalAlpha = d.a; ctx.beginPath(); ctx.arc(d.x, y, d.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const V = role === "guest" && remote ? remote : hostView();

    // towers + enemy platforms
    for (let i = 0; i < V.towers; i++) drawTower(TOWERS[i]);
    if (V.cluster) drawCluster(V.cluster, V.clusterRects);

    // stuck world arrows
    for (const s of V.stuckWorld) drawArrowShape(s.x, s.y, s.ang, "#cfc4a8", 0.8);

    // tumbling bows
    for (const b of V.bows) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.globalAlpha = clamp(b.life, 0, 1); drawBowShape(0, 0, 0, 0, 1, b.col); ctx.restore(); }

    for (const e of V.enemies) drawChar(e);
    for (const p of V.players) drawChar(p);

    for (const a of V.arrows) drawArrowShape(a.x, a.y, a.ang != null ? a.ang : Math.atan2(a.vy, a.vx), a.team === "e" ? "#e0574a" : "#f4e2b8", 1);
    for (const ap of V.apples) drawApple(ap);

    ctx.globalAlpha = 1;
    for (const q of V.parts) { ctx.globalAlpha = clamp(q.life * 2, 0, 1); ctx.fillStyle = q.col; ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3); }
    ctx.globalAlpha = 1;
    for (const t of V.texts) { ctx.globalAlpha = clamp(1 - t.t, 0, 1); ctx.fillStyle = t.col; ctx.font = "bold 13px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.fillText(t.str, t.x, t.y - t.t * 26); }
    ctx.globalAlpha = 1; ctx.textAlign = "left";

    // local trajectory preview while dragging
    if (drag.active && running) drawTrajectory();

    drawHud(V);
  }

  function hostView() {
    return {
      towers: S.players.length, cluster: S.cluster, clusterRects: S.clusterRects, stuckWorld: S.stuckWorld, bows: S.bows,
      enemies: S.enemies.map((e) => charView(e, e.def.col, e.draw, e.hp / e.maxHp, e.body.mode === "dead")),
      players: S.players.map((p) => charView(p, p.slot === localSlot ? "#ececf1" : "#d9ead9", p.drag, null, !p.alive)),
      arrows: S.arrows, apples: S.apples, parts: S.parts, texts: S.texts,
      streak: S.streak, best: S.best,
      bars: S.players.map((p) => ({ slot: p.slot, hp: p.hp, maxHp: p.maxHp, st: p.stam, maxStam: p.maxStam, lives: p.lives, down: p.body.mode === "down", alive: p.alive })),
    };
  }
  function charView(c, col, pose, hpFrac, dead) {
    return { pts: c.body.pts, s: c.body.s, f: c.body.f, col, pose, hpFrac, fade: c.body.fade, wounds: c.wounds, stuck: c.stuck, dead };
  }

  function drawTower(t) {
    ctx.fillStyle = "#46464d";
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = "#515158";
    for (let y = t.y; y < H; y += 26) ctx.fillRect(t.x, y, t.w, 3);
    ctx.fillStyle = "#55555c";
    ctx.fillRect(t.x - 6, t.y, t.w + 12, 10);
  }
  function drawCluster(deco, rects) {
    for (const r of rects) {
      ctx.save();
      if (deco.kind === 1) { // diamonds — same AABB collision, drawn rotated
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#4c4c53"; const d = r.w * 0.74; ctx.fillRect(-d / 2, -d / 2, d, d);
      } else {
        ctx.fillStyle = "#4c4c53"; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = "#57575e"; ctx.fillRect(r.x, r.y, r.w, 5);
      }
      ctx.restore();
    }
  }

  function drawChar(v) {
    const P = v.pts, s = v.s;
    ctx.save();
    ctx.globalAlpha = v.fade != null ? v.fade : 1;
    ctx.lineCap = "round";
    // legs, torso, arms — chunky capsules
    limb(P[PELVIS], P[FOOTL], 10 * s, v.col); limb(P[PELVIS], P[FOOTR], 10 * s, v.col);
    limb(P[CHEST], P[PELVIS], 15 * s, v.col);
    limb(P[CHEST], P[HDRAW], 8 * s, v.col);
    // head
    ctx.fillStyle = v.col; ctx.beginPath(); ctx.arc(P[HEAD].x, P[HEAD].y, 11 * s, 0, 7); ctx.fill();
    // bow arm + bow
    limb(P[CHEST], P[HBOW], 8 * s, v.col);
    const ang = v.pose ? v.pose.ang : (v.f === 1 ? 0.35 : Math.PI - 0.35);
    const pow = v.pose ? v.pose.pow : 0;
    drawBowShape(P[HBOW].x, P[HBOW].y, ang, pow, s, "#e8a33d");
    // wounds + stuck arrows ride the body
    for (const w of v.wounds) { const p = P[w.pi]; ctx.fillStyle = "#c9302c"; ctx.beginPath(); ctx.arc(p.x + w.dx, p.y + w.dy, w.r, 0, 7); ctx.fill(); }
    for (const sa of v.stuck) { const p = P[sa.pi]; drawArrowShape(p.x + sa.dx, p.y + sa.dy, sa.ang, "#d9c9a6", 0.75); }
    // enemy hp pip
    if (v.hpFrac != null && !v.dead) {
      const hx = P[HEAD].x, hy = P[HEAD].y - 22 * s;
      ctx.fillStyle = "#00000088"; ctx.fillRect(hx - 17 * s, hy, 34 * s, 5);
      ctx.fillStyle = "#e0574a"; ctx.fillRect(hx - 16 * s, hy + 1, 32 * s * clamp(v.hpFrac, 0, 1), 3);
    }
    ctx.restore();
  }
  function limb(a, b, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

  function drawBowShape(x, y, ang, pow, s, col) {
    const perp = ang + Math.PI / 2, R = 16 * s;
    ctx.strokeStyle = col; ctx.lineWidth = 3.5 * s; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(x, y, R, perp - 1.05, perp + 1.05); ctx.stroke();
    const ax = Math.cos(ang), ay = Math.sin(ang);
    const tA = { x: x + Math.cos(perp - 1.05) * R, y: y + Math.sin(perp - 1.05) * R };
    const tB = { x: x + Math.cos(perp + 1.05) * R, y: y + Math.sin(perp + 1.05) * R };
    const nock = { x: x - ax * pow * 13 * s, y: y - ay * pow * 13 * s };
    ctx.strokeStyle = "#efefef"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(tA.x, tA.y); ctx.lineTo(nock.x, nock.y); ctx.lineTo(tB.x, tB.y); ctx.stroke();
    if (pow > 0.02) drawArrowShape(nock.x + ax * 9, nock.y + ay * 9, ang, "#f4e2b8", 1);
  }
  function drawArrowShape(x, y, ang, col, scale) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = col; ctx.lineWidth = 2.4 * scale; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-15 * scale, 0); ctx.lineTo(6 * scale, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6 * scale, 0); ctx.lineTo(1.5 * scale, -3 * scale); ctx.moveTo(6 * scale, 0); ctx.lineTo(1.5 * scale, 3 * scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-15 * scale, 0); ctx.lineTo(-18 * scale, -2.5 * scale); ctx.moveTo(-15 * scale, 0); ctx.lineTo(-18 * scale, 2.5 * scale); ctx.stroke();
    ctx.restore();
  }
  function drawApple(a) {
    const d = APPLES[a.ty];
    ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(a.x, a.y, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = "#4d6b33"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 11); ctx.lineTo(a.x + 3, a.y - 16); ctx.stroke();
    if (a.ty === "w") { ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(a.x - 13, a.y - 2, 8, 4, -0.5, 0, 7); ctx.ellipse(a.x + 13, a.y - 2, 8, 4, 0.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }

  function drawTrajectory() {
    const lp = localBars();
    if (!lp || lp.down === undefined && !lp.alive) return;
    const a = dragAim(); if (!a || a.pow < 0.06) return;
    const o = localBowOrigin();
    const spd = (9 + 17 * a.pow) * (S.players[localSlot] ? S.players[localSlot].spdMul : 1);
    let x = o.x, y = o.y, vx = Math.cos(a.ang) * spd, vy = Math.sin(a.ang) * spd;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 36; i++) {
      vy += G; x += vx; y += vy;
      if (y > FLOOR || x < 0 || x > W) break;
      if (i % 2 === 0) { ctx.globalAlpha = clamp(0.45 - i * 0.011, 0.04, 0.45); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  function localBowOrigin() {
    if (role === "guest" && remote) { const p = remote.players[localSlot]; if (p) return { x: p.pts[HBOW].x, y: p.pts[HBOW].y }; }
    const p = S.players[localSlot]; if (p) return { x: p.body.pts[HBOW].x, y: p.body.pts[HBOW].y };
    return { x: 190, y: 320 };
  }
  function localBars() {
    const V = role === "guest" && remote ? remote : null;
    if (V) return V.bars[localSlot];
    const p = S.players[localSlot];
    return p ? { hp: p.hp, maxHp: p.maxHp, st: p.stam, maxStam: p.maxStam, lives: p.lives, down: p.body.mode === "down", alive: p.alive } : null;
  }

  function drawHud(V) {
    // skulls (persistent wallet) + streak
    ctx.fillStyle = "#ffd76b"; ctx.font = "bold 17px system-ui,sans-serif"; ctx.textAlign = "left";
    ctx.fillText("💀 " + wallet, 14, 26);
    ctx.fillStyle = "#dfe3ea"; ctx.textAlign = "right"; ctx.font = "bold 15px system-ui,sans-serif";
    ctx.fillText("SCORE " + (V.streak || 0) + " / " + (V.best || 0), W - 14, 26);
    ctx.textAlign = "left";

    // per-player bars over their towers
    for (const b of V.bars) {
      const t = TOWERS[b.slot];
      const bx = t.x + 8, by = t.y + 16;
      ctx.fillStyle = "#00000099"; ctx.fillRect(bx, by, 114, 11);
      ctx.fillStyle = "#d84a41"; ctx.fillRect(bx + 1, by + 1, 112 * clamp(b.hp / b.maxHp, 0, 1), 9);
      ctx.fillStyle = "#00000099"; ctx.fillRect(bx, by + 13, 114, 8);
      ctx.fillStyle = "#4aa3d8"; ctx.fillRect(bx + 1, by + 14, 112 * clamp(b.st / b.maxStam, 0, 1), 6);
      ctx.fillStyle = "#ffffff"; ctx.font = "10px system-ui,sans-serif";
      ctx.fillText(Math.round(b.hp), bx + 3, by + 9);
      if (b.lives > 0) { ctx.fillStyle = "#8dff8d"; ctx.fillText("♥".repeat(Math.min(5, b.lives)), bx, by + 33); }
    }

    // local JUMP / STAND UP button
    const lb = localBars();
    if (lb && running) {
      const t = TOWERS[localSlot]; const r = jumpBtnRect();
      ctx.fillStyle = lb.down ? "#7a4a1f" : "#3c3c44"; roundRect(r.x, r.y, r.w, r.h, 7); ctx.fill();
      ctx.strokeStyle = "#00000055"; ctx.lineWidth = 1; roundRect(r.x, r.y, r.w, r.h, 7); ctx.stroke();
      ctx.fillStyle = lb.down ? "#ffd76b" : "#cfd3da"; ctx.font = "bold 12px system-ui,sans-serif"; ctx.textAlign = "center";
      ctx.fillText(lb.down ? "STAND UP" : "JUMP", r.x + r.w / 2, r.y + 15);
      ctx.fillStyle = "#8b93a2"; ctx.font = "9px system-ui,sans-serif";
      ctx.fillText("5 ⚡ / space", r.x + r.w / 2, r.y + 26);
      ctx.textAlign = "left";
    }

    // pause chip (solo only)
    if (running && mode === "solo") {
      ctx.fillStyle = "#ffffff33"; ctx.font = "bold 14px system-ui,sans-serif";
      ctx.fillText("❚❚", W - 30, H - 14);
    }
  }
  function jumpBtnRect() { const t = TOWERS[localSlot]; return { x: t.x + 14, y: t.y + 42, w: 86, h: 32 }; }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------------------------------------------------------------------------
  // Input — slingshot drag; release fires opposite the pull
  // ---------------------------------------------------------------------------
  const drag = { active: false, sx: 0, sy: 0, cx: 0, cy: 0 };
  let lastAimSend = 0;
  function canvasPoint(ev) {
    const r = canvas.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev.changedTouches ? ev.changedTouches[0] : ev;
    return { x: (t.clientX - r.left) / r.width * W, y: (t.clientY - r.top) / r.height * H };
  }
  function dragAim() {
    const dx = drag.sx - drag.cx, dy = drag.sy - drag.cy;
    const len = Math.hypot(dx, dy);
    if (len < 10) return null;
    return { ang: Math.atan2(dy, dx), pow: clamp(len / MAXPULL, 0, 1) };
  }

  function onDown(ev) {
    if (!running || paused) return;
    ev.preventDefault();
    const p = canvasPoint(ev);
    const jb = jumpBtnRect();
    if (p.x > jb.x && p.x < jb.x + jb.w && p.y > jb.y && p.y < jb.y + jb.h) { doJump(); return; }
    if (mode === "solo" && p.x > W - 46 && p.y > H - 34) { setPaused(true); return; }
    drag.active = true; drag.sx = drag.cx = p.x; drag.sy = drag.cy = p.y;
  }
  function onMove(ev) {
    if (!drag.active) return;
    const p = canvasPoint(ev); drag.cx = p.x; drag.cy = p.y;
    const a = dragAim();
    if (role === "guest") {
      const now = performance.now();
      if (net && now - lastAimSend > 50) { lastAimSend = now; net.send({ t: "aim", a: a ? a.ang : 0, p: a ? a.pow : 0 }); }
    } else {
      const lp = S.players[localSlot];
      if (lp && lp.alive) lp.drag = a;
    }
  }
  function onUp(ev) {
    if (!drag.active) return;
    drag.active = false;
    const a = dragAim();
    if (role === "guest") { if (net) net.send({ t: "fire", a: a ? a.ang : 0, p: a ? a.pow : 0 }); return; }
    const lp = S.players[localSlot];
    if (!lp) return;
    if (a && a.pow > 0.06 && lp.alive) fireFrom(lp, a.ang, a.pow);
    else lp.drag = null;
  }
  function doJump() {
    if (role === "guest") { net && net.send({ t: "jump" }); return; }
    const lp = S.players[localSlot]; if (lp) actionJump(lp);
  }

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove", (e) => { e.preventDefault(); onMove(e); }, { passive: false });
  canvas.addEventListener("touchend", (e) => { e.preventDefault(); onUp(e); }, { passive: false });
  window.addEventListener("keydown", (e) => { if (e.code === "Space" && running && !paused) { e.preventDefault(); doJump(); } });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = 0, netAccum = 0;
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (!paused) {
      if (role === "guest") tickGuest(dt);
      else {
        simulate(dt);
        if (role === "host" && net) { netAccum += dt; if (netAccum >= 0.05) { netAccum = 0; broadcast(); } }
      }
    }
    draw();
    requestAnimationFrame(loop);
  }
  function tickGuest(dt) {
    // local-only juice for the guest (particles/texts spawned from fx events)
    for (const q of S.parts) { q.vy += G * dt * 36; q.x += q.vx * dt * 60; q.y += q.vy * dt * 60; q.life -= dt; }
    S.parts = S.parts.filter((q) => q.life > 0);
    for (const t of S.texts) t.t += dt;
    S.texts = S.texts.filter((t) => t.t < 1.1);
  }

  // ---------------------------------------------------------------------------
  // Netcode glue (host authoritative; guest streams intent, renders snapshots)
  // ---------------------------------------------------------------------------
  const rp = (n) => Math.round(n * 10) / 10;
  function packChar(v) {
    return {
      pt: v.pts.map((q) => [Math.round(q.x), Math.round(q.y)]), s: v.s, f: v.f, col: v.col,
      dw: v.pose ? [rp(v.pose.ang), rp(v.pose.pow)] : 0, hf: v.hpFrac != null ? rp(v.hpFrac) : null,
      fa: rp(v.fade != null ? v.fade : 1), dead: v.dead ? 1 : 0,
      wo: v.wounds.slice(-10).map((w) => [w.pi, Math.round(w.dx), Math.round(w.dy), w.r]),
      sa: v.stuck.slice(-10).map((s) => [s.pi, Math.round(s.dx), Math.round(s.dy), rp(s.ang)]),
    };
  }
  function broadcast() {
    const hv = hostView();
    net.send({
      t: "state", str: hv.streak, best: hv.best, tw: hv.towers,
      cl: S.cluster ? { kind: S.cluster.kind, rects: S.clusterRects } : null,
      pl: hv.players.map(packChar), en: hv.enemies.map(packChar),
      ar: S.arrows.slice(0, 40).map((a) => [Math.round(a.x), Math.round(a.y), rp(Math.atan2(a.vy, a.vx)), a.team === "e" ? 1 : 0]),
      ap: S.apples.slice(0, 4).map((a) => [Math.round(a.x), Math.round(a.y), a.ty]),
      bw: S.bows.slice(0, 4).map((b) => [Math.round(b.x), Math.round(b.y), rp(b.rot), rp(b.life)]),
      sw: S.stuckWorld.slice(-36).map((s) => [Math.round(s.x), Math.round(s.y), rp(s.ang)]),
      br: hv.bars, fx: S.fx.splice(0, S.fx.length),
      tx: S.texts.filter((t) => t.t < 0.06).map((t) => [Math.round(t.x), Math.round(t.y), t.str, t.col]),
    });
  }
  function unpackChar(c) {
    return {
      pts: c.pt.map((q) => ({ x: q[0], y: q[1] })), s: c.s, f: c.f, col: c.col,
      pose: c.dw ? { ang: c.dw[0], pow: c.dw[1] } : null, hpFrac: c.hf, fade: c.fa, dead: !!c.dead,
      wounds: c.wo.map((w) => ({ pi: w[0], dx: w[1], dy: w[2], r: w[3] })),
      stuck: c.sa.map((s) => ({ pi: s[0], dx: s[1], dy: s[2], ang: s[3] })),
    };
  }
  function applyState(m) {
    remote = {
      towers: m.tw, cluster: m.cl ? { kind: m.cl.kind } : null, clusterRects: m.cl ? m.cl.rects : [],
      players: m.pl.map(unpackChar), enemies: m.en.map(unpackChar),
      arrows: m.ar.map((a) => ({ x: a[0], y: a[1], ang: a[2], team: a[3] ? "e" : "p" })),
      apples: m.ap.map((a) => ({ x: a[0], y: a[1], ty: a[2] })),
      bows: m.bw.map((b) => ({ x: b[0], y: b[1], rot: b[2], life: b[3], col: "#e8a33d" })),
      stuckWorld: m.sw.map((s) => ({ x: s[0], y: s[1], ang: s[2] })),
      parts: S.parts, texts: S.texts, streak: m.str, best: m.best, bars: m.br,
    };
    // local aim override so the guest's own draw feels instant
    if (drag.active) { const a = dragAim(); if (a && remote.players[localSlot]) remote.players[localSlot].pose = a; }
    for (const f of m.fx || []) blood(f[0], f[1], f[2] ? 14 : 8);
    for (const t of m.tx || []) floatText(t[0], t[1], t[2], t[3]);
  }

  function onGuestMsg(m) {
    if (!m) return;
    if (m.t === "hello") { partnerName = m.name; if (m.ups && S.players[1]) { S.players[1].ups = { ...S.players[1].ups, ...m.ups }; recompute(S.players[1]); S.players[1].hp = S.players[1].maxHp; S.players[1].stam = S.players[1].maxStam; S.players[1].lives = S.players[1].ups.life; } net.send({ t: "hello", name: me.username }); if (!running) beginCoopHost(); }
    else if (m.t === "aim") { const p = S.players[1]; if (p && p.alive) p.drag = m.p > 0.03 ? { ang: m.a, pow: m.p } : null; }
    else if (m.t === "fire") { const p = S.players[1]; if (p && p.alive && m.p > 0.06) fireFrom(p, m.a, m.p); else if (p) p.drag = null; }
    else if (m.t === "jump") { const p = S.players[1]; if (p) actionJump(p); }
    else if (m.t === "ups") { const p = S.players[1]; if (p) { p.ups = { ...p.ups, ...m.ups }; recompute(p); } }
  }
  function onHostMsg(m) {
    if (!m) return;
    if (m.t === "hello") partnerName = m.name;
    else if (m.t === "start") { if (!running) beginCoopGuest(); }
    else if (m.t === "state") { if (!running) beginCoopGuest(); applyState(m); }
    else if (m.t === "skull") { wallet += m.n; saveWallet(wallet); }
    else if (m.t === "reset") { /* streak display resets via state */ }
  }

  // ---------------------------------------------------------------------------
  // Scores (leaderboard: best streak; co-op posts the pair)
  // ---------------------------------------------------------------------------
  const SOLO_GAME = "ragdoll-siege", COOP_GAME = "ragdoll-siege-coop";
  async function api(path, opts) { return await fetch(path, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...opts }); }
  function postScore(streak) {
    if (!me || streak <= 0) return;
    const body = mode === "coop" && partnerName
      ? { game: COOP_GAME, score: streak, partner: partnerName }
      : { game: SOLO_GAME, score: streak };
    if (mode === "coop" && role !== "host") return;
    api("/api/scores", { method: "POST", body: JSON.stringify(body) }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Hub / screens
  // ---------------------------------------------------------------------------
  function showScreen(name) {
    for (const s of ["hub", "lobby", "pause"]) el(s).hidden = s !== name;
  }
  function renderHub() {
    el("hubSkulls").textContent = wallet;
    const ups = loadUps();
    const grid = el("upGrid"); grid.innerHTML = "";
    for (const u of UPGRADES) {
      const lvl = ups[u.key] || 0;
      const maxed = u.max != null && lvl >= u.max;
      const cost = upCost(u, lvl);
      const b = document.createElement("button");
      b.className = "up-btn" + (maxed || wallet < cost ? " off" : "");
      b.disabled = maxed || wallet < cost;
      b.innerHTML = "<span class='up-ic'>" + u.icon + "</span><span class='up-name'>" + u.name + (lvl ? " <em>Lv" + lvl + "</em>" : "") + "</span>" +
        "<span class='up-desc'>" + u.desc + "</span><span class='up-cost'>" + (maxed ? "MAX" : "💀 " + cost) + "</span>";
      b.onclick = () => {
        if (wallet < cost || maxed) return;
        wallet -= cost; saveWallet(wallet);
        ups[u.key] = lvl + 1; saveUps(ups);
        renderHub();
      };
      grid.appendChild(b);
    }
  }

  function resetWorld(n) {
    S.players = []; S.enemies = []; S.arrows = []; S.apples = []; S.bows = []; S.parts = []; S.texts = []; S.stuckWorld = [];
    S.cluster = null; S.clusterRects = []; S.streak = 0; S.spawnT = 0.8; S.appleT = 5; S.fx = [];
    for (let i = 0; i < n; i++) S.players.push(makePlayer(i, i === localSlot ? loadUps() : undefined));
    remote = null;
  }
  function startLoop() { running = true; paused = false; last = performance.now(); requestAnimationFrame(loop); }

  function beginSolo() {
    mode = "solo"; role = null; localSlot = 0; partnerName = null;
    resetWorld(1); S.inRun = true; startLoop(); showScreen(null);
  }
  function beginCoopHost() {
    mode = "coop"; role = "host"; localSlot = 0;
    resetWorld(2); S.inRun = true; startLoop(); showScreen(null);
    net && net.send({ t: "start" });
  }
  function beginCoopGuest() {
    mode = "coop"; role = "guest"; localSlot = 1;
    resetWorld(0); S.inRun = false; startLoop(); showScreen(null);
  }
  function setPaused(v) { paused = v; el("pause").hidden = !v; }
  function quitToHub() {
    running = false; paused = false; S.inRun = false;
    teardownNet();
    renderHub(); showScreen("hub"); idle();
  }

  // ------- co-op lobby (same flow as before) -------
  function setLobby(html, code) { el("lobbyStatus").innerHTML = html; el("lobbyCode").textContent = code || "----"; }
  function teardownNet() { if (net) { try { net.close(); } catch (_) {} net = null; } partnerName = null; role = null; }
  function doHost(code) {
    net = RagdollNet.host(code, me.username, {
      onStatus(s) {
        if (s === "waiting") setLobby("Share code <b>" + code + "</b> with your friend.<br><span class='muted'>Waiting for them to join…</span>", code);
        else if (s === "connecting") setLobby("Opening room…", code);
        else if (s === "taken") return doHost(RagdollNet.randomCode());
        else setLobby("<span class='err'>Connection error. Try again.</span>", code);
      },
      onJoin() { setLobby("Friend connected! Starting…", code); },
      onData(m) { onGuestMsg(m); },
      onLeft() { partnerName = null; },
    });
    setLobby("Opening room…", code);
  }
  function doJoin(code) {
    net = RagdollNet.join(code, me.username, {
      onStatus(s) {
        if (s === "connecting") setLobby("Connecting to <b>" + code + "</b>…", code);
        else if (s === "notfound") setLobby("<span class='err'>No room with that code.</span>", code);
        else setLobby("<span class='err'>Connection error.</span>", code);
      },
      onJoin() { net.send({ t: "hello", name: me.username, ups: loadUps() }); setLobby("Connected! Waiting for host…", code); },
      onData(m) { onHostMsg(m); },
      onLeft() { quitToHub(); },
    });
    setLobby("Connecting…", code);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function idle() { if (running) return; draw(); requestAnimationFrame(function again() { if (!running) { draw(); requestAnimationFrame(again); } }); }

  async function boot() {
    me = RagdollNet.online() ? await RagdollNet.getMe() : null;
    const coopReady = !!me;
    el("coopBtn").disabled = !coopReady;
    el("coopHint").textContent = coopReady ? "Same team, one endless duel — share a code." : "Log in on the arcade to unlock co-op + leaderboards.";
    if (!RagdollNet.online()) el("coopHint").textContent = "Co-op needs a network connection.";

    el("playBtn").onclick = beginSolo;
    el("coopBtn").onclick = () => { if (coopReady) { showScreen("lobby"); setLobby("Host a room or join a friend's code.", "----"); } };
    el("hostBtn").onclick = () => { if (me) doHost(RagdollNet.randomCode()); };
    el("joinBtn").onclick = () => { const c = RagdollNet.cleanCode(el("codeInput").value); if (c.length < 3) { el("codeInput").style.borderColor = "#ff5b5b"; return; } doJoin(c); };
    el("codeInput").addEventListener("input", () => { el("codeInput").style.borderColor = ""; el("codeInput").value = RagdollNet.cleanCode(el("codeInput").value); });
    el("lobbyBack").onclick = () => { teardownNet(); renderHub(); showScreen("hub"); };
    el("resumeBtn").onclick = () => setPaused(false);
    el("quitBtn").onclick = quitToHub;

    // idle arena behind the hub: your archer standing on the tower
    resetWorld(1); S.inRun = false;
    renderHub(); showScreen("hub");
    idle();
  }

  boot();
})();
