/*
 * game.js — Snowball Arena
 * 2.5D side-view snowball brawler. Authoritative local sim; bot opponent
 * offline, server-driven when SnowNet goes online (see net.js).
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- constants
  const W = 960, H = 540;            // logical arena size
  const GROUND_Y = H - 46;           // top of the snow floor
  const STEP = 1000 / 60;            // fixed sim timestep (ms)

  const GRAVITY = 0.62;
  const MOVE_ACCEL = 0.9;
  const MAX_SPEED = 4.4;
  const GROUND_FRICTION = 0.78;
  const AIR_FRICTION = 0.94;
  const JUMP_V = -13.2;

  const P_W = 30, P_STAND = 58, P_DUCK = 36;

  const BALL_R = 7;
  const BALL_GRAVITY = 0.42;
  const THROW_MIN = 9.5, THROW_MAX = 21.5;
  const CHARGE_MS = 620;
  const THROW_CD = 360;             // ms between throws
  const MAX_HP = 100;
  const RESPAWN_MS = 1600;
  const INVULN_MS = 1100;
  const WIN_SCORE = 5;

  const COL = {
    you: "#38bdf8", youDark: "#0284c7",
    foe: "#f472b6", foeDark: "#db2777",
  };

  // Paintball-style inflatable bunkers (cover). Symmetric layout.
  const BUNKERS = [
    { x: 150, y: GROUND_Y - 90,  w: 70,  h: 90,  c: "#ef4444" },
    { x: W - 220, y: GROUND_Y - 90, w: 70, h: 90, c: "#f59e0b" },
    { x: 330, y: GROUND_Y - 130, w: 60, h: 130, c: "#22c55e" },
    { x: W - 390, y: GROUND_Y - 130, w: 60, h: 130, c: "#a855f7" },
    { x: W / 2 - 70, y: GROUND_Y - 64, w: 140, h: 64, c: "#3b82f6" },
    { x: W / 2 - 26, y: 150, w: 52, h: 150, c: "#14b8a6" }, // tall center pillar (floating-ish wall)
  ];

  const SPAWN = [
    { x: 70, y: GROUND_Y - P_STAND },
    { x: W - 70 - P_W, y: GROUND_Y - P_STAND },
  ];

  // ----------------------------------------------------------------- elements
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const els = {
    overlay: document.getElementById("overlay"),
    card: document.getElementById("card"),
    playBtn: document.getElementById("playBtn"),
    onlineBtn: document.getElementById("onlineBtn"),
    codeInput: document.getElementById("codeInput"),
    diceBtn: document.getElementById("diceBtn"),
    onlineHint: document.getElementById("onlineHint"),
    youHealth: document.getElementById("youHealth"),
    foeHealth: document.getElementById("foeHealth"),
    youName: document.getElementById("youName"),
    foeName: document.getElementById("foeName"),
    score: document.getElementById("score"),
    status: document.getElementById("status"),
    roundMsg: document.getElementById("roundMsg"),
    aimMeter: document.getElementById("aimMeter"),
    conn: document.getElementById("conn"),
    touch: document.getElementById("touch"),
  };

  // -------------------------------------------------------------------- state
  let players = [];     // [you, foe]
  let balls = [];
  let splats = [];      // visual splat marks
  let flakes = [];      // ambient snow
  let score = [0, 0];
  let running = false;
  let online = false;
  let conn = null;
  let mode = "bot";     // "bot" | "online"
  let role = null;      // "host" | "guest" when online
  let remoteInput = null;   // host: latest input received from the guest
  let pendingEvents = [];    // host: kill/win events to send in the next snapshot
  let awaitingOpponent = false;
  let myName = "You";
  let lastCode = "";
  let lobbyHTML = "";
  let myIndex = 0;      // which player you control
  let inputSeq = 0;
  let acc = 0, lastT = 0;
  let mouse = { x: W * 0.6, y: H * 0.4, down: false };
  const keys = {};
  let touchInput = { left: false, right: false, jump: false, duck: false, throw: false };

  // ------------------------------------------------------------- entity setup
  function makePlayer(i, name) {
    const s = SPAWN[i];
    return {
      i, name,
      x: s.x, y: s.y, vx: 0, vy: 0,
      w: P_W, h: P_STAND,
      onGround: false, facing: i === 0 ? 1 : -1,
      duck: false, hp: MAX_HP, alive: true,
      charge: 0, throwHeld: false, prevThrow: false,
      cd: 0, invuln: 0, respawn: 0, aim: i === 0 ? 0 : Math.PI,
      flash: 0,
    };
  }

  function resetMatch(foeName) {
    players = [makePlayer(0, els.youName.textContent), makePlayer(1, foeName)];
    balls = []; splats = [];
    score = [0, 0];
    updateHud();
  }

  function respawn(p) {
    const s = SPAWN[p.i];
    p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0;
    p.hp = MAX_HP; p.alive = true; p.duck = false; p.h = P_STAND;
    p.charge = 0; p.cd = 0; p.invuln = INVULN_MS; p.respawn = 0;
  }

  // ------------------------------------------------------------------- inputs
  function localInput() {
    const left = keys["a"] || keys["arrowleft"] || touchInput.left;
    const right = keys["d"] || keys["arrowright"] || touchInput.right;
    const jump = keys["w"] || keys[" "] || keys["arrowup"] || touchInput.jump;
    const duck = keys["s"] || keys["arrowdown"] || touchInput.duck;
    const me = players[myIndex];
    let aim = me ? me.aim : 0;
    if (me) {
      const hand = handPos(me);
      aim = Math.atan2(mouse.y - hand.y, mouse.x - hand.x);
    }
    const throwHeld = mouse.down || touchInput.throw;
    return { left, right, jump, duck, aim, throwHeld };
  }

  function applyInput(p, inp) {
    // horizontal
    if (inp.left) p.vx -= MOVE_ACCEL;
    if (inp.right) p.vx += MOVE_ACCEL;
    p.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vx));
    // duck (only on ground)
    p.duck = !!inp.duck && p.onGround;
    const targetH = p.duck ? P_DUCK : P_STAND;
    if (targetH !== p.h) { p.y += p.h - targetH; p.h = targetH; }
    // jump
    if (inp.jump && p.onGround && !p.duck) { p.vy = JUMP_V; p.onGround = false; }
    // aim + facing
    p.aim = inp.aim;
    p.facing = Math.cos(inp.aim) >= 0 ? 1 : -1;
    // throw charging
    p.cd = Math.max(0, p.cd - STEP);
    if (inp.throwHeld && p.cd <= 0) {
      p.charge = Math.min(1, p.charge + STEP / CHARGE_MS);
    }
    const released = p.prevThrow && !inp.throwHeld;
    if (released && p.cd <= 0 && p.charge > 0.04) {
      throwBall(p);
      p.charge = 0; p.cd = THROW_CD;
    }
    if (!inp.throwHeld && !released) p.charge = 0;
    p.prevThrow = inp.throwHeld;
  }

  function handPos(p) {
    return { x: p.x + p.w / 2 + p.facing * 10, y: p.y + (p.duck ? 12 : 18) };
  }

  function throwBall(p) {
    const speed = THROW_MIN + p.charge * (THROW_MAX - THROW_MIN);
    const hand = handPos(p);
    balls.push({
      x: hand.x + Math.cos(p.aim) * 14,
      y: hand.y + Math.sin(p.aim) * 14,
      vx: Math.cos(p.aim) * speed + p.vx * 0.3,
      vy: Math.sin(p.aim) * speed,
      owner: p.i, life: 4000,
    });
  }

  // ---------------------------------------------------------------- physics
  function stepPlayer(p) {
    if (!p.alive) {
      p.respawn -= STEP;
      if (p.respawn <= 0) respawn(p);
      return;
    }
    p.invuln = Math.max(0, p.invuln - STEP);
    p.flash = Math.max(0, p.flash - STEP);

    p.vy += GRAVITY;
    // friction
    p.vx *= p.onGround ? GROUND_FRICTION : AIR_FRICTION;
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    // move + resolve X
    p.x += p.vx;
    for (const b of BUNKERS) {
      if (aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
        if (p.vx > 0) p.x = b.x - p.w; else if (p.vx < 0) p.x = b.x + b.w;
        p.vx = 0;
      }
    }
    p.x = Math.max(0, Math.min(W - p.w, p.x));

    // move + resolve Y
    p.onGround = false;
    p.y += p.vy;
    for (const b of BUNKERS) {
      if (aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
        if (p.vy > 0) { p.y = b.y - p.h; p.onGround = true; }
        else if (p.vy < 0) { p.y = b.y + b.h; }
        p.vy = 0;
      }
    }
    if (p.y + p.h >= GROUND_Y) { p.y = GROUND_Y - p.h; p.vy = 0; p.onGround = true; }
  }

  function stepBall(b) {
    b.vy += BALL_GRAVITY;
    b.x += b.vx; b.y += b.vy;
    b.life -= STEP;

    // walls / floor
    if (b.x < -20 || b.x > W + 20 || b.life <= 0) return false;
    if (b.y + BALL_R >= GROUND_Y) { addSplat(b.x, GROUND_Y, "#e2e8f0"); return false; }

    // bunkers
    for (const bk of BUNKERS) {
      if (circleRect(b.x, b.y, BALL_R, bk.x, bk.y, bk.w, bk.h)) {
        addSplat(b.x, b.y, "#e2e8f0"); return false;
      }
    }
    // players
    for (const p of players) {
      if (p.i === b.owner || !p.alive || p.invuln > 0) continue;
      if (circleRect(b.x, b.y, BALL_R, p.x, p.y, p.w, p.h)) {
        const speed = Math.hypot(b.vx, b.vy);
        let dmg = Math.round(6 + speed * 0.78);
        if (p.duck) dmg = Math.round(dmg * 0.65);
        hitPlayer(p, dmg, b.owner);
        addSplat(b.x, b.y, p.i === 0 ? COL.you : COL.foe);
        return false;
      }
    }
    return true;
  }

  function hitPlayer(p, dmg, attacker) {
    p.hp -= dmg; p.flash = 140;
    p.vx += (p.i === 0 ? -1 : 1) * 0.6; // tiny knockback toward back
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false; p.respawn = RESPAWN_MS;
      score[attacker]++;
      onKill(attacker, p.i);
    }
    updateHud();
  }

  // ------------------------------------------------------------- match events
  // Runs on the authoritative side (offline, or the online host). The host also
  // records events so the guest can flash the same messages / end screen.
  function onKill(attacker, victim) {
    updateHud();
    if (role === "host") pendingEvents.push({ kind: "kill", attacker, victim });
    if (score[attacker] >= WIN_SCORE) {
      if (role === "host") { pendingEvents.push({ kind: "win", winner: attacker }); sendState(); }
      endMatch(attacker === myIndex);
      return;
    }
    const youWon = attacker === myIndex;
    const aName = players[attacker].name, vName = players[victim].name;
    flashRound(youWon ? `❄️ You froze ${vName}!` : `${aName} froze you!`,
               youWon ? COL.you : COL.foe);
  }

  function flashRound(text, color) {
    els.roundMsg.textContent = text;
    els.roundMsg.style.color = color || "#fff";
    els.roundMsg.hidden = false;
    clearTimeout(flashRound._t);
    flashRound._t = setTimeout(() => { els.roundMsg.hidden = true; }, 1200);
  }

  function endMatch(youWon, customMsg) {
    running = false;
    els.roundMsg.hidden = true;
    if (online) submitScore(score[myIndex]);

    let title, sub;
    if (customMsg) { title = "Match over"; sub = customMsg; }
    else {
      title = youWon ? "🏆 Victory!" : "💧 Defeated";
      sub = `Final score ${score[myIndex]}–${score[1 - myIndex]}`;
    }

    // Offline: rematch the bot. Online: the host restarts a fresh match in the
    // same arena (the guest resyncs from the host's snapshots). Either way
    // "Back to menu" returns to the lobby.
    const stayLabel = mode === "online" && !customMsg ? "Rematch (same code)" : "Play again";
    els.card.innerHTML =
      `<h1>${title}</h1><p class="tagline">${sub}</p>` +
      (online && customMsg ? "" : `<button id="againBtn" class="btn">${stayLabel}</button>`) +
      `<button id="menuBtn" class="btn ghost">Back to menu</button>`;
    els.overlay.hidden = false;

    const again = document.getElementById("againBtn");
    if (again) again.addEventListener("click", () => {
      if (mode === "online") {
        if (role === "host" && conn) {
          resetMatch((players[1] && players[1].name) || "Friend");
          els.overlay.hidden = true; running = true;
        } else if (role === "guest" && conn) {
          els.overlay.hidden = true; running = true; // resync to host's fresh match
        } else {
          joinOnline(lastCode);
        }
      } else {
        startOffline();
      }
    });
    document.getElementById("menuBtn").addEventListener("click", () => {
      teardownOnline(); showLobby("");
    });
  }

  // ----------------------------------------------------------------- bot AI
  function botThink(bot, target) {
    const inp = { left: false, right: false, jump: false, duck: false, aim: bot.aim, throwHeld: false };
    if (!bot.alive || !target.alive) { bot.throwHeld = false; return inp; }

    const dx = target.x - bot.x;
    const dist = Math.abs(dx);
    const dir = dx > 0 ? 1 : -1;

    // keep mid-range
    if (dist > 360) { if (dir > 0) inp.right = true; else inp.left = true; }
    else if (dist < 180) { if (dir > 0) inp.left = true; else inp.right = true; }
    else if ((bot._wander = (bot._wander || 0) - STEP) <= 0) {
      bot._wander = 500 + Math.random() * 700;
      bot._wdir = Math.random() < 0.5 ? -1 : 1;
    }
    if (bot._wander > 0 && bot._wdir) {
      if (bot._wdir > 0) inp.right = true; else inp.left = true;
    }

    // hop over walls: if we want to move but a bunker is blocking us, jump
    const wantsMove = inp.left || inp.right;
    const blocked = wantsMove && bot.onGround && Math.abs(bot.x - (bot._lastX != null ? bot._lastX : bot.x)) < 0.4;
    if (blocked) inp.jump = true;
    bot._lastX = bot.x;

    // dodge: jump if a ball is heading at the bot and close
    for (const b of balls) {
      if (b.owner === bot.i) continue;
      if (Math.abs(b.x - bot.x) < 90 && Math.sign(b.vx) === dir * -1) {
        if (bot.onGround && Math.random() < 0.06) inp.jump = true;
        if (Math.random() < 0.04) inp.duck = true;
      }
    }

    // aim with ballistic lead toward the target's torso
    const aimSol = solveAim(bot, target);
    inp.aim = aimSol.angle + (Math.random() - 0.5) * 0.06; // jitter
    bot._chargeWant = bot._chargeWant || aimSol.charge;

    // charge then release
    if (bot.cd <= 0) {
      if (bot.charge < bot._chargeWant) { inp.throwHeld = true; }
      else { inp.throwHeld = false; bot._chargeWant = 0.45 + Math.random() * 0.5; }
    }
    return inp;
  }

  // Bot aim: pick charge from distance, then aim above the target so gravity
  // drops the throw onto it. Symmetric for left/right throws.
  function solveAim(from, to) {
    const hand = handPos(from);
    const tx = to.x + to.w / 2, ty = to.y + to.h * 0.35;
    const dx = tx - hand.x, dy = ty - hand.y;
    const dist = Math.hypot(dx, dy);
    const charge = Math.max(0.4, Math.min(1, dist / 520));
    const drop = dist * 0.32; // aim this many px above the target to fight gravity
    const angle = Math.atan2(dy - drop, dx);
    return { angle, charge };
  }

  // ------------------------------------------------------------- simulation
  function simulate() {
    // Guest renders the host's snapshots only — it doesn't run the sim.
    if (online && role === "guest") return;

    // You (host = slot 0, offline = slot 0).
    applyInput(players[myIndex], localInput());

    // Foe: the connected guest (online host) or the bot (offline).
    const foe = players[1 - myIndex];
    if (online && role === "host") applyInput(foe, remoteAsInput());
    else applyInput(foe, botThink(foe, players[myIndex]));

    // integrate
    for (const p of players) stepPlayer(p);
    balls = balls.filter(stepBall);
  }

  // Convert the guest's last received input into the shape applyInput wants.
  function remoteAsInput() {
    const r = remoteInput || {};
    return {
      left: !!r.left, right: !!r.right, jump: !!r.jump, duck: !!r.duck,
      aim: typeof r.aimAngle === "number" ? r.aimAngle : Math.PI,
      throwHeld: !!r.throw,
    };
  }

  // ------------------------------------------------------------- collisions
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
  }

  // ------------------------------------------------------------- splats/snow
  function addSplat(x, y, color) {
    splats.push({ x, y, r: 3 + Math.random() * 4, color, life: 1400 });
    if (splats.length > 60) splats.shift();
  }
  function initFlakes() {
    flakes = [];
    for (let i = 0; i < 60; i++) {
      flakes.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2, s: 0.3 + Math.random() * 0.8 });
    }
  }

  // ----------------------------------------------------------------- render
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    const scale = Math.min(cw / W, ch / H);
    const ox = (cw - W * scale) / 2, oy = (ch - H * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    fit.scale = scale; fit.ox = ox; fit.oy = oy;
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - fit.ox) / fit.scale;
    const y = (clientY - rect.top - fit.oy) / fit.scale;
    return { x, y };
  }

  function render() {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1e3a5f"); g.addColorStop(1, "#0f213a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // ambient snow
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (const f of flakes) {
      f.y += f.s; f.x += Math.sin((f.y + f.x) * 0.01) * 0.3;
      if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
    }

    // floor (snow)
    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "#bfdbfe";
    ctx.fillRect(0, GROUND_Y, W, 6);

    // bunkers
    for (const b of BUNKERS) drawBunker(b);

    // splats
    for (const s of splats) {
      s.life -= STEP;
      ctx.globalAlpha = Math.max(0, s.life / 1400);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    splats = splats.filter((s) => s.life > 0);

    // aim preview for local player
    const me = players[myIndex];
    if (me && me.alive && (mouse.down || touchInput.throw)) drawTrajectory(me);

    // players + balls
    for (const p of players) if (p) drawPlayer(p);
    for (const b of balls) drawBall(b);

    // power meter
    els.aimMeter.style.width = me ? Math.round(me.charge * 100) + "%" : "0%";
  }

  function drawBunker(b) {
    ctx.fillStyle = b.c;
    roundRect(b.x, b.y, b.w, b.h, 10); ctx.fill();
    // inflatable highlight
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(b.x + 6, b.y + 6, b.w * 0.4, b.h - 12, 8); ctx.fill();
    // snow cap
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    roundRect(b.x + 2, b.y - 3, b.w - 4, 8, 4); ctx.fill();
  }

  function drawPlayer(p) {
    const cx = p.x + p.w / 2;
    const flash = p.flash > 0 && Math.floor(p.flash / 40) % 2 === 0;
    const ghost = p.invuln > 0 && Math.floor(p.invuln / 90) % 2 === 0;
    if (!p.alive) { drawFrozen(p); return; }
    ctx.globalAlpha = ghost ? 0.5 : 1;

    const main = p.i === 0 ? COL.you : COL.foe;
    const dark = p.i === 0 ? COL.youDark : COL.foeDark;

    // body
    ctx.fillStyle = flash ? "#fff" : main;
    roundRect(p.x + 4, p.y + 14, p.w - 8, p.h - 14, 7); ctx.fill();
    // head
    ctx.fillStyle = flash ? "#fff" : "#fde68a";
    ctx.beginPath(); ctx.arc(cx, p.y + 10, 11, 0, 7); ctx.fill();
    // beanie
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(cx, p.y + 7, 11, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(cx, p.y - 2, 3, 0, 7); ctx.fill();

    // throwing arm toward aim
    const hand = handPos(p);
    ctx.strokeStyle = dark; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, p.y + 24);
    ctx.lineTo(hand.x + Math.cos(p.aim) * 10, hand.y + Math.sin(p.aim) * 10);
    ctx.stroke();
    // snowball in hand while charging
    if (p.charge > 0.04) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(hand.x + Math.cos(p.aim) * 12, hand.y + Math.sin(p.aim) * 12, BALL_R, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // name tag
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "600 12px system-ui"; ctx.textAlign = "center";
    ctx.fillText(p.name, cx, p.y - 12);
  }

  function drawFrozen(p) {
    const cx = p.x + p.w / 2;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(186,230,253,0.7)";
    roundRect(p.x, p.y, p.w, P_STAND, 8); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "18px system-ui"; ctx.textAlign = "center";
    ctx.fillText("🥶", cx, p.y + 36);
    ctx.globalAlpha = 1;
  }

  function drawBall(b) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath(); ctx.ellipse(b.x, GROUND_Y - 2, BALL_R, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(186,230,253,0.9)";
    ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, BALL_R * 0.5, 0, 7); ctx.fill();
  }

  function drawTrajectory(p) {
    let x = handPos(p).x + Math.cos(p.aim) * 14;
    let y = handPos(p).y + Math.sin(p.aim) * 14;
    const speed = THROW_MIN + p.charge * (THROW_MAX - THROW_MIN);
    let vx = Math.cos(p.aim) * speed, vy = Math.sin(p.aim) * speed;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 40; i++) {
      vy += BALL_GRAVITY; x += vx; y += vy;
      if (y >= GROUND_Y || x < 0 || x > W) break;
      if (i % 3 === 0) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); }
    }
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ------------------------------------------------------------------- HUD
  function updateHud() {
    const you = players[myIndex], foe = players[1 - myIndex];
    if (you) els.youHealth.style.width = Math.max(0, you.hp) + "%";
    if (foe) els.foeHealth.style.width = Math.max(0, foe.hp) + "%";
    els.score.innerHTML = `${score[myIndex]}&nbsp;–&nbsp;${score[1 - myIndex]}`;
  }

  function setConn(state) {
    els.conn.className = "conn " + (state === "live" ? "live" : state === "connecting" ? "connecting" : "");
    els.conn.textContent = state;
  }

  // ------------------------------------------------------------- main loop
  function frame(t) {
    if (!lastT) lastT = t;
    let dt = t - lastT; lastT = t;
    if (dt > 100) dt = 100; // clamp after tab-out
    acc += dt;
    while (acc >= STEP) { if (running) simulate(); acc -= STEP; }
    fit();
    render();
    requestAnimationFrame(frame);
  }

  // ----------------------------------------------------------- leaderboard
  async function submitScore(myKills) {
    try {
      await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ game: "snowball-arena", score: myKills }),
      });
    } catch (_) {}
  }

  // --------------------------------------------------------- online wiring
  function applySnapshot(msg) {
    // Server is authoritative: rebuild render entities from the snapshot.
    // Place players by slot id so players[myIndex] always = your fighter.
    if (Array.isArray(msg.players)) {
      const arr = [];
      msg.players.forEach((sp) => {
        arr[sp.id] = Object.assign(makePlayer(sp.id, sp.name || "?"), sp);
      });
      players = arr;
    }
    if (Array.isArray(msg.balls)) balls = msg.balls;
    if (msg.score) score = msg.score;
    updateHud();

    // Both players present? Leave the waiting room and start the brawl.
    const present = players.filter(Boolean).length;
    if (awaitingOpponent && present >= 2) {
      awaitingOpponent = false;
      els.overlay.hidden = true;
      const foe = players[1 - myIndex];
      els.foeName.textContent = (foe && foe.name) || "Friend";
      els.status.textContent = "Live match · " + lastCode;
      running = true;
    }

    (msg.events || []).forEach((e) => {
      if (e.kind === "kill") {
        const youWon = e.attacker === myIndex;
        const aName = (players[e.attacker] && players[e.attacker].name) || "?";
        const vName = (players[e.victim] && players[e.victim].name) || "?";
        flashRound(youWon ? `❄️ You froze ${vName}!` : `${aName} froze you!`,
                   youWon ? COL.you : COL.foe);
      } else if (e.kind === "win") {
        endMatch(e.winner === myIndex);
      }
    });
  }

  // --------------------------------------------------------------- startup
  async function boot() {
    const me = await window.SnowNet.getMe();
    myName = (me && me.username) || window.SnowNet.guestName();
    els.youName.textContent = myName;

    // Prefill the code from an invite link (?code=ABCD or ?room=ABCD).
    const q = new URLSearchParams(location.search);
    const linkCode = window.SnowNet.cleanCode(q.get("code") || q.get("room") || "");
    if (linkCode) {
      els.codeInput.value = linkCode;
      if (window.SnowNet.online()) joinOnline(linkCode); // auto-join from an invite link
    }
  }

  // ---- offline (vs bot) ----
  function startOffline() {
    teardownOnline();
    mode = "bot"; online = false; myIndex = 0;
    setConn("offline");
    els.foeName.textContent = "Frosty";
    els.status.textContent = "vs. Frosty (bot)";
    els.overlay.hidden = true;
    initFlakes();
    resetMatch("Frosty");
    running = true;
  }

  // ---- online (party code, peer-to-peer) ----
  // First to enter a code HOSTS (runs the sim, slot 0); second JOINS (slot 1).
  function joinOnline(rawCode) {
    const code = window.SnowNet.cleanCode(rawCode || els.codeInput.value);
    if (!code) { els.onlineHint.textContent = "Enter a code first (or hit 🎲)."; return; }
    teardownOnline();
    lastCode = code;
    mode = "online"; online = true; running = false; awaitingOpponent = true;
    role = null; remoteInput = null; pendingEvents = [];
    initFlakes();
    players = []; balls = []; score = [0, 0];
    showWaiting(code);

    conn = window.SnowNet.connect(code, myName, {
      onStatus: setConn,
      onRole: (r) => { role = r; myIndex = r === "host" ? 0 : 1; },
      onPeerJoin: () => {
        // Guest's channel is open — announce our name; the host starts the match.
        if (role === "guest") conn.send({ t: "join", name: myName });
      },
      onPeerLeft: () => {
        if (running) { running = false; endMatch(null, "Your friend left the arena."); }
      },
      onData: (msg) => {
        if (role === "host") {
          if (msg.t === "join") {
            remoteInput = null;
            startHostMatch(msg.name || "Friend");
            conn.send({ t: "welcome", id: 1, foeName: myName });
          } else if (msg.t === "input") {
            remoteInput = msg.input || {};
          }
        } else { // guest
          if (msg.t === "welcome") {
            myIndex = msg.id != null ? msg.id : 1;
            if (msg.foeName) els.foeName.textContent = msg.foeName;
          } else if (msg.t === "state") {
            applySnapshot(msg);
          }
        }
      },
    });
  }

  // Host: a guest just joined — set up and begin the authoritative match.
  function startHostMatch(guestName) {
    resetMatch(guestName);           // players[0] = you (host), players[1] = guest
    awaitingOpponent = false;
    els.overlay.hidden = true;
    els.foeName.textContent = guestName;
    els.status.textContent = "Live match · " + lastCode;
    running = true;
  }

  // Host: broadcast a snapshot of the authoritative state to the guest.
  function sendState() {
    if (!conn || role !== "host") return;
    const sp = players.filter(Boolean).map((p) => ({
      id: p.i, name: p.name, x: Math.round(p.x), y: Math.round(p.y),
      vx: p.vx, vy: p.vy, h: p.h, hp: p.hp, facing: p.facing,
      duck: p.duck, alive: p.alive, aim: p.aim, charge: p.charge,
    }));
    const sb = balls.map((b) => ({
      x: Math.round(b.x), y: Math.round(b.y), vx: b.vx, vy: b.vy, owner: b.owner,
    }));
    const ev = pendingEvents; pendingEvents = [];
    conn.send({ t: "state", players: sp, balls: sb, score: score.slice(), events: ev });
  }

  function showWaiting(code) {
    const base = location.origin + location.pathname;
    const link = base + "?code=" + code;
    els.card.innerHTML =
      `<h1>Arena <span style="color:#38bdf8">${code}</span></h1>` +
      `<p class="tagline">Share this code (or link) with your friend. The match starts the moment they join.</p>` +
      `<div class="big-code">${code}</div>` +
      `<div class="spinner"></div>` +
      `<p class="tagline">Waiting for your friend…</p>` +
      `<button class="copy-link" id="copyBtn">📋 Copy invite link</button>` +
      `<br><button class="btn ghost" id="cancelBtn">Cancel</button>`;
    els.overlay.hidden = false;
    const copyBtn = document.getElementById("copyBtn");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard && navigator.clipboard.writeText(link);
      copyBtn.textContent = "✓ Copied!";
    });
    document.getElementById("cancelBtn").addEventListener("click", () => {
      teardownOnline(); showLobby("");
    });
  }

  function teardownOnline() {
    if (conn) { try { conn.close(); } catch (_) {} conn = null; }
    awaitingOpponent = false; role = null; remoteInput = null; pendingEvents = [];
  }

  // ---- lobby ----
  function bindLobby() {
    els.card = document.getElementById("card");
    els.playBtn = document.getElementById("playBtn");
    els.onlineBtn = document.getElementById("onlineBtn");
    els.codeInput = document.getElementById("codeInput");
    els.diceBtn = document.getElementById("diceBtn");
    els.onlineHint = document.getElementById("onlineHint");

    els.playBtn.addEventListener("click", startOffline);
    els.onlineBtn.addEventListener("click", () => joinOnline());
    els.diceBtn.addEventListener("click", () => {
      els.codeInput.value = window.SnowNet.randomCode();
      els.codeInput.focus();
    });
    els.codeInput.addEventListener("input", () => {
      els.codeInput.value = window.SnowNet.cleanCode(els.codeInput.value);
    });
    els.codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinOnline(); });

    if (window.SnowNet.online()) {
      els.onlineHint.textContent = "Type a code and share it with a friend — same code = same arena.";
    } else {
      els.onlineBtn.disabled = true;
      els.codeInput.disabled = true;
      els.diceBtn.disabled = true;
      els.onlineHint.textContent = "Online play isn't switched on yet — playing vs. bot for now.";
    }
  }

  function showLobby(msg) {
    teardownOnline();
    mode = "bot"; online = false; running = false;
    els.foeName.textContent = "Frosty";
    els.status.textContent = "Snowball Arena";
    els.card.innerHTML = lobbyHTML;
    els.overlay.hidden = false;
    bindLobby();
    if (msg) els.onlineHint.textContent = msg;
  }

  // Network pump: guest streams its inputs to the host; host streams snapshots.
  setInterval(() => {
    if (!online || !conn) return;
    if (role === "guest") {
      const inp = localInput();
      conn.send({ t: "input", input: {
        left: inp.left, right: inp.right, jump: inp.jump, duck: inp.duck,
        aimAngle: inp.aim, throw: inp.throwHeld,
      } });
    } else if (role === "host" && running) {
      sendState();
    }
  }, 45);

  // --------------------------------------------------------------- events
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener("pointermove", (e) => {
    const w = screenToWorld(e.clientX, e.clientY); mouse.x = w.x; mouse.y = w.y;
  });
  canvas.addEventListener("pointerdown", (e) => {
    const w = screenToWorld(e.clientX, e.clientY); mouse.x = w.x; mouse.y = w.y;
    mouse.down = true;
  });
  window.addEventListener("pointerup", () => { mouse.down = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // touch controls
  if ("ontouchstart" in window) {
    els.touch.hidden = false;
    els.touch.querySelectorAll(".tbtn").forEach((btn) => {
      const act = btn.dataset.act;
      const set = (v) => {
        if (act === "throw") touchInput.throw = v;
        else touchInput[act] = v;
        if (act === "jump" && v) setTimeout(() => (touchInput.jump = false), 80);
      };
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); set(true); });
      btn.addEventListener("pointerup", (e) => { e.preventDefault(); set(false); });
      btn.addEventListener("pointerleave", () => set(false));
    });
  }

  window.addEventListener("resize", fit);

  // go
  lobbyHTML = els.card.innerHTML;   // snapshot the lobby card for later restores
  bindLobby();
  boot();
  resetMatch("Frosty");
  requestAnimationFrame(frame);
})();
