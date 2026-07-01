/*
 * game.js — Ragdoll Siege
 * ---------------------------------------------------------------------------
 * A side-view archery survival game. You are a ragdoll archer defending the
 * left wall; enemy archers march in from the right in ENDLESS WAVES. Hold to
 * charge your bow, aim at the cursor, release to fire a gravity-arced arrow.
 * Headshots kill instantly; body hits chip HP. Dead bodies unlock into full
 * verlet ragdolls that flop and fly from the arrow's impulse.
 *
 * Modes:
 *   - Solo: just you vs the waves.
 *   - Co-op: a friend joins with a 4-letter code, SAME TEAM. The host runs the
 *     authoritative sim; the guest streams aim/fire and renders host state.
 *
 * Networking lives in net.js (window.RagdollNet). This file owns the sim,
 * rendering, input, and the tiny message glue.
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // ---- world constants ----
  const W = 960, H = 540;
  const GROUND_Y = H - 64;
  const GRAV = 0.42;                 // px / frame^2 (frame == 1/60s)
  const P0X = 118, P1X = 214;        // fixed archer foot x positions
  const PLAYER_MAX_HP = 100;
  const WALL_X = 96;                 // enemies past this line breach & hurt you
  const AIM_MIN = 9, AIM_MAX = 25;   // arrow launch speed range (charge 0..1)
  const CHARGE_TIME = 0.85;          // seconds to full charge

  const ENEMY_TYPES = {
    grunt: { hp: 1, r: 1.0, speed: 0.55, color: "#c65b4e", fire: 2600, reach: 340, points: 10 },
    rusher:{ hp: 1, r: 0.9, speed: 1.35, color: "#d98a2b", fire: 0,    reach: WALL_X, points: 14 },
    brute: { hp: 4, r: 1.35,speed: 0.34, color: "#8a52c4", fire: 3400, reach: 300, points: 22 },
  };

  // ---- canvas ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;

  // ---- game state ----
  let mode = "solo";       // "solo" | "coop"
  let role = null;         // null | "host" | "guest"
  let running = false;
  let net = null;
  let me = null;           // { username } if logged in
  let partnerName = null;
  let localSlot = 0;       // which player index *this* client controls (host=0, guest=1)

  const state = {
    players: [],
    enemies: [],
    arrows: [],
    ragdolls: [],
    particles: [],
    wave: 0,
    waveState: "rest",     // "fight" | "rest"
    restTimer: 0,
    toSpawn: 0,
    spawnTimer: 0,
    score: 0,
    over: false,
    overWave: 0,
  };

  // guest-side snapshot of host authoritative world
  let remote = null;

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function el(id) { return document.getElementById(id); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function makePlayer(slot) {
    return { slot, x: slot === 0 ? P0X : P1X, hp: PLAYER_MAX_HP, aim: -0.5, charge: 0, charging: false, down: false, cooldown: 0, flash: 0, kills: 0 };
  }

  // ---------------------------------------------------------------------------
  // Verlet ragdoll — spawned on death, pure eye-candy physics
  // ---------------------------------------------------------------------------
  function makeRagdoll(cx, feetY, color, vx, vy, impulseX, impulseY) {
    // 7 point humanoid; pt = [x,y,px,py]
    const P = (x, y, ivx, ivy) => ({ x, y, px: x - (vx + (ivx || 0)), py: y - (vy + (ivy || 0)) });
    const pts = {
      head:  P(cx, feetY - 92, impulseX * 1.1, impulseY * 1.1),
      chest: P(cx, feetY - 68, impulseX, impulseY),
      pelvis:P(cx, feetY - 44, impulseX * 0.6, impulseY * 0.6),
      handL: P(cx - 15, feetY - 58, impulseX * 1.3, impulseY),
      handR: P(cx + 15, feetY - 58, impulseX * 1.3, impulseY),
      footL: P(cx - 9, feetY - 1, 0, 0),
      footR: P(cx + 9, feetY - 1, 0, 0),
    };
    const arr = Object.values(pts);
    const link = (a, b) => ({ a, b, len: Math.hypot(a.x - b.x, a.y - b.y) });
    const cons = [
      link(pts.head, pts.chest), link(pts.chest, pts.pelvis),
      link(pts.chest, pts.handL), link(pts.chest, pts.handR),
      link(pts.pelvis, pts.footL), link(pts.pelvis, pts.footR),
      link(pts.head, pts.pelvis), // spine stiffener
    ];
    return { pts, arr, cons, color, life: 3.2, alpha: 1 };
  }

  function stepRagdoll(r, dt) {
    const steps = 1;
    for (const p of r.arr) {
      const nx = p.x + (p.x - p.px) * 0.985 + 0;
      const ny = p.y + (p.y - p.py) * 0.985 + GRAV;
      p.px = p.x; p.py = p.y; p.x = nx; p.y = ny;
      // floor
      if (p.y > GROUND_Y) { p.y = GROUND_Y; p.py = p.y + (p.y - p.py) * 0.4; p.px = p.x - (p.x - p.px) * 0.55; }
      if (p.x < 4) { p.x = 4; p.px = p.x + (p.px - p.x) * 0.5; }
      if (p.x > W - 4) { p.x = W - 4; p.px = p.x + (p.px - p.x) * 0.5; }
    }
    for (let it = 0; it < 6; it++) {
      for (const c of r.cons) {
        const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const diff = (c.len - d) / d * 0.5;
        const ox = dx * diff, oy = dy * diff;
        c.a.x -= ox; c.a.y -= oy; c.b.x += ox; c.b.y += oy;
      }
    }
    r.life -= dt;
    r.alpha = clamp(r.life / 1.0, 0, 1);
  }

  function drawRagdoll(r) {
    const p = r.pts;
    ctx.save();
    ctx.globalAlpha = r.alpha;
    ctx.strokeStyle = r.color; ctx.lineCap = "round"; ctx.lineWidth = 7;
    ctx.beginPath();
    line(p.chest, p.pelvis); line(p.chest, p.handL); line(p.chest, p.handR);
    line(p.pelvis, p.footL); line(p.pelvis, p.footR);
    ctx.stroke();
    ctx.fillStyle = r.color;
    ctx.beginPath(); ctx.arc(p.head.x, p.head.y, 11, 0, 7); ctx.fill();
    ctx.restore();
  }
  function line(a, b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }

  // ---------------------------------------------------------------------------
  // Drawing a live posed archer (stick figure with an aimed bow)
  // ---------------------------------------------------------------------------
  function drawArcher(cx, feetY, aim, charge, color, faceRight, down, flash) {
    ctx.save();
    if (down) ctx.globalAlpha = 0.35;
    const chest = { x: cx, y: feetY - 66 };
    const head = { x: cx, y: feetY - 90 };
    const pelvis = { x: cx, y: feetY - 42 };
    ctx.strokeStyle = flash > 0 ? "#fff" : color;
    ctx.lineCap = "round"; ctx.lineWidth = 7;
    // legs
    ctx.beginPath();
    ctx.moveTo(pelvis.x, pelvis.y); ctx.lineTo(cx - 9, feetY);
    ctx.moveTo(pelvis.x, pelvis.y); ctx.lineTo(cx + 9, feetY);
    // spine
    ctx.moveTo(chest.x, chest.y); ctx.lineTo(pelvis.x, pelvis.y);
    ctx.stroke();
    // head
    ctx.fillStyle = flash > 0 ? "#fff" : color;
    ctx.beginPath(); ctx.arc(head.x, head.y, 11, 0, 7); ctx.fill();

    // bow arm points along aim
    const dir = faceRight ? 1 : -1;
    const ax = Math.cos(aim), ay = Math.sin(aim);
    const shoulder = { x: chest.x + dir * 2, y: chest.y + 4 };
    const bowDist = 26;
    const bow = { x: shoulder.x + ax * bowDist, y: shoulder.y + ay * bowDist };
    // front arm to bow
    ctx.strokeStyle = flash > 0 ? "#fff" : color; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.lineTo(bow.x, bow.y); ctx.stroke();
    // the bow (arc perpendicular to aim)
    const perp = aim + Math.PI / 2;
    ctx.strokeStyle = "#5b3b1a"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bow.x, bow.y, 15, perp - 1.1, perp + 1.1);
    ctx.stroke();
    // bowstring pulled back by charge
    const tipA = { x: bow.x + Math.cos(perp - 1.1) * 15, y: bow.y + Math.sin(perp - 1.1) * 15 };
    const tipB = { x: bow.x + Math.cos(perp + 1.1) * 15, y: bow.y + Math.sin(perp + 1.1) * 15 };
    const pull = -charge * 12;
    const nock = { x: bow.x + ax * pull, y: bow.y + ay * pull };
    ctx.strokeStyle = "#eee"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tipA.x, tipA.y); ctx.lineTo(nock.x, nock.y); ctx.lineTo(tipB.x, tipB.y); ctx.stroke();
    // nocked arrow
    if (charge > 0.02) {
      ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(nock.x, nock.y); ctx.lineTo(bow.x + ax * 16, bow.y + ay * 16); ctx.stroke();
    }
    ctx.restore();
    return bow; // launch origin
  }

  function bowOrigin(px, aim) {
    const chestY = GROUND_Y - 66;
    return { x: px + 2 + Math.cos(aim) * 26, y: chestY + 4 + Math.sin(aim) * 26 };
  }

  // ---------------------------------------------------------------------------
  // Hitboxes — head (kill) and body (damage), relative to a standing figure
  // ---------------------------------------------------------------------------
  function headHit(cx, feetY, x, y) { return Math.hypot(x - cx, y - (feetY - 90)) < 13; }
  function bodyHit(cx, feetY, x, y) { const dx = x - cx, dy = y - (feetY - 58); return Math.abs(dx) < 15 && dy > -18 && dy < 22; }

  // ---------------------------------------------------------------------------
  // Firing
  // ---------------------------------------------------------------------------
  function fireArrow(px, aim, charge, team, fromSlot) {
    const o = bowOrigin(px, aim);
    const speed = lerp(AIM_MIN, AIM_MAX, clamp(charge, 0, 1));
    state.arrows.push({
      x: o.x, y: o.y, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed,
      team, fromSlot: fromSlot == null ? -1 : fromSlot, stuck: false, life: 6, dmg: 34 + charge * 30,
    });
  }

  // enemy fires a lobbed arrow at a target player
  function enemyFire(e, target) {
    const ox = e.x, oy = GROUND_Y - 62;
    const tx = target.x, ty = GROUND_Y - 62;
    // choose an arc: solve for a launch that lands near target (approx, with noise)
    const dx = tx - ox;
    const speed = 12 + Math.min(6, Math.abs(dx) / 90);
    // aim slightly up; add inaccuracy
    let ang = Math.atan2(-3, dx < 0 ? -1 : 1) ; // baseline
    ang = Math.atan2((ty - oy) / 100 - rnd(0.8, 1.6), (dx) / 100);
    state.arrows.push({
      x: ox, y: oy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      team: "enemy", fromSlot: -1, stuck: false, life: 6, dmg: 12,
    });
  }

  // ---------------------------------------------------------------------------
  // Wave management
  // ---------------------------------------------------------------------------
  function startNextWave() {
    state.wave++;
    state.waveState = "fight";
    state.toSpawn = 3 + Math.floor(state.wave * 1.6);
    state.spawnTimer = 0;
    // revive downed players at the start of a new wave, small heal for survivors
    for (const p of state.players) {
      if (p.down) { p.down = false; p.hp = Math.round(PLAYER_MAX_HP * 0.6); }
      else p.hp = Math.min(PLAYER_MAX_HP, p.hp + 25);
    }
  }

  function spawnEnemy() {
    const w = state.wave;
    let type = "grunt";
    const roll = Math.random();
    if (w >= 3 && roll < 0.18) type = "brute";
    else if (w >= 2 && roll < 0.40) type = "rusher";
    const def = ENEMY_TYPES[type];
    const hp = def.hp + Math.floor(w / 6);
    state.enemies.push({
      type, x: W + rnd(10, 120), hp, maxHp: hp, def, color: def.color,
      speed: def.speed * rnd(0.85, 1.15) * (1 + w * 0.02),
      fireTimer: rnd(600, def.fire || 3000), stopX: def.reach + rnd(-40, 40),
      wob: rnd(0, 6.28), flash: 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Simulation (host / solo authoritative)
  // ---------------------------------------------------------------------------
  const deaths = []; // buffered kills for co-op juice sync

  function simulate(dt) {
    if (state.over) return;
    const fr = dt * 60; // frame-scaled factor

    // wave flow
    if (state.waveState === "rest") {
      state.restTimer -= dt;
      if (state.restTimer <= 0) startNextWave();
    } else {
      if (state.toSpawn > 0) {
        state.spawnTimer -= dt * 1000;
        if (state.spawnTimer <= 0) {
          spawnEnemy(); state.toSpawn--;
          state.spawnTimer = Math.max(350, 1400 - state.wave * 60);
        }
      } else if (state.enemies.length === 0) {
        // wave cleared
        state.score += 50 * state.wave;
        state.waveState = "rest"; state.restTimer = 3.2;
      }
    }

    // players: charge + cooldown + flash
    for (const p of state.players) {
      if (p.cooldown > 0) p.cooldown -= dt;
      if (p.flash > 0) p.flash -= dt;
      if (p.charging && !p.down) p.charge = clamp(p.charge + dt / CHARGE_TIME, 0, 1);
    }

    // enemies
    for (const e of state.enemies) {
      if (e.flash > 0) e.flash -= dt;
      const tgt = nearestAlivePlayer(e.x);
      if (e.x > e.stopX) {
        e.x -= e.speed * fr;
      } else if (e.def.fire > 0 && tgt) {
        e.fireTimer -= dt * 1000;
        if (e.fireTimer <= 0) { enemyFire(e, tgt); e.fireTimer = e.def.fire * rnd(0.8, 1.2); }
      }
      // breach the wall → damage nearest player and die
      if (e.x <= WALL_X) {
        if (tgt) damagePlayer(tgt, e.type === "brute" ? 34 : 20);
        killEnemy(e, e.x, GROUND_Y, -2, -3, true);
      }
    }

    // arrows
    for (const a of state.arrows) {
      if (a.stuck) { a.life -= dt; continue; }
      a.vy += GRAV * fr;
      a.x += a.vx * fr; a.y += a.vy * fr;
      a.life -= dt;
      // ground
      if (a.y >= GROUND_Y) { a.y = GROUND_Y; a.stuck = true; a.life = Math.min(a.life, 1.2); continue; }
      if (a.team === "player") {
        for (const e of state.enemies) {
          if (e.dead) continue;
          if (headHit(e.x, GROUND_Y, a.x, a.y)) { registerKill(e, a, true); a.stuck = true; a.life = 0; break; }
          if (bodyHit(e.x, GROUND_Y, a.x, a.y)) {
            e.hp -= 1; e.flash = 0.12; a.stuck = true; a.life = 0;
            spawnBlood(a.x, a.y, e.def.color);
            if (e.hp <= 0) registerKill(e, a, false);
            break;
          }
        }
      } else {
        for (const p of state.players) {
          if (p.down) continue;
          if (headHit(p.x, GROUND_Y, a.x, a.y)) { damagePlayer(p, 55); a.stuck = true; a.life = 0; break; }
          if (bodyHit(p.x, GROUND_Y, a.x, a.y)) { damagePlayer(p, a.dmg); a.stuck = true; a.life = 0; break; }
        }
      }
    }

    // ragdolls + particles
    for (const r of state.ragdolls) stepRagdoll(r, dt);
    for (const pt of state.particles) { pt.vy += GRAV * fr * 0.6; pt.x += pt.vx * fr; pt.y += pt.vy * fr; pt.life -= dt; }

    // cull
    state.arrows = state.arrows.filter((a) => a.life > 0 && a.x > -40 && a.x < W + 40);
    state.enemies = state.enemies.filter((e) => !e.dead);
    state.ragdolls = state.ragdolls.filter((r) => r.life > 0);
    state.particles = state.particles.filter((p) => p.life > 0);

    // defeat: all players down
    if (state.players.every((p) => p.down)) {
      state.over = true; state.overWave = state.wave;
      onGameOver();
    }
  }

  function nearestAlivePlayer(x) {
    let best = null, bd = 1e9;
    for (const p of state.players) { if (p.down) continue; const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  function registerKill(e, arrow, headshot) {
    const base = e.def.points + (headshot ? 8 : 0);
    state.score += base;
    if (arrow && arrow.fromSlot >= 0 && state.players[arrow.fromSlot]) state.players[arrow.fromSlot].kills++;
    killEnemy(e, arrow.x, arrow.y, arrow.vx, arrow.vy, headshot);
  }

  function killEnemy(e, hx, hy, vx, vy, headshot) {
    if (e.dead) return;
    e.dead = true;
    const imp = clamp(Math.hypot(vx, vy), 0, 30);
    const ix = Math.sign(vx || -1) * imp * 0.35, iy = -Math.abs(imp) * 0.3 - 2;
    state.ragdolls.push(makeRagdoll(e.x, GROUND_Y, e.def.color, vx * 0.25, vy * 0.25, ix, iy));
    spawnBlood(hx, hy, e.def.color, headshot ? 14 : 8);
    deaths.push({ x: e.x, y: GROUND_Y, c: e.def.color, vx: vx * 0.25, vy: vy * 0.25, ix, iy });
  }

  function damagePlayer(p, dmg) {
    if (p.down) return;
    p.hp -= dmg; p.flash = 0.14;
    if (p.hp <= 0) {
      p.hp = 0; p.down = true; p.charging = false; p.charge = 0;
      state.ragdolls.push(makeRagdoll(p.x, GROUND_Y, "#3fa9f5", 0, 0, rnd(-2, 2), -3));
    }
  }

  function spawnBlood(x, y, color, n) {
    n = n || 8;
    for (let i = 0; i < n; i++) state.particles.push({ x, y, vx: rnd(-3, 3), vy: rnd(-4, 1), life: rnd(0.3, 0.7), color });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function draw() {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1b2a4a"); g.addColorStop(0.6, "#26406b"); g.addColorStop(1, "#3a5a86");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // distant hills
    ctx.fillStyle = "#2f4a3a"; ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let x = 0; x <= W; x += 80) ctx.lineTo(x, GROUND_Y - 40 - Math.sin(x * 0.01) * 22);
    ctx.lineTo(W, GROUND_Y); ctx.closePath(); ctx.fill();
    // ground
    ctx.fillStyle = "#3d3324"; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "#4a3f2c"; ctx.fillRect(0, GROUND_Y, W, 5);
    // defensive wall
    ctx.fillStyle = "#6b6b73"; ctx.fillRect(WALL_X - 10, GROUND_Y - 74, 12, 74);
    ctx.fillStyle = "#7d7d86";
    for (let y = GROUND_Y - 74; y < GROUND_Y; y += 14) ctx.fillRect(WALL_X - 10, y, 12, 3);

    const S = renderSource();

    // particles (behind)
    for (const p of S.particles || []) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
    ctx.globalAlpha = 1;

    // ragdolls
    for (const r of S.ragdolls || []) drawRagdoll(r);

    // enemies
    for (const e of S.enemies) {
      drawArcher(e.x, GROUND_Y, Math.PI - 0.4, 0, e.flash > 0 ? "#fff" : e.color, false, false, e.flash);
      // hp pip for tanks
      if (e.maxHp > 1 && e.hp > 0) {
        ctx.fillStyle = "#000a"; ctx.fillRect(e.x - 14, GROUND_Y - 108, 28, 5);
        ctx.fillStyle = "#7ee081"; ctx.fillRect(e.x - 13, GROUND_Y - 107, 26 * (e.hp / e.maxHp), 3);
      }
    }

    // players
    for (const p of S.players) {
      const col = p.slot === localSlot ? "#4fc3ff" : "#7ee081";
      const aim = (p.slot === localSlot && !p.down) ? localAim() : p.aim;
      drawArcher(p.x, GROUND_Y, aim, p.charge, col, true, p.down, p.flash);
    }

    // arrows
    for (const a of S.arrows) {
      const ang = a.ang != null ? a.ang : Math.atan2(a.vy, a.vx);
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
      ctx.strokeStyle = a.team === "enemy" ? "#e0574a" : "#f4e2b8"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(1, -3); ctx.moveTo(6, 0); ctx.lineTo(1, 3); ctx.stroke();
      ctx.restore();
    }

    // aim trajectory preview for the local player while charging
    const lp = state.players[localSlot];
    if (lp && lp.charging && !lp.down && !state.over) drawTrajectory(lp);

    drawHud(S);
  }

  function drawTrajectory(p) {
    const aim = localAim();
    const o = bowOrigin(p.x, aim);
    const speed = lerp(AIM_MIN, AIM_MAX, p.charge);
    let x = o.x, y = o.y, vx = Math.cos(aim) * speed, vy = Math.sin(aim) * speed;
    ctx.save(); ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 40; i++) {
      vy += GRAV; x += vx; y += vy;
      if (y > GROUND_Y || x > W) break;
      if (i % 3 === 0) { ctx.globalAlpha = clamp(0.5 - i * 0.012, 0.05, 0.5); ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawHud(S) {
    // wave + score
    ctx.fillStyle = "#fff"; ctx.font = "bold 20px system-ui,sans-serif"; ctx.textAlign = "left";
    ctx.fillText("Wave " + (S.wave || 0), 16, 30);
    ctx.textAlign = "right"; ctx.fillText("Score " + (S.score || 0), W - 16, 30);
    ctx.textAlign = "left";
    // player HP bars
    let hy = 44;
    for (const p of S.players) {
      const name = p.slot === localSlot ? "You" : (partnerName || "Ally");
      ctx.fillStyle = "#000a"; ctx.fillRect(16, hy, 132, 14);
      ctx.fillStyle = p.down ? "#c0392b" : (p.slot === localSlot ? "#4fc3ff" : "#7ee081");
      ctx.fillRect(17, hy + 1, 130 * clamp(p.hp / PLAYER_MAX_HP, 0, 1), 12);
      ctx.fillStyle = "#fff"; ctx.font = "11px system-ui,sans-serif";
      ctx.fillText(p.down ? name + " — DOWN" : name, 20, hy + 11);
      hy += 20;
    }
    // rest banner
    if (S.waveState === "rest" && !S.over) {
      ctx.textAlign = "center"; ctx.fillStyle = "#ffd76b"; ctx.font = "bold 30px system-ui,sans-serif";
      const next = (S.wave || 0) + 1;
      ctx.fillText("Wave " + next + " incoming…", W / 2, H / 2 - 10);
      ctx.textAlign = "left";
    }
  }

  // guest renders host snapshot; host/solo render live sim
  function renderSource() {
    if (role === "guest" && remote) {
      return {
        players: remote.players, enemies: remote.enemies, arrows: remote.arrows,
        ragdolls: state.ragdolls, particles: state.particles,
        wave: remote.wave, score: remote.score, waveState: remote.waveState, over: remote.over,
      };
    }
    return state;
  }

  // ---------------------------------------------------------------------------
  // Input — pointer aim + hold-to-charge
  // ---------------------------------------------------------------------------
  const pointer = { x: W * 0.7, y: H * 0.4, down: false };
  function canvasPoint(ev) {
    const r = canvas.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev;
    return { x: (t.clientX - r.left) / r.width * W, y: (t.clientY - r.top) / r.height * H };
  }
  function localAim() {
    const p = (role === "guest" && remote) ? remote.players[localSlot] : state.players[localSlot];
    const px = p ? p.x : (localSlot === 0 ? P0X : P1X);
    return Math.atan2(pointer.y - (GROUND_Y - 62), pointer.x - px);
  }

  function onDown(ev) {
    if (!running || state.over) return;
    ev.preventDefault();
    const pt = canvasPoint(ev); pointer.x = pt.x; pointer.y = pt.y; pointer.down = true;
    const p = localPlayer();
    if (p && !p.down) { p.charging = true; }
  }
  function onMove(ev) {
    const pt = canvasPoint(ev); pointer.x = pt.x; pointer.y = pt.y;
    // guest streams aim
    if (role === "guest" && net) sendAim();
  }
  function onUp(ev) {
    if (!running) return;
    pointer.down = false;
    const p = localPlayer();
    if (!p || p.down || !p.charging) { if (p) p.charging = false; return; }
    const aim = localAim();
    const charge = p.charge;
    p.charging = false; p.charge = 0;
    if (p.cooldown > 0) return;
    p.cooldown = 0.18;
    if (role === "guest") {
      // guest asks host to spawn its arrow
      net && net.send({ t: "fire", a: aim, c: charge });
    } else {
      fireArrow(p.x, aim, charge, "player", p.slot);
    }
  }
  function localPlayer() {
    if (role === "guest" && remote) return remote.players[localSlot];
    return state.players[localSlot];
  }

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove", (e) => { e.preventDefault(); onMove(e); }, { passive: false });
  canvas.addEventListener("touchend", onUp);

  // For the guest, charge is local-only visual; keep it ticking here
  function tickGuestLocal(dt) {
    const p = localPlayer();
    if (!p) return;
    if (p.charging && !p.down) p.charge = clamp(p.charge + dt / CHARGE_TIME, 0, 1);
    if (p.cooldown > 0) p.cooldown -= dt;
    for (const r of state.ragdolls) stepRagdoll(r, dt);
    for (const pt of state.particles) { pt.vy += GRAV * dt * 36; pt.x += pt.vx * dt * 60; pt.y += pt.vy * dt * 60; pt.life -= dt; }
    state.ragdolls = state.ragdolls.filter((r) => r.life > 0);
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function sendAim() {
    const p = remote && remote.players[localSlot];
    if (!net || !p) return;
    net.send({ t: "aim", a: localAim(), c: p.charge || 0, d: p.charging ? 1 : 0 });
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = 0, netAccum = 0;
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (role === "guest") {
      tickGuestLocal(dt);
    } else {
      simulate(dt);
      // broadcast state to guest ~20Hz
      if (role === "host" && net) {
        netAccum += dt;
        if (netAccum >= 0.05) { netAccum = 0; broadcastState(); }
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // Networking glue
  // ---------------------------------------------------------------------------
  function broadcastState() {
    const msg = {
      t: "state",
      w: state.wave, ws: state.waveState, sc: state.score, o: state.over ? 1 : 0,
      ps: state.players.map((p) => [Math.round(p.hp), p.down ? 1 : 0, +p.aim.toFixed(2), +p.charge.toFixed(2), p.flash > 0 ? 1 : 0]),
      es: state.enemies.slice(0, 40).map((e) => [Math.round(e.x), e.type[0], e.hp, e.maxHp, e.flash > 0 ? 1 : 0]),
      as: state.arrows.slice(0, 40).map((a) => [Math.round(a.x), Math.round(a.y), +Math.atan2(a.vy, a.vx).toFixed(2), a.team === "enemy" ? 1 : 0]),
      dk: deaths.splice(0, deaths.length),
    };
    net.send(msg);
  }

  const TYPE_BY_INITIAL = { g: "grunt", r: "rusher", b: "brute" };
  function applyState(m) {
    remote = {
      wave: m.w, waveState: m.ws, score: m.sc, over: !!m.o,
      players: m.ps.map((a, i) => ({ slot: i, x: i === 0 ? P0X : P1X, hp: a[0], down: !!a[1], aim: a[2], charge: i === localSlot ? (localPlayer() ? localPlayer().charge : 0) : a[3], flash: a[4] ? 0.1 : 0 })),
      enemies: m.es.map((a) => { const def = ENEMY_TYPES[TYPE_BY_INITIAL[a[1]]]; return { x: a[0], type: TYPE_BY_INITIAL[a[1]], hp: a[2], maxHp: a[3], color: def.color, flash: a[4] ? 0.1 : 0 }; }),
      arrows: m.as.map((a) => ({ x: a[0], y: a[1], ang: a[2], team: a[3] ? "enemy" : "player" })),
    };
    // preserve local charging player object identity for input handlers
    if (remote.players[localSlot]) {
      const lp = remote.players[localSlot];
      lp.charging = _guestCharging; lp.cooldown = _guestCooldown;
    }
    if (m.dk) for (const d of m.dk) state.ragdolls.push(makeRagdoll(d.x, d.y, d.c, d.vx, d.vy, d.ix, d.iy));
    if (m.o) { state.over = true; state.overWave = m.w; }
  }
  // guest keeps its own charging flags because state is rebuilt each snapshot
  let _guestCharging = false, _guestCooldown = 0;

  // ---------------------------------------------------------------------------
  // Score submission
  // ---------------------------------------------------------------------------
  const SOLO_GAME = "ragdoll-siege";
  const COOP_GAME = "ragdoll-siege-coop";
  async function api(path, opts) {
    return await fetch(path, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...opts });
  }
  async function submitSolo(score) {
    if (!me) return;
    try { await api("/api/scores", { method: "POST", body: JSON.stringify({ game: SOLO_GAME, score }) }); } catch (_) {}
  }
  async function submitCoop(score, partner) {
    if (!me || !partner) return;
    try { await api("/api/scores", { method: "POST", body: JSON.stringify({ game: COOP_GAME, score, partner }) }); } catch (_) {}
  }

  function onGameOver() {
    const finalScore = state.score;
    if (mode === "coop") { if (role === "host") { submitCoop(finalScore, partnerName); net && net.send({ t: "over", sc: finalScore, w: state.overWave }); } }
    else submitSolo(finalScore);
    showOver(finalScore, state.overWave);
  }

  // ---------------------------------------------------------------------------
  // Screens / menu wiring
  // ---------------------------------------------------------------------------
  function show(id) { for (const s of ["menu", "lobby", "over"]) el(s).hidden = s !== id; el("hud").hidden = id !== null && id !== "playing"; }
  function showScreen(name) {
    el("menu").hidden = name !== "menu";
    el("lobby").hidden = name !== "lobby";
    el("over").hidden = name !== "over";
    canvas.style.filter = (name === "menu" || name === "over" || name === "lobby") && !running ? "blur(2px)" : "none";
  }

  function resetWorld(nPlayers) {
    state.players = []; for (let i = 0; i < nPlayers; i++) state.players.push(makePlayer(i));
    state.enemies = []; state.arrows = []; state.ragdolls = []; state.particles = [];
    state.wave = 0; state.waveState = "rest"; state.restTimer = 2.0; state.toSpawn = 0; state.score = 0;
    state.over = false; state.overWave = 0; deaths.length = 0; remote = null;
  }

  function beginSolo() {
    mode = "solo"; role = null; localSlot = 0; partnerName = null;
    resetWorld(1); startLoop();
    showScreen(null);
  }
  function beginCoopHost() {
    mode = "coop"; role = "host"; localSlot = 0;
    resetWorld(2); startLoop(); showScreen(null);
    net && net.send({ t: "start" });
  }
  function beginCoopGuest() {
    mode = "coop"; role = "guest"; localSlot = 1;
    resetWorld(2); state.players = []; // guest renders remote
    startLoop(); showScreen(null);
  }
  function startLoop() { running = true; last = performance.now(); el("hud").hidden = false; requestAnimationFrame(loop); }

  function showOver(score, wave) {
    running = false;
    el("overScore").textContent = score;
    el("overWave").textContent = wave;
    el("overMsg").textContent = mode === "coop" ? (partnerName ? "Team run with " + partnerName : "Co-op run") : "Solo run";
    el("hud").hidden = true;
    showScreen("over");
  }

  // ------- co-op lobby -------
  let currentCode = null;
  function setLobby(status, code) {
    el("lobbyStatus").innerHTML = status;
    el("lobbyCode").textContent = code || "----";
  }
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
      onLeft() { partnerName = null; if (running && role === "host") setLobby("Friend disconnected.", code); },
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
      onLeft() { if (running) { showOver(state.score, state.wave); } else setLobby("<span class='err'>Host left.</span>", code); },
    });
    setLobby("Connecting…", code);
  }

  // host receives guest messages
  function onGuestMsg(m) {
    if (!m) return;
    if (m.t === "hello") { partnerName = m.name; net.send({ t: "hello", name: me.username }); if (!running) beginCoopHost(); }
    else if (m.t === "aim") { const p = state.players[1]; if (p && !p.down) { p.aim = m.a; p.charge = m.c; p.charging = !!m.d; } }
    else if (m.t === "fire") { const p = state.players[1]; if (p && !p.down && p.cooldown <= 0) { p.cooldown = 0.18; fireArrow(p.x, m.a, m.c, "player", 1); } }
  }
  // guest receives host messages
  function onHostMsg(m) {
    if (!m) return;
    if (m.t === "hello") { partnerName = m.name; }
    else if (m.t === "start") { if (!running) beginCoopGuest(); }
    else if (m.t === "state") { if (!running) beginCoopGuest(); applyState(m); }
    else if (m.t === "over") { partnerName = partnerName; state.score = m.sc; showOver(m.sc, m.w); }
  }

  // Keep guest charging flags synced (input handlers set them on remote.players[localSlot],
  // but that object is rebuilt each snapshot — mirror into module vars).
  function syncGuestFlags() {
    const p = remote && remote.players[localSlot];
    if (p) { _guestCharging = p.charging; _guestCooldown = p.cooldown; }
  }
  setInterval(() => { if (role === "guest") syncGuestFlags(); }, 60);

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    me = RagdollNet.online() ? await RagdollNet.getMe() : null;
    const coopReady = !!me;
    el("coopBtn").disabled = !coopReady;
    el("coopHint").textContent = coopReady ? "Play the waves with a friend on the same team." : "Log in on the arcade to unlock co-op leaderboards.";
    if (!RagdollNet.online()) el("coopHint").textContent = "Co-op needs a network connection.";

    el("soloBtn").onclick = beginSolo;
    el("coopBtn").onclick = () => { if (!coopReady) return; showScreen("lobby"); setLobby("Host a room or join a friend's code.", "----"); };
    el("hostBtn").onclick = () => { if (!me) return; doHost(RagdollNet.randomCode()); };
    el("joinBtn").onclick = () => {
      const c = RagdollNet.cleanCode(el("codeInput").value);
      if (c.length < 3) { el("codeInput").style.borderColor = "#ff5b5b"; return; }
      doJoin(c);
    };
    el("codeInput").addEventListener("input", () => { el("codeInput").style.borderColor = ""; el("codeInput").value = RagdollNet.cleanCode(el("codeInput").value); });
    el("lobbyBack").onclick = () => { teardownNet(); showScreen("menu"); };
    el("againBtn").onclick = () => { teardownNet(); showScreen("menu"); };
    el("menuBtn").onclick = () => { running = false; teardownNet(); showScreen("menu"); };

    showScreen("menu");
    // idle backdrop draw
    (function idle() { if (!running) { draw(); requestAnimationFrame(idle); } })();
  }

  boot();
})();
