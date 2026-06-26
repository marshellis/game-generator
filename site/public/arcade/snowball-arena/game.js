/*
 * game.js — Snowball Arena
 * 2.5D side-view snowball brawler. Modes: Duel (1v1), Teams (2v2), Free-for-all
 * (up to 8). N-player authoritative sim with teams + bots. Online is WebRTC P2P
 * (net.js): the host runs the sim for everyone, guests send inputs & render.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------- tuning
  const STEP = 1000 / 60;
  const GRAVITY = 0.62, MOVE_ACCEL = 0.9, MAX_SPEED = 4.4;
  const GROUND_FRICTION = 0.78, AIR_FRICTION = 0.94, JUMP_V = -13.2;
  const P_W = 30, P_STAND = 58, P_DUCK = 36;
  const BALL_R = 7, BALL_GRAVITY = 0.42, THROW_MIN = 9.5, THROW_MAX = 21.5;
  const CHARGE_MS = 620, THROW_CD = 360, MAX_HP = 100;
  const BOT_HP = 65; // bots are squishier than human players — easier to freeze
  const RESPAWN_MS = 1600, INVULN_MS = 1100;

  const MODES = {
    duel: { label: "Duel", slots: 2, teams: false, arena: "small", goal: 5 },
    team: { label: "2v2", slots: 4, teams: true, arena: "medium", goal: 20 },
    ffa: { label: "Free-for-all", slots: 8, teams: false, arena: "large", goal: 10 },
  };

  const FFA_COLORS = ["#38bdf8", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#22d3ee", "#fb923c"];
  const TEAM_COLOR = ["#38bdf8", "#fb7185"]; // blue, red

  // ------------------------------------------------------------- arenas
  function buildArena(spec) {
    const { W, H } = spec, g = H - 46;
    const PAL = ["#ef4444", "#f59e0b", "#22c55e", "#a855f7", "#3b82f6", "#14b8a6", "#ec4899", "#eab308"];
    const b = [];
    b.push({ x: W / 2 - spec.central.w / 2, y: g - spec.central.h, w: spec.central.w, h: spec.central.h, c: "#3b82f6" });
    spec.pairs.forEach((p, i) => {
      b.push({ x: W / 2 - p.d - p.w / 2, y: g - p.h, w: p.w, h: p.h, c: PAL[i % PAL.length] });
      b.push({ x: W / 2 + p.d - p.w / 2, y: g - p.h, w: p.w, h: p.h, c: PAL[(i + 4) % PAL.length] });
    });
    (spec.platforms || []).forEach((pf) => {
      b.push({ x: W / 2 - pf.d - pf.w / 2, y: pf.y, w: pf.w, h: pf.h, c: "#64748b", plat: true });
      if (pf.d > 0) b.push({ x: W / 2 + pf.d - pf.w / 2, y: pf.y, w: pf.w, h: pf.h, c: "#64748b", plat: true });
    });
    return { W, H, groundY: g, bunkers: b };
  }
  const ARENAS = {
    small: buildArena({ W: 960, H: 540, central: { w: 140, h: 64 },
      pairs: [{ d: 150, w: 70, h: 90 }, { d: 300, w: 55, h: 130 }],
      platforms: [{ d: 0, w: 52, h: 150, y: 170 }] }),
    medium: buildArena({ W: 1180, H: 560, central: { w: 160, h: 66 },
      pairs: [{ d: 170, w: 75, h: 95 }, { d: 340, w: 60, h: 140 }, { d: 500, w: 70, h: 90 }],
      platforms: [{ d: 0, w: 54, h: 150, y: 150 }, { d: 250, w: 90, h: 22, y: 300 }] }),
    large: buildArena({ W: 1520, H: 660, central: { w: 180, h: 70 },
      pairs: [{ d: 180, w: 80, h: 100 }, { d: 360, w: 65, h: 150 }, { d: 540, w: 75, h: 95 }, { d: 700, w: 60, h: 130 }],
      platforms: [{ d: 0, w: 56, h: 160, y: 160 }, { d: 300, w: 100, h: 22, y: 330 }, { d: 560, w: 90, h: 22, y: 280 }] }),
  };

  // ------------------------------------------------------------- elements
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const els = {
    overlay: document.getElementById("overlay"),
    card: document.getElementById("card"),
    youDot: document.getElementById("youDot"),
    youName: document.getElementById("youName"),
    youHealth: document.getElementById("youHealth"),
    objective: document.getElementById("objective"),
    score: document.getElementById("score"),
    scoreboard: document.getElementById("scoreboard"),
    roundMsg: document.getElementById("roundMsg"),
    aimMeter: document.getElementById("aimMeter"),
    conn: document.getElementById("conn"),
    modeTag: document.getElementById("modeTag"),
    touch: document.getElementById("touch"),
  };

  // ------------------------------------------------------------- state
  let A = ARENAS.small;
  let modeKey = "duel";
  let players = [], balls = [], splats = [], flakes = [], frags = [], teamScore = [0, 0];
  let running = false, online = false, role = null, conn = null;
  let myIndex = 0, myName = "You", myTeam = 0;
  let selMode = "duel";
  let remoteInputs = {};   // host: slot -> latest input
  let pendingEvents = [];  // host: events to ship in the next snapshot
  let lobbyHumans = {};    // host: slot -> { name, team, connId }
  let connSlot = {};       // host: connId -> slot
  let awaiting = false, lastCode = "", lobbyHTML = "";
  let acc = 0, lastT = 0;
  let mouse = { x: 600, y: 250, down: false };
  const keys = {};
  let touchInput = { left: false, right: false, jump: false, duck: false, throw: false };
  const cam = { scale: 1, left: 0 };

  // ------------------------------------------------------------- helpers
  function shade(hex, f) {
    f = f || 0.6;
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), bl = Math.round((n & 255) * f);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function colorFor(slot, team) {
    if (MODES[modeKey].teams) return TEAM_COLOR[team];
    if (modeKey === "ffa") return FFA_COLORS[slot % FFA_COLORS.length];
    return slot === 0 ? "#38bdf8" : "#f472b6";
  }
  function pname(slot) { return (players[slot] && players[slot].name) || "?"; }

  function makePlayer(slot, name, team, isBot, spawnX, color) {
    const facing = spawnX < A.W / 2 ? 1 : -1;
    const maxHp = isBot ? BOT_HP : MAX_HP;
    return {
      i: slot, name, team, isBot, color, dark: shade(color), maxHp,
      x: spawnX, y: A.groundY - P_STAND, vx: 0, vy: 0, w: P_W, h: P_STAND, spawnX,
      onGround: false, facing, duck: false, hp: maxHp, alive: true,
      charge: 0, prevThrow: false, cd: 0, invuln: 0, respawn: 0,
      aim: facing > 0 ? 0 : Math.PI, flash: 0, _lastX: null, _wander: 0, _wdir: 0, _chargeWant: 0,
    };
  }

  function spawnXFor(slot, team, total, withinTeam) {
    if (modeKey === "ffa") return 50 + (A.W - 100) * (slot / (total - 1));
    if (modeKey === "team") return team === 0 ? 55 + withinTeam * 80 : A.W - 85 - P_W - withinTeam * 80;
    return slot === 0 ? 70 : A.W - 70 - P_W;
  }

  // roster: [{ name, team, isBot }] indexed by slot
  function buildRoster(mode, humans) {
    const M = MODES[mode], total = M.slots, roster = new Array(total).fill(null);
    Object.keys(humans).forEach((s) => { roster[+s] = { name: humans[s].name, team: humans[s].team | 0, isBot: false }; });
    let bn = 1;
    for (let s = 0; s < total; s++) if (!roster[s]) roster[s] = { name: "Bot " + bn++, team: 0, isBot: true };
    if (M.teams) {
      const cap = total / 2, count = [0, 0];
      for (let s = 0; s < total; s++) if (!roster[s].isBot) {
        let t = roster[s].team ? 1 : 0;
        if (count[t] >= cap) t = 1 - t;
        roster[s].team = t; count[t]++;
      }
      for (let s = 0; s < total; s++) if (roster[s].isBot) {
        const t = count[0] < cap ? 0 : 1; roster[s].team = t; count[t]++;
      }
    } else {
      roster.forEach((r, s) => { r.team = s; }); // duel/ffa: each its own "team" (no friendly fire grouping)
    }
    return roster;
  }

  function spawnPlayers(roster) {
    const total = roster.length, ti = [0, 0];
    players = roster.map((r, slot) => {
      const wt = MODES[modeKey].teams ? ti[r.team]++ : 0;
      const sx = spawnXFor(slot, r.team, total, wt);
      return makePlayer(slot, r.name, r.team, r.isBot, sx, colorFor(slot, r.team));
    });
    frags = new Array(total).fill(0);
    teamScore = [0, 0];
  }

  function respawn(p) {
    p.x = p.spawnX; p.y = A.groundY - P_STAND; p.vx = 0; p.vy = 0;
    p.hp = p.maxHp || MAX_HP; p.alive = true; p.duck = false; p.h = P_STAND;
    p.charge = 0; p.cd = 0; p.invuln = INVULN_MS; p.respawn = 0;
  }

  function nearestEnemy(p) {
    let best = null, bd = 1e9;
    for (const q of players) {
      if (!q || !q.alive || q.team === p.team) continue;
      const d = Math.abs(q.x - p.x); if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  // ------------------------------------------------------------- inputs
  function localInput() {
    const me = players[myIndex];
    const left = keys["a"] || keys["arrowleft"] || touchInput.left;
    const right = keys["d"] || keys["arrowright"] || touchInput.right;
    const jump = keys["w"] || keys[" "] || keys["arrowup"] || touchInput.jump;
    const duck = keys["s"] || keys["arrowdown"] || touchInput.duck;
    let aim = me ? me.aim : 0;
    if (me) { const hand = handPos(me); aim = Math.atan2(mouse.y - hand.y, mouse.x - hand.x); }
    return { left, right, jump, duck, aim, throwHeld: mouse.down || touchInput.throw };
  }
  function remoteAsInput(r) {
    r = r || {};
    return { left: !!r.left, right: !!r.right, jump: !!r.jump, duck: !!r.duck,
      aim: typeof r.aimAngle === "number" ? r.aimAngle : Math.PI, throwHeld: !!r.throw };
  }

  function applyInput(p, inp) {
    if (!p.alive) return;
    if (inp.left) p.vx -= MOVE_ACCEL;
    if (inp.right) p.vx += MOVE_ACCEL;
    p.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vx));
    p.duck = !!inp.duck && p.onGround;
    const targetH = p.duck ? P_DUCK : P_STAND;
    if (targetH !== p.h) { p.y += p.h - targetH; p.h = targetH; }
    if (inp.jump && p.onGround && !p.duck) { p.vy = JUMP_V; p.onGround = false; }
    p.aim = inp.aim;
    p.facing = Math.cos(inp.aim) >= 0 ? 1 : -1;
    p.cd = Math.max(0, p.cd - STEP);
    if (inp.throwHeld && p.cd <= 0) p.charge = Math.min(1, p.charge + STEP / CHARGE_MS);
    const released = p.prevThrow && !inp.throwHeld;
    if (released && p.cd <= 0 && p.charge > 0.04) { throwBall(p); p.charge = 0; p.cd = THROW_CD; }
    if (!inp.throwHeld && !released) p.charge = 0;
    p.prevThrow = inp.throwHeld;
  }

  function handPos(p) { return { x: p.x + p.w / 2 + p.facing * 10, y: p.y + (p.duck ? 12 : 18) }; }

  function throwBall(p) {
    const speed = THROW_MIN + p.charge * (THROW_MAX - THROW_MIN);
    const hand = handPos(p);
    balls.push({
      x: hand.x + Math.cos(p.aim) * 14, y: hand.y + Math.sin(p.aim) * 14,
      vx: Math.cos(p.aim) * speed + p.vx * 0.3, vy: Math.sin(p.aim) * speed,
      owner: p.i, team: p.team, life: 4000,
    });
  }

  // ------------------------------------------------------------- physics
  function stepPlayer(p) {
    if (!p.alive) { p.respawn -= STEP; if (p.respawn <= 0) respawn(p); return; }
    p.invuln = Math.max(0, p.invuln - STEP);
    p.flash = Math.max(0, p.flash - STEP);
    p.vy += GRAVITY;
    p.vx *= p.onGround ? GROUND_FRICTION : AIR_FRICTION;
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    p.x += p.vx;
    for (const b of A.bunkers) if (aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
      if (p.vx > 0) p.x = b.x - p.w; else if (p.vx < 0) p.x = b.x + b.w; p.vx = 0;
    }
    p.x = Math.max(0, Math.min(A.W - p.w, p.x));

    p.onGround = false;
    p.y += p.vy;
    for (const b of A.bunkers) if (aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
      if (p.vy > 0) { p.y = b.y - p.h; p.onGround = true; } else if (p.vy < 0) p.y = b.y + b.h; p.vy = 0;
    }
    if (p.y + p.h >= A.groundY) { p.y = A.groundY - p.h; p.vy = 0; p.onGround = true; }
  }

  function stepBall(b) {
    b.vy += BALL_GRAVITY; b.x += b.vx; b.y += b.vy; b.life -= STEP;
    if (b.x < -20 || b.x > A.W + 20 || b.life <= 0) return false;
    if (b.y + BALL_R >= A.groundY) { addSplat(b.x, A.groundY, "#e2e8f0"); return false; }
    for (const bk of A.bunkers) if (circleRect(b.x, b.y, BALL_R, bk.x, bk.y, bk.w, bk.h)) { addSplat(b.x, b.y, "#e2e8f0"); return false; }
    for (const p of players) {
      if (!p || !p.alive || p.invuln > 0 || p.team === b.team) continue;
      if (circleRect(b.x, b.y, BALL_R, p.x, p.y, p.w, p.h)) {
        const speed = Math.hypot(b.vx, b.vy);
        let dmg = Math.round(6 + speed * 0.78);
        if (p.duck) dmg = Math.round(dmg * 0.65);
        hitPlayer(p, dmg, b.owner);
        addSplat(b.x, b.y, p.color);
        return false;
      }
    }
    return true;
  }

  function hitPlayer(p, dmg, attacker) {
    p.hp -= dmg; p.flash = 140;
    p.vx += (p.x < A.W / 2 ? -1 : 1) * 0.4;
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false; p.respawn = RESPAWN_MS;
      frags[attacker] = (frags[attacker] || 0) + 1;
      const at = players[attacker] ? players[attacker].team : 0;
      if (MODES[modeKey].teams) teamScore[at] = (teamScore[at] || 0) + 1;
      onKill(attacker, p.i);
    }
    updateHud();
  }

  // ------------------------------------------------------------- match events
  function onKill(attacker, victim) {
    updateHud();
    if (role === "host") pendingEvents.push({ kind: "kill", attacker, victim });
    const M = MODES[modeKey];
    const winnerTeam = players[attacker] ? players[attacker].team : 0;
    const reached = M.teams ? teamScore[winnerTeam] >= M.goal : (frags[attacker] || 0) >= M.goal;
    if (reached) {
      if (role === "host") { pendingEvents.push({ kind: "win", attacker, team: M.teams ? winnerTeam : null }); sendState(); }
      endMatch(M.teams ? winnerTeam === myTeam : attacker === myIndex);
      return;
    }
    if (attacker === myIndex) flashRound(`❄️ You froze ${pname(victim)}!`, players[myIndex] ? players[myIndex].color : "#38bdf8");
    else if (victim === myIndex) flashRound(`${pname(attacker)} froze you!`, "#fb7185");
    else flashRound(`${pname(attacker)} froze ${pname(victim)}`, "#94a3b8");
  }

  function flashRound(text, color) {
    els.roundMsg.textContent = text;
    els.roundMsg.style.color = color || "#fff";
    els.roundMsg.hidden = false;
    clearTimeout(flashRound._t);
    flashRound._t = setTimeout(() => { els.roundMsg.hidden = true; }, 1100);
  }

  function endMatch(youWon, customMsg) {
    running = false;
    els.roundMsg.hidden = true;
    if (online) submitScore(frags[myIndex] || 0);
    const title = customMsg ? "Match over" : (youWon ? "🏆 Victory!" : "💧 Defeated");
    const sub = customMsg || scoreLine();
    const stay = online ? (role === "host" ? "Rematch" : "Wait for host") : "Play again";
    els.card.innerHTML =
      `<h1>${title}</h1><p class="tagline">${sub}</p>` +
      (online && customMsg ? "" : `<button id="againBtn" class="btn">${stay}</button>`) +
      `<button id="menuBtn" class="btn ghost">Back to menu</button>`;
    els.overlay.hidden = false;
    const again = document.getElementById("againBtn");
    if (again) again.addEventListener("click", () => {
      if (!online) startOffline(selMode);
      else if (role === "host") hostStart();
      else { els.card.innerHTML = `<h1>Waiting…</h1><p class="tagline">Waiting for the host to start a rematch.</p>` +
        `<button id="menuBtn" class="btn ghost">Back to menu</button>`;
        document.getElementById("menuBtn").addEventListener("click", () => { teardownOnline(); showLobby(""); }); }
    });
    const menu = document.getElementById("menuBtn");
    if (menu) menu.addEventListener("click", () => { teardownOnline(); showLobby(""); });
  }

  function scoreLine() {
    if (MODES[modeKey].teams) return `Blue ${teamScore[0]} – Red ${teamScore[1]}`;
    return `You froze ${frags[myIndex] || 0}`;
  }

  // ------------------------------------------------------------- bot AI
  function botThink(bot) {
    const inp = { left: false, right: false, jump: false, duck: false, aim: bot.aim, throwHeld: false };
    if (!bot.alive) return inp;
    const target = nearestEnemy(bot);
    if (!target) return inp;

    const dx = target.x - bot.x, dist = Math.abs(dx), dir = dx > 0 ? 1 : -1;
    if (dist > 360) { dir > 0 ? (inp.right = true) : (inp.left = true); }
    else if (dist < 170) { dir > 0 ? (inp.left = true) : (inp.right = true); }
    else if ((bot._wander -= STEP) <= 0) { bot._wander = 500 + Math.random() * 700; bot._wdir = Math.random() < 0.5 ? -1 : 1; }
    if (bot._wander > 0 && bot._wdir) { bot._wdir > 0 ? (inp.right = true) : (inp.left = true); }

    const wantsMove = inp.left || inp.right;
    if (wantsMove && bot.onGround && Math.abs(bot.x - (bot._lastX == null ? bot.x : bot._lastX)) < 0.4) inp.jump = true;
    bot._lastX = bot.x;

    for (const b of balls) {
      if (b.team === bot.team) continue;
      if (Math.abs(b.x - bot.x) < 90 && Math.sign(b.vx) === -dir) {
        if (bot.onGround && Math.random() < 0.06) inp.jump = true;
        if (Math.random() < 0.04) inp.duck = true;
      }
    }

    const sol = solveAim(bot, target);
    inp.aim = sol.angle + (Math.random() - 0.5) * 0.06;
    if (!bot._chargeWant) bot._chargeWant = sol.charge;
    if (bot.cd <= 0) {
      if (bot.charge < bot._chargeWant) inp.throwHeld = true;
      else { inp.throwHeld = false; bot._chargeWant = 0.45 + Math.random() * 0.5; }
    }
    return inp;
  }
  function solveAim(from, to) {
    const hand = handPos(from);
    const tx = to.x + to.w / 2, ty = to.y + to.h * 0.35;
    const dx = tx - hand.x, dy = ty - hand.y, dist = Math.hypot(dx, dy);
    const charge = Math.max(0.4, Math.min(1, dist / 520));
    return { angle: Math.atan2(dy - dist * 0.32, dx), charge };
  }

  // ------------------------------------------------------------- simulation
  function simulate() {
    if (online && role === "guest") return; // guest renders host snapshots
    for (const p of players) {
      let inp;
      if (p.i === myIndex && (!online || role === "host")) inp = localInput();
      else if (!p.isBot) inp = remoteAsInput(remoteInputs[p.i]);
      else inp = botThink(p);
      applyInput(p, inp);
    }
    for (const p of players) stepPlayer(p);
    balls = balls.filter(stepBall);
  }

  // ------------------------------------------------------------- collisions
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw)), ny = Math.max(ry, Math.min(cy, ry + rh));
    return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
  }

  // ------------------------------------------------------------- fx
  function addSplat(x, y, c) { splats.push({ x, y, r: 3 + Math.random() * 4, color: c, life: 1300 }); if (splats.length > 80) splats.shift(); }
  function initFlakes() {
    flakes = [];
    for (let i = 0; i < 70; i++) flakes.push({ x: Math.random() * A.W, y: Math.random() * A.H, r: 1 + Math.random() * 2, s: 0.3 + Math.random() * 0.8 });
  }

  // ------------------------------------------------------------- camera + render
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    // Fit the arena height, but don't zoom in so far we see less than a usable
    // slice of width (matters on tall/narrow phones) — zoom out + letterbox then.
    let scale = ch / A.H;
    const minViewW = Math.min(A.W, 720);
    if (cw / scale < minViewW) scale = cw / minViewW;
    const viewW = cw / scale;
    const oy = Math.max(0, (ch - A.H * scale) / 2);   // vertical letterbox when zoomed out
    const me = players[myIndex];
    const focus = me ? me.x + me.w / 2 : A.W / 2;
    const camLeft = viewW >= A.W ? (A.W - viewW) / 2 : Math.max(0, Math.min(A.W - viewW, focus - viewW / 2));
    cam.scale = scale; cam.left = camLeft; cam.oy = oy;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -camLeft * scale * dpr, oy * dpr);
  }
  function screenToWorld(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return { x: cam.left + (cx - r.left) / cam.scale, y: (cy - r.top - cam.oy) / cam.scale };
  }

  function render() {
    const g = ctx.createLinearGradient(0, 0, 0, A.H);
    g.addColorStop(0, "#1e3a5f"); g.addColorStop(1, "#0f213a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, A.W, A.H);

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (const f of flakes) {
      f.y += f.s; f.x += Math.sin((f.y + f.x) * 0.01) * 0.3;
      if (f.y > A.H) { f.y = -4; f.x = Math.random() * A.W; }
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#dbeafe"; ctx.fillRect(0, A.groundY, A.W, A.H - A.groundY);
    ctx.fillStyle = "#bfdbfe"; ctx.fillRect(0, A.groundY, A.W, 6);

    for (const b of A.bunkers) drawBunker(b);

    for (const s of splats) { s.life -= STEP; ctx.globalAlpha = Math.max(0, s.life / 1300); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; splats = splats.filter((s) => s.life > 0);

    const me = players[myIndex];
    if (me && me.alive && running && (mouse.down || touchInput.throw)) drawTrajectory(me);
    for (const p of players) if (p) drawPlayer(p);
    for (const b of balls) drawBall(b);

    els.aimMeter.style.width = me ? Math.round(me.charge * 100) + "%" : "0%";
    if (me) els.youHealth.style.width = Math.max(0, me.hp) + "%";
  }

  function drawBunker(b) {
    ctx.fillStyle = b.c; roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)"; roundRect(b.x + 6, b.y + 6, b.w * 0.4, b.h - 12, 8); ctx.fill();
    if (!b.plat) { ctx.fillStyle = "rgba(255,255,255,0.85)"; roundRect(b.x + 2, b.y - 3, b.w - 4, 8, 4); ctx.fill(); }
  }
  function drawPlayer(p) {
    const cx = p.x + p.w / 2;
    if (!p.alive) { drawFrozen(p); return; }
    const flash = p.flash > 0 && Math.floor(p.flash / 40) % 2 === 0;
    ctx.globalAlpha = p.invuln > 0 && Math.floor(p.invuln / 90) % 2 === 0 ? 0.5 : 1;
    ctx.fillStyle = flash ? "#fff" : p.color; roundRect(p.x + 4, p.y + 14, p.w - 8, p.h - 14, 7); ctx.fill();
    ctx.fillStyle = flash ? "#fff" : "#fde68a"; ctx.beginPath(); ctx.arc(cx, p.y + 10, 11, 0, 7); ctx.fill();
    ctx.fillStyle = p.dark; ctx.beginPath(); ctx.arc(cx, p.y + 7, 11, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, p.y - 2, 3, 0, 7); ctx.fill();
    const hand = handPos(p);
    ctx.strokeStyle = p.dark; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx, p.y + 24); ctx.lineTo(hand.x + Math.cos(p.aim) * 10, hand.y + Math.sin(p.aim) * 10); ctx.stroke();
    if (p.charge > 0.04) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hand.x + Math.cos(p.aim) * 12, hand.y + Math.sin(p.aim) * 12, BALL_R, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.i === myIndex ? "#fff" : "rgba(255,255,255,0.8)";
    ctx.font = (p.i === myIndex ? "700 " : "600 ") + "12px system-ui"; ctx.textAlign = "center";
    ctx.fillText(p.name, cx, p.y - 12);
  }
  function drawFrozen(p) {
    ctx.globalAlpha = 0.85; ctx.fillStyle = "rgba(186,230,253,0.7)"; roundRect(p.x, p.y, p.w, P_STAND, 8); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "18px system-ui"; ctx.textAlign = "center"; ctx.fillText("🥶", p.x + p.w / 2, p.y + 36);
    ctx.globalAlpha = 1;
  }
  function drawBall(b) {
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(b.x, A.groundY - 2, BALL_R, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(186,230,253,0.9)"; ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, BALL_R * 0.5, 0, 7); ctx.fill();
  }
  function drawTrajectory(p) {
    let x = handPos(p).x + Math.cos(p.aim) * 14, y = handPos(p).y + Math.sin(p.aim) * 14;
    const speed = THROW_MIN + p.charge * (THROW_MAX - THROW_MIN);
    let vx = Math.cos(p.aim) * speed, vy = Math.sin(p.aim) * speed;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 45; i++) { vy += BALL_GRAVITY; x += vx; y += vy; if (y >= A.groundY || x < 0 || x > A.W) break; if (i % 3 === 0) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); } }
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ------------------------------------------------------------- HUD
  function setupHud() {
    const me = players[myIndex];
    els.youDot.style.background = me ? me.color : "#38bdf8";
    els.youName.textContent = me ? me.name : myName;
    els.objective.textContent = MODES[modeKey].teams ? `First team to ${MODES[modeKey].goal}` :
      modeKey === "ffa" ? `Free-for-all · first to ${MODES[modeKey].goal}` : `First to ${MODES[modeKey].goal}`;
    els.modeTag.textContent = MODES[modeKey].label + (online ? " · " + lastCode : "");
    updateHud();
  }
  function updateHud() {
    const me = players[myIndex];
    if (me) els.youHealth.style.width = Math.max(0, me.hp) + "%";
    if (MODES[modeKey].teams) els.score.innerHTML = `<span style="color:${TEAM_COLOR[0]}">${teamScore[0]}</span>&nbsp;–&nbsp;<span style="color:${TEAM_COLOR[1]}">${teamScore[1]}</span>`;
    else if (modeKey === "ffa") els.score.textContent = `${frags[myIndex] || 0} / ${MODES.ffa.goal}`;
    else els.score.innerHTML = `${frags[0] || 0}&nbsp;–&nbsp;${frags[1] || 0}`;
    // scoreboard chips (skip for plain duel — the centre score covers it)
    if (modeKey === "duel" || !players.length) { els.scoreboard.innerHTML = ""; return; }
    const order = players.filter(Boolean).slice().sort((a, b) => (frags[b.i] || 0) - (frags[a.i] || 0));
    els.scoreboard.innerHTML = order.map((p) =>
      `<span class="pchip${p.i === myIndex ? " me" : ""}${p.alive ? "" : " dead"}">` +
      `<span class="pdot" style="background:${p.color}"></span>` +
      `<span class="pname">${escapeHtml(p.name)}</span>` +
      `<span class="pfrag">${frags[p.i] || 0}</span></span>`).join("");
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function setConn(s) { els.conn.className = "conn " + (s === "live" ? "live" : s === "connecting" || s === "waiting" ? "connecting" : ""); els.conn.textContent = online ? s : "offline"; }

  // ------------------------------------------------------------- loop
  function frame(t) {
    if (!lastT) lastT = t;
    let dt = t - lastT; lastT = t;
    if (dt > 100) dt = 100;
    acc += dt;
    while (acc >= STEP) { if (running) simulate(); acc -= STEP; }
    fit(); render();
    requestAnimationFrame(frame);
  }

  async function submitScore(n) {
    try { await fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ game: "snowball-arena", score: n }) }); } catch (_) {}
  }

  // ------------------------------------------------------------- net snapshots
  function sendState() {
    if (!conn || role !== "host") return;
    const sp = players.filter(Boolean).map((p) => ({ id: p.i, name: p.name, team: p.team, x: Math.round(p.x), y: Math.round(p.y), vx: p.vx, vy: p.vy, h: p.h, hp: p.hp, facing: p.facing, duck: p.duck, alive: p.alive, aim: p.aim, charge: p.charge }));
    const sb = balls.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), vx: b.vx, vy: b.vy, owner: b.owner, team: b.team }));
    const ev = pendingEvents; pendingEvents = [];
    conn.broadcast({ t: "state", players: sp, balls: sb, frags: frags.slice(), teamScore: teamScore.slice(), events: ev });
  }
  function applySnapshot(msg) {
    if (Array.isArray(msg.players)) {
      const arr = [];
      msg.players.forEach((s) => {
        const p = makePlayer(s.id, s.name || "?", s.team, false, s.x, colorFor(s.id, s.team));
        Object.assign(p, s, { i: s.id, color: colorFor(s.id, s.team), dark: shade(colorFor(s.id, s.team)) });
        arr[s.id] = p;
      });
      players = arr;
    }
    if (Array.isArray(msg.balls)) balls = msg.balls;
    if (msg.frags) frags = msg.frags;
    if (msg.teamScore) teamScore = msg.teamScore;
    updateHud();
    (msg.events || []).forEach((e) => {
      if (e.kind === "kill") {
        if (e.attacker === myIndex) flashRound(`❄️ You froze ${pname(e.victim)}!`, players[myIndex] ? players[myIndex].color : "#38bdf8");
        else if (e.victim === myIndex) flashRound(`${pname(e.attacker)} froze you!`, "#fb7185");
      } else if (e.kind === "win") {
        endMatch(e.team != null ? e.team === myTeam : e.attacker === myIndex);
      }
    });
  }

  // ------------------------------------------------------------- match start
  function startMatch(roster) {
    spawnPlayers(roster);
    balls = []; splats = []; remoteInputs = {};
    awaiting = false; running = true;
    initFlakes(); setupHud();
    els.overlay.hidden = true;
  }

  function startOffline(mode) {
    teardownOnline();
    modeKey = mode; selMode = mode; online = false; role = null; myIndex = 0;
    A = ARENAS[MODES[mode].arena];
    setConn("offline");
    const roster = buildRoster(mode, { 0: { name: myName, team: myTeam } });
    myTeam = roster[0].team;
    startMatch(roster);
  }

  // ------------------------------------------------------------- online
  function joinOnline(mode) {
    const code = window.SnowNet.cleanCode(els.codeInput.value);
    if (!code) { els.onlineHint.textContent = "Enter a code (or hit 🎲) to play online — leave blank for bots."; return; }
    teardownOnline();
    modeKey = mode; selMode = mode; online = true; role = null;
    A = ARENAS[MODES[mode].arena];
    lastCode = code; awaiting = true; running = false;
    lobbyHumans = {}; connSlot = {}; remoteInputs = {}; pendingEvents = [];
    players = []; balls = [];
    showWaiting(code, "Connecting…");

    conn = window.SnowNet.connect(code, myName, {
      onStatus: setConn,
      onRole: (r) => {
        role = r;
        if (r === "host") { myIndex = 0; renderHostRoom(); }
        else { myIndex = 1; showWaiting(code, "Joining the host…"); }
      },
      onPeerJoin: (id) => { if (role === "guest") conn.send({ t: "join", name: myName, team: myTeam }); },
      onPeerLeft: (id) => {
        if (role === "host") {
          const slot = slotOfConn(id);
          if (slot != null) {
            delete connSlot[id]; delete lobbyHumans[slot];
            if (running && players[slot]) players[slot].isBot = true; // bot takes over
            else renderHostRoom();
          }
        } else if (running) { running = false; endMatch(null, "The host left — match ended."); }
        else { showLobby("The host closed the arena."); }
      },
      onData: (msg, id) => {
        if (role === "host") {
          if (msg.t === "join") {
            let slot = connSlot[id];
            if (slot == null) { slot = nextFreeSlot(); if (slot == null) { conn.sendTo(id, { t: "full" }); return; } connSlot[id] = slot; }
            lobbyHumans[slot] = { name: String(msg.name || "Player").slice(0, 14), team: msg.team | 0, connId: id };
            conn.sendTo(id, { t: "welcome", id: slot, mode: modeKey });
            if (!running) renderHostRoom();
          } else if (msg.t === "input") {
            const slot = slotOfConn(id); if (slot != null) remoteInputs[slot] = msg.input || {};
          }
        } else {
          if (msg.t === "welcome") { myIndex = msg.id; modeKey = msg.mode; selMode = msg.mode; A = ARENAS[MODES[modeKey].arena]; showWaiting(lastCode, "Waiting for the host to start…"); }
          else if (msg.t === "start") { myTeam = (msg.roster[myIndex] || {}).team || 0; modeKey = msg.mode; A = ARENAS[MODES[modeKey].arena]; startMatch(msg.roster); }
          else if (msg.t === "state") applySnapshot(msg);
          else if (msg.t === "full") showLobby("That arena is full — try another code.");
        }
      },
    });
  }

  function slotOfConn(id) { return connSlot[id] != null ? connSlot[id] : null; }
  function nextFreeSlot() {
    const total = MODES[modeKey].slots;
    const used = new Set(Object.values(connSlot));
    for (let s = 1; s < total; s++) if (!used.has(s)) return s;
    return null;
  }

  function hostStart() {
    const humans = { 0: { name: myName, team: myTeam } };
    Object.keys(lobbyHumans).forEach((s) => { humans[s] = { name: lobbyHumans[s].name, team: lobbyHumans[s].team }; });
    const roster = buildRoster(modeKey, humans);
    myTeam = roster[0].team;
    conn.broadcast({ t: "start", roster, mode: modeKey });
    startMatch(roster);
  }

  // ------------------------------------------------------------- lobby screens
  function showWaiting(code, msg) {
    const link = location.origin + location.pathname + "?code=" + code;
    els.card.innerHTML =
      `<h1>Arena <span style="color:#38bdf8">${code}</span></h1>` +
      `<p class="tagline">${msg || "Connecting…"}</p>` +
      `<div class="big-code">${code}</div><div class="spinner"></div>` +
      `<button class="copy-link" id="copyBtn">📋 Copy invite link</button><br>` +
      `<button class="btn ghost" id="cancelBtn">Cancel</button>`;
    els.overlay.hidden = false;
    const cp = document.getElementById("copyBtn");
    cp.addEventListener("click", () => { navigator.clipboard && navigator.clipboard.writeText(link); cp.textContent = "✓ Copied!"; });
    document.getElementById("cancelBtn").addEventListener("click", () => { teardownOnline(); showLobby(""); });
  }

  function renderHostRoom() {
    const total = MODES[modeKey].slots, link = location.origin + location.pathname + "?code=" + lastCode;
    let rows = "";
    for (let s = 0; s < total; s++) {
      let nm, bot = false, team = 0;
      if (s === 0) { nm = myName + " (you)"; team = myTeam; }
      else if (lobbyHumans[s]) { nm = lobbyHumans[s].name; team = lobbyHumans[s].team; }
      else { nm = "open — bot"; bot = true; }
      const col = MODES[modeKey].teams ? TEAM_COLOR[team] : (bot ? "#475569" : colorFor(s, s));
      rows += `<li><span class="rdot" style="background:${col}"></span>${escapeHtml(nm)}${bot ? '<span class="rbot">BOT</span>' : ""}</li>`;
    }
    els.card.innerHTML =
      `<h1>Arena <span style="color:#38bdf8">${lastCode}</span></h1>` +
      `<p class="tagline">${MODES[modeKey].label} · share the code; empty slots become bots.</p>` +
      `<ul class="roster">${rows}</ul>` +
      `<button class="copy-link" id="copyBtn">📋 Copy invite link</button>` +
      `<button id="startMatchBtn" class="btn">Start match</button>` +
      `<button class="btn ghost" id="cancelBtn">Cancel</button>`;
    els.overlay.hidden = false;
    const cp = document.getElementById("copyBtn");
    cp.addEventListener("click", () => { navigator.clipboard && navigator.clipboard.writeText(link); cp.textContent = "✓ Copied!"; });
    document.getElementById("startMatchBtn").addEventListener("click", hostStart);
    document.getElementById("cancelBtn").addEventListener("click", () => { teardownOnline(); showLobby(""); });
  }

  function teardownOnline() {
    if (conn) { try { conn.close(); } catch (_) {} conn = null; }
    awaiting = false; role = null; remoteInputs = {}; pendingEvents = []; lobbyHumans = {}; connSlot = {};
  }

  // ------------------------------------------------------------- main lobby
  function bindLobby() {
    els.card = document.getElementById("card");
    const modes = document.getElementById("modes");
    const teampick = document.getElementById("teampick");
    els.codeInput = document.getElementById("codeInput");
    els.diceBtn = document.getElementById("diceBtn");
    els.startBtn = document.getElementById("startBtn");
    els.onlineHint = document.getElementById("onlineHint");

    function refreshMode() {
      modes.querySelectorAll(".mode").forEach((m) => m.classList.toggle("sel", m.dataset.mode === selMode));
      teampick.hidden = selMode !== "team";
      els.startBtn.textContent = els.codeInput.value ? "Create / Join Arena" : (selMode === "duel" ? "Play vs Bot" : "Play vs Bots");
    }
    modes.querySelectorAll(".mode").forEach((m) => m.addEventListener("click", () => { selMode = m.dataset.mode; refreshMode(); }));
    teampick.querySelectorAll(".team-btn").forEach((t) => t.addEventListener("click", () => {
      myTeam = +t.dataset.team;
      teampick.querySelectorAll(".team-btn").forEach((x) => x.classList.toggle("sel", +x.dataset.team === myTeam));
    }));
    teampick.querySelectorAll(".team-btn").forEach((x) => x.classList.toggle("sel", +x.dataset.team === myTeam));

    els.diceBtn.addEventListener("click", () => { els.codeInput.value = window.SnowNet.randomCode(); refreshMode(); els.codeInput.focus(); });
    els.codeInput.addEventListener("input", () => { els.codeInput.value = window.SnowNet.cleanCode(els.codeInput.value); refreshMode(); });
    els.codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") els.startBtn.click(); });
    els.startBtn.addEventListener("click", () => { if (els.codeInput.value && window.SnowNet.online()) joinOnline(selMode); else startOffline(selMode); });

    if (!window.SnowNet.online()) { els.codeInput.disabled = true; els.diceBtn.disabled = true; els.onlineHint.textContent = "Online needs WebRTC — playing vs bots."; }
    else els.onlineHint.textContent = "Same code = same arena. Friends + bots fill the slots.";
    refreshMode();
  }

  function showLobby(msg) {
    teardownOnline();
    online = false; role = null; running = false; awaiting = false; modeKey = selMode;
    A = ARENAS[MODES[selMode].arena];
    els.scoreboard.innerHTML = ""; els.objective.textContent = "Snowball Arena"; els.score.textContent = "";
    els.modeTag.textContent = ""; setConn("offline");
    els.card.innerHTML = lobbyHTML;
    els.overlay.hidden = false;
    bindLobby();
    if (msg) els.onlineHint.textContent = msg;
  }

  // ------------------------------------------------------------- startup
  async function boot() {
    const me = await window.SnowNet.getMe();
    myName = (me && me.username) || window.SnowNet.guestName();
    els.youName.textContent = myName;
    const q = new URLSearchParams(location.search);
    const linkCode = window.SnowNet.cleanCode(q.get("code") || q.get("room") || "");
    if (linkCode && window.SnowNet.online()) { els.codeInput.value = linkCode; joinOnline(selMode); }
  }

  // ------------------------------------------------------------- net pump
  setInterval(() => {
    if (!online || !conn) return;
    if (role === "guest") {
      const inp = localInput();
      conn.send({ t: "input", input: { left: inp.left, right: inp.right, jump: inp.jump, duck: inp.duck, aimAngle: inp.aim, throw: inp.throwHeld } });
    } else if (role === "host" && running) sendState();
  }, 45);

  // ------------------------------------------------------------- events
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase(); keys[k] = true;
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  canvas.addEventListener("pointermove", (e) => { const w = screenToWorld(e.clientX, e.clientY); mouse.x = w.x; mouse.y = w.y; });
  canvas.addEventListener("pointerdown", (e) => { const w = screenToWorld(e.clientX, e.clientY); mouse.x = w.x; mouse.y = w.y; mouse.down = true; });
  window.addEventListener("pointerup", () => { mouse.down = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  if ("ontouchstart" in window) {
    els.touch.hidden = false;
    els.touch.querySelectorAll(".tbtn").forEach((btn) => {
      const act = btn.dataset.act;
      const set = (v) => { if (act === "throw") touchInput.throw = v; else touchInput[act] = v; if (act === "jump" && v) setTimeout(() => (touchInput.jump = false), 80); };
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); set(true); });
      btn.addEventListener("pointerup", (e) => { e.preventDefault(); set(false); });
      btn.addEventListener("pointerleave", () => set(false));
    });
  }
  window.addEventListener("resize", fit);

  // go
  lobbyHTML = els.card.innerHTML;
  bindLobby();
  boot();
  requestAnimationFrame(frame);
})();
