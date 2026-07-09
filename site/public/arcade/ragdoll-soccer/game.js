// Ragdoll Soccer — side-view 1v1 head-soccer. Layout modeled on the classic
// "ragdoll football" arena: hex-pattern sky, bleacher band, green pitch,
// blue goal left / red goal right, black scoreboard boxes up top.
(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // ---- arena geometry ----
  const GROUND = 430;            // y of the play surface
  const BAND_BOT = 515;          // bottom of the bleacher/platform band
  const TRAP = 150;              // green corner-triangle width on the band
  const GOAL_H = 150;            // goal mouth height
  const GOAL_D = 80;             // goal depth from the side wall
  const BAR_Y = GROUND - GOAL_H; // crossbar y
  const TARGET = 5;              // goals to win a match

  // ---- physics constants ----
  const GRAV = 0.55, P_GRAV = 0.65;
  const BALL_R = 15, MAX_BALL_SPEED = 17;
  const P_SPEED = 5.2, BOT_SPEED = 4.6, JUMP_V = -13.5;

  const LS_STREAK = "ragdoll-soccer:streak";

  // ---- state ----
  let mode = 1;                       // 1 = vs bot, 2 = local 2P
  let state = "menu";                 // menu | kickoff | play | goal | over
  let stateT = 0;                     // frames in current state
  let scores = [0, 0];
  let goalSide = -1;                  // who conceded on the last goal (0 = left)
  let streak = Number(localStorage.getItem(LS_STREAK) || 0) || 0;
  let particles = [];
  let shake = 0;

  const input = [
    { left: false, right: false, jump: false, kick: false },
    { left: false, right: false, jump: false, kick: false },
  ];

  function makePlayer(side) {
    return {
      side, x: side === 0 ? 240 : W - 240, y: GROUND, vx: 0, vy: 0,
      onGround: true, facing: side === 0 ? 1 : -1,
      kickT: -1, kicked: false, legPhase: 0, jumpHeld: false,
      botKickCd: 0, botJumpCd: 0,
    };
  }
  let players = [makePlayer(0), makePlayer(1)];
  let ball = { x: W / 2, y: 200, vx: 0, vy: 0, rot: 0 };

  function resetPositions() {
    players = [makePlayer(0), makePlayer(1)];
    ball = { x: W / 2, y: 180, vx: 0, vy: 0, rot: 0 };
  }
  function startMatch(m) {
    mode = m; scores = [0, 0];
    resetPositions();
    state = "kickoff"; stateT = 0;
    initAudio(); sndWhistle();
  }

  // ========================== SOUND ==========================
  let actx = null;
  function initAudio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function tone(freq, dur, type, vol, when) {
    if (!actx) return;
    const t = actx.currentTime + (when || 0);
    const osc = actx.createOscillator(), gain = actx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol || 0.15, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.08));
    osc.connect(gain).connect(actx.destination);
    osc.start(t); osc.stop(t + (dur || 0.08) + 0.02);
  }
  function noise(dur, vol, when) {
    if (!actx) return;
    const t = actx.currentTime + (when || 0);
    const n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = actx.createBufferSource(); src.buffer = buf;
    const gain = actx.createGain(); gain.gain.value = vol || 0.1;
    src.connect(gain).connect(actx.destination);
    src.start(t);
  }
  function sndKick() { tone(140, 0.07, "sine", 0.3); noise(0.05, 0.12); }
  function sndBounce() { tone(220, 0.04, "sine", 0.12); }
  function sndHead() { tone(330, 0.06, "triangle", 0.2); }
  function sndGoal() {
    tone(523, 0.12, "square", 0.18); tone(659, 0.12, "square", 0.18, 0.12);
    tone(784, 0.22, "square", 0.2, 0.24); noise(0.8, 0.16);
  }
  function sndWhistle() { tone(2100, 0.28, "square", 0.08); }
  function sndWin() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, "square", 0.16, i * 0.13));
    noise(1.2, 0.18);
  }

  // ========================== UPDATE ==========================
  function update() {
    stateT++;
    if (shake > 0) shake *= 0.85;

    if (state === "menu") return;
    if (state === "kickoff" && stateT > 50) { state = "play"; stateT = 0; }
    if (state === "goal" && stateT > 80) { resetPositions(); state = "kickoff"; stateT = 0; }
    if (state === "over") { updateParticles(); return; }

    if (mode === 1) botThink(players[1], input[1]);

    for (const p of players) updatePlayer(p, input[p.side]);
    playersCollide();
    if (state === "play") updateBall();
    updateParticles();
  }

  function updatePlayer(p, inp) {
    const accel = 0.9 * (p.onGround ? 1 : 0.55);
    const top = p.side === 1 && mode === 1 ? BOT_SPEED : P_SPEED;
    if (inp.left) p.vx = Math.max(p.vx - accel, -top);
    else if (inp.right) p.vx = Math.min(p.vx + accel, top);
    else if (p.onGround) p.vx *= 0.78;

    if (inp.jump && p.onGround && !p.jumpHeld) { p.vy = JUMP_V; p.onGround = false; }
    p.jumpHeld = inp.jump;

    if (inp.kick && p.kickT < 0) { p.kickT = 0; p.kicked = false; }
    if (p.kickT >= 0 && ++p.kickT > 13) p.kickT = -1;

    p.vy += P_GRAV;
    p.x += p.vx; p.y += p.vy;
    if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.onGround = true; }
    p.x = Math.max(GOAL_D + 22, Math.min(W - GOAL_D - 22, p.x));
    if (p.onGround) p.legPhase += Math.abs(p.vx) * 0.16;
  }

  function playersCollide() {
    const [a, b] = players;
    const dx = b.x - a.x;
    if (Math.abs(dx) < 40 && Math.abs(a.y - b.y) < 70) {
      const push = (40 - Math.abs(dx)) / 2 * Math.sign(dx || 1);
      a.x -= push; b.x += push;
    }
  }

  // foot position during a kick swing (also the bot's aim reference)
  function footPos(p) {
    const t = Math.max(0, p.kickT) / 13;
    const swing = Math.sin(Math.min(1, t) * Math.PI);
    return { x: p.x + p.facing * (16 + swing * 34), y: p.y - 8 - swing * 22 };
  }

  function updateBall() {
    ball.vy += GRAV;
    ball.vx *= 0.999;
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > MAX_BALL_SPEED) { ball.vx *= MAX_BALL_SPEED / sp; ball.vy *= MAX_BALL_SPEED / sp; }
    ball.x += ball.vx; ball.y += ball.vy;
    ball.rot += ball.vx * 0.02;

    // ground
    if (ball.y + BALL_R > GROUND) {
      ball.y = GROUND - BALL_R;
      if (Math.abs(ball.vy) > 1.2) { ball.vy *= -0.72; sndBounce(); } else ball.vy = 0;
      ball.vx *= 0.985;
    }
    // ceiling + side walls (above the goal mouths the walls are solid)
    if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.vy *= -0.8; sndBounce(); }
    if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx *= -0.8; sndBounce(); }
    if (ball.x + BALL_R > W) { ball.x = W - BALL_R; ball.vx *= -0.8; sndBounce(); }

    // crossbars (solid tops of both goals)
    barCollide(0, GOAL_D + 4);
    barCollide(W - GOAL_D - 4, W);

    // players: head (bouncy, headers!), body (soft), kick foot (impulse)
    for (const p of players) {
      circleHit(p.x, p.y - 80, 20, 1.05, p, true);   // head
      circleHit(p.x, p.y - 42, 17, 0.6, p, false);   // body
      if (p.kickT >= 2 && p.kickT <= 10 && !p.kicked) {
        const f = footPos(p);
        if (Math.hypot(ball.x - f.x, ball.y - f.y) < BALL_R + 18) {
          ball.vx = p.facing * (11 + Math.abs(p.vx) * 0.6);
          ball.vy = -7.5 - (p.onGround ? 0 : 2);
          p.kicked = true; shake = 5; sndKick();
          burst(ball.x, ball.y, "#ffffff", 8);
        }
      }
    }

    // goals — ball fully inside the mouth, under the bar
    if (ball.x < GOAL_D - 8 && ball.y > BAR_Y + 10) scoreGoal(1);
    else if (ball.x > W - GOAL_D + 8 && ball.y > BAR_Y + 10) scoreGoal(0);
  }

  function barCollide(x0, x1) {
    // crossbar = thin horizontal capsule at BAR_Y spanning [x0, x1]
    const cx = Math.max(x0, Math.min(x1, ball.x));
    const dx = ball.x - cx, dy = ball.y - BAR_Y;
    const d = Math.hypot(dx, dy);
    if (d < BALL_R + 5 && d > 0.001) {
      const nx = dx / d, ny = dy / d;
      ball.x = cx + nx * (BALL_R + 5); ball.y = BAR_Y + ny * (BALL_R + 5);
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) { ball.vx -= 1.7 * dot * nx; ball.vy -= 1.7 * dot * ny; sndBounce(); }
    }
  }

  function circleHit(cx, cy, r, rest, p, isHead) {
    const dx = ball.x - cx, dy = ball.y - cy;
    const d = Math.hypot(dx, dy), min = BALL_R + r;
    if (d >= min || d < 0.001) return;
    const nx = dx / d, ny = dy / d;
    ball.x = cx + nx * min; ball.y = cy + ny * min;
    const rvx = ball.vx - p.vx, rvy = ball.vy - p.vy;
    const dot = rvx * nx + rvy * ny;
    if (dot < 0) {
      ball.vx = rvx - (1 + rest) * dot * nx + p.vx;
      ball.vy = rvy - (1 + rest) * dot * ny + p.vy * 0.7;
      if (isHead) {
        // headers get punch: guarantee real exit speed with an upward bias
        const out = Math.hypot(ball.vx, ball.vy);
        if (out < 8) { ball.vx = nx * 8; ball.vy = ny * 8 - 2; }
        ball.vy -= 1.5;
        sndHead(); burst(ball.x, ball.y, "#ffd166", 6); shake = 4;
      }
    }
  }

  function scoreGoal(scorer) {
    scores[scorer]++;
    goalSide = 1 - scorer;
    ball.vx *= 0.2; // dies in the net
    sndGoal(); shake = 10;
    burst(scorer === 0 ? W - GOAL_D / 2 : GOAL_D / 2, BAR_Y + 60, scorer === 0 ? "#f44336" : "#2196f3", 26);
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * W, y: -10 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2.5,
        life: 1.6, color: ["#ffd166", "#2196f3", "#f44336", "#ffffff", "#4caf50"][i % 5], conf: true,
      });
    }
    if (scores[scorer] >= TARGET) {
      state = "over"; stateT = 0; sndWin();
      if (mode === 1) endOfMatchStreak(scorer === 0);
    } else { state = "goal"; stateT = 0; }
  }

  function endOfMatchStreak(playerWon) {
    if (playerWon) {
      streak++;
      localStorage.setItem(LS_STREAK, String(streak));
      window.SoccerShell.submitStreak(streak);
    } else {
      if (streak > 0) window.SoccerShell.submitStreak(streak);
      streak = 0;
      localStorage.setItem(LS_STREAK, "0");
    }
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 1;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
    }
  }
  function updateParticles() {
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.conf) { p.vx += Math.sin(p.y * 0.05) * 0.08; p.life -= 0.008; }
      else { p.vy += 0.2; p.life -= 0.045; }
    }
    particles = particles.filter((p) => p.life > 0 && p.y < H + 20);
  }

  // ========================== BOT ==========================
  function botThink(p, inp) {
    inp.left = inp.right = inp.jump = inp.kick = false;
    if (state !== "play") return;
    p.botKickCd = Math.max(0, p.botKickCd - 1);
    p.botJumpCd = Math.max(0, p.botJumpCd - 1);

    // predict where the ball is drifting
    const bx = ball.x + ball.vx * 8;
    let target;
    if (bx > p.x + 10) target = bx + 30;      // ball behind → get goal-side of it
    else target = bx + 26;                    // stand just right of the ball to hit left
    target = Math.max(GOAL_D + 60, Math.min(W - GOAL_D - 26, target));

    if (Math.abs(target - p.x) > 12) { if (target < p.x) inp.left = true; else inp.right = true; }

    const dx = ball.x - p.x, dy = ball.y - (p.y - 60);
    // jump for high balls dropping nearby
    if (p.onGround && p.botJumpCd === 0 && Math.abs(dx) < 90 && ball.y < GROUND - 110 && ball.vy > -2) {
      inp.jump = true; p.botJumpCd = 40;
    }
    // kick when the ball sits in front of the boot
    const f = { x: p.x + p.facing * 34, y: p.y - 16 };
    if (p.botKickCd === 0 && Math.hypot(ball.x - f.x, ball.y - f.y) < 60 && ball.x < p.x + 20) {
      inp.kick = true; p.botKickCd = 26;
    }
    void dy;
  }

  // ========================== DRAW ==========================
  function draw() {
    ctx.save();
    if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawArena();
    drawGoal(0); drawGoal(1);
    for (const p of players) drawPlayer(p);
    drawBall();

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      if (p.conf) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.y * 0.05); ctx.fillRect(-4, -2, 8, 4); ctx.restore(); }
      else ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    }
    ctx.globalAlpha = 1;

    drawScoreboard();
    drawChips();

    if (state === "menu") drawMenu();
    else if (state === "kickoff") banner(scores[0] + scores[1] === 0 ? "KICK OFF!" : "GET READY…", "");
    else if (state === "goal") banner("GOAL!", "");
    else if (state === "over") drawOver();

    ctx.restore();
  }

  function drawArena() {
    // sky
    ctx.fillStyle = "#a9dcf2";
    ctx.fillRect(0, 0, W, GROUND);
    // hexagon pattern
    ctx.strokeStyle = "rgba(125, 180, 210, 0.45)";
    ctx.lineWidth = 1.5;
    const hr = 30, hw = hr * Math.sqrt(3);
    for (let row = 0; row * hr * 1.5 < GROUND + hr * 2; row++) {
      const y = row * hr * 1.5;
      const off = row % 2 ? hw / 2 : 0;
      for (let x = -hw; x < W + hw; x += hw) hexagon(x + off, y, hr);
    }
    // platform band (the arena floor's front face)
    ctx.fillStyle = "#8fc0d3";
    ctx.fillRect(0, GROUND, W, BAND_BOT - GROUND);
    ctx.strokeStyle = "rgba(90, 140, 165, 0.55)";
    ctx.lineWidth = 2;
    for (let y = GROUND + 21; y < BAND_BOT; y += 21) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let x = 0; x <= W; x += 99) { ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, BAND_BOT); ctx.stroke(); }
    // grass
    ctx.fillStyle = "#43a848";
    ctx.fillRect(0, BAND_BOT, W, H - BAND_BOT);
    // green corner triangles cutting the band (platform edge perspective)
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(TRAP, BAND_BOT); ctx.lineTo(0, BAND_BOT); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W, GROUND); ctx.lineTo(W - TRAP, BAND_BOT); ctx.lineTo(W, BAND_BOT); ctx.closePath(); ctx.fill();
    // ground line
    ctx.strokeStyle = "rgba(60, 105, 130, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
  }

  function hexagon(cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }

  function drawGoal(side) {
    const color = side === 0 ? "#2196f3" : "#f44336";
    const x0 = side === 0 ? 0 : W - GOAL_D;   // back edge at the wall
    const x1 = side === 0 ? GOAL_D : W;
    ctx.save();
    // net
    ctx.strokeStyle = color; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5;
    for (let x = x0 + 8; x < x1; x += 12) { ctx.beginPath(); ctx.moveTo(x, BAR_Y + 4); ctx.lineTo(x, GROUND); ctx.stroke(); }
    for (let y = BAR_Y + 10; y < GROUND; y += 12) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // frame: crossbar + back post + front stub
    ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, BAR_Y); ctx.lineTo(x1, BAR_Y); ctx.stroke();           // crossbar
    const backX = side === 0 ? 3 : W - 3;
    ctx.beginPath(); ctx.moveTo(backX, BAR_Y); ctx.lineTo(backX, GROUND); ctx.stroke();    // back post
    const frontX = side === 0 ? GOAL_D : W - GOAL_D;
    ctx.beginPath(); ctx.moveTo(frontX, BAR_Y); ctx.lineTo(frontX, BAR_Y + 16); ctx.stroke(); // front stub
    ctx.restore();
  }

  function drawPlayer(p) {
    const color = p.side === 0 ? "#1565c0" : "#d32f2f";
    const hipY = p.y - 38, shY = p.y - 62, headY = p.y - 80;
    const run = p.onGround && Math.abs(p.vx) > 0.4 ? Math.sin(p.legPhase) : 0;
    ctx.save();
    ctx.lineCap = "round";

    // legs
    ctx.strokeStyle = "#233"; ctx.lineWidth = 7;
    const swing = p.kickT >= 0 ? Math.sin((p.kickT / 13) * Math.PI) : 0;
    // back leg
    ctx.beginPath(); ctx.moveTo(p.x, hipY);
    ctx.lineTo(p.x - p.facing * (10 + run * 10), p.y - (p.onGround ? 0 : 6)); ctx.stroke();
    // front leg (the kicking one)
    const f = p.kickT >= 0 ? footPos(p) : { x: p.x + p.facing * (10 - run * 10), y: p.y };
    ctx.beginPath(); ctx.moveTo(p.x, hipY); ctx.lineTo(f.x, f.y); ctx.stroke();
    // boots
    ctx.fillStyle = "#233";
    ctx.beginPath(); ctx.arc(f.x, f.y, 5.5, 0, Math.PI * 2); ctx.fill();

    // torso (jersey)
    ctx.strokeStyle = color; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(p.x, hipY); ctx.lineTo(p.x, shY); ctx.stroke();

    // arms
    ctx.strokeStyle = color; ctx.lineWidth = 6;
    const armA = p.kickT >= 0 ? -0.9 : run * 0.7;
    ctx.beginPath(); ctx.moveTo(p.x, shY);
    ctx.lineTo(p.x + p.facing * Math.cos(armA) * 18, shY + 16 + Math.sin(armA) * 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x, shY);
    ctx.lineTo(p.x - p.facing * Math.cos(-armA) * 18, shY + 16 + Math.sin(-armA) * 8); ctx.stroke();

    // head
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#233"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, headY, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // eyes toward the ball
    const ea = Math.atan2(ball.y - headY, ball.x - p.x);
    ctx.fillStyle = "#233";
    ctx.beginPath(); ctx.arc(p.x + Math.cos(ea) * 7 + p.facing * 2, headY + Math.sin(ea) * 5 - 1, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + Math.cos(ea) * 7 + p.facing * 9, headY + Math.sin(ea) * 5 - 1, 2.6, 0, Math.PI * 2); ctx.fill();
    // headband in team color
    ctx.strokeStyle = color; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(p.x, headY, 17, Math.PI + 0.5, -0.5); ctx.stroke();
    ctx.restore();
  }

  function drawBall() {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rot);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#222"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#222";
    pent(0, 0, 5.5);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      pent(Math.cos(a) * 10.5, Math.sin(a) * 10.5, 3.6);
    }
    ctx.restore();
  }
  function pent(cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }

  function drawScoreboard() {
    const bw = 66, bh = 56, gap = 120;
    for (let s = 0; s < 2; s++) {
      const cx = W / 2 + (s === 0 ? -gap : gap);
      ctx.fillStyle = "#111";
      ctx.fillRect(cx - bw / 2, 18, bw, bh);
      ctx.fillStyle = s === 0 ? "#2196f3" : "#f44336";
      ctx.fillRect(cx - bw / 2, 18 + bh, bw, 5);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 40px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(scores[s]), cx, 18 + bh / 2 + 2);
    }
  }

  function drawChips() {
    const nameL = window.SoccerShell.playerName || "Player";
    const nameR = mode === 1 ? "Bot" : "Player 2";
    chip(16, 16, nameL, "#1565c0", false);
    chip(W - 16, 16, nameR, "#d32f2f", true);
  }
  function chip(x, y, name, color, rightAlign) {
    const box = 46;
    const bx = rightAlign ? x - box : x;
    ctx.save();
    ctx.fillStyle = "rgba(10, 30, 50, 0.55)";
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.fillRect(bx, y, box, box); ctx.strokeRect(bx, y, box, box);
    // mini stick figure
    const mx = bx + box / 2, my = y + 12;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, my + 6); ctx.lineTo(mx, my + 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx - 7, my + 13); ctx.lineTo(mx + 7, my + 13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, my + 20); ctx.lineTo(mx - 6, my + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, my + 20); ctx.lineTo(mx + 6, my + 30); ctx.stroke();
    // name
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.textAlign = rightAlign ? "right" : "left"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(20,40,60,0.8)";
    const tx = rightAlign ? bx - 10 : bx + box + 10;
    ctx.strokeText(name, tx, y + box / 2);
    ctx.fillStyle = "#fff";
    ctx.fillText(name, tx, y + box / 2);
    void color;
    ctx.restore();
  }

  function banner(title, sub) {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold 64px system-ui, sans-serif";
    ctx.lineWidth = 8; ctx.strokeStyle = "rgba(20,50,80,0.85)";
    ctx.strokeText(title, W / 2, 200);
    ctx.fillStyle = "#ffd166";
    ctx.fillText(title, W / 2, 200);
    if (sub) {
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.lineWidth = 5; ctx.strokeStyle = "rgba(20,50,80,0.85)";
      ctx.strokeText(sub, W / 2, 254);
      ctx.fillStyle = "#fff"; ctx.fillText(sub, W / 2, 254);
    }
    ctx.restore();
  }

  // clickable button zones, recomputed each draw
  let buttons = [];
  function drawBtn(label, cx, cy, w, h, action) {
    ctx.save();
    ctx.fillStyle = "#2e9e57"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 12) : ctx.rect(cx - w / 2, cy - h / 2, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 26px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy + 1);
    ctx.restore();
    buttons.push({ x: cx - w / 2, y: cy - h / 2, w, h, action });
  }

  function drawMenu() {
    buttons = [];
    ctx.fillStyle = "rgba(20, 50, 80, 0.35)";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold 76px system-ui, sans-serif";
    ctx.lineWidth = 10; ctx.strokeStyle = "rgba(20,50,80,0.9)";
    ctx.strokeText("RAGDOLL SOCCER", W / 2, 150);
    ctx.fillStyle = "#ffd166"; ctx.fillText("RAGDOLL SOCCER", W / 2, 150);
    ctx.restore();

    drawBtn("1 PLAYER", W / 2, 260, 260, 58, () => startMatch(1));
    drawBtn("2 PLAYERS", W / 2, 340, 260, 58, () => startMatch(2));

    ctx.save();
    ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.font = "bold 17px system-ui, sans-serif";
    ctx.fillText("First to " + TARGET + " goals wins — score with your head or a big kick!", W / 2, 408);
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("P1: A / D move · W jump · S kick        P2: ◀ / ▶ move · ▲ jump · ▼ kick", W / 2, 550);
    ctx.fillText("(solo you can also use the arrow keys — or the touch buttons on a phone)", W / 2, 574);
    ctx.restore();
  }

  function drawOver() {
    buttons = [];
    ctx.fillStyle = "rgba(20, 50, 80, 0.45)";
    ctx.fillRect(0, 0, W, H);
    const playerWon = scores[0] > scores[1];
    const title = mode === 1 ? (playerWon ? "YOU WIN! 🏆" : "BOT WINS") : (playerWon ? "PLAYER 1 WINS! 🏆" : "PLAYER 2 WINS! 🏆");
    banner(title, scores[0] + " – " + scores[1]);
    if (mode === 1) {
      ctx.save();
      ctx.textAlign = "center"; ctx.font = "bold 20px system-ui, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText(playerWon ? "Win streak: " + streak : "Streak over — back to 0", W / 2, 300);
      ctx.restore();
    }
    drawBtn("REMATCH", W / 2 - 90, 380, 160, 52, () => startMatch(mode));
    drawBtn("MENU", W / 2 + 90, 380, 160, 52, () => { state = "menu"; stateT = 0; resetPositions(); scores = [0, 0]; });
  }

  // ========================== INPUT ==========================
  const keys = {};
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    keys[k] = true;
    if (state === "menu") { if (k === "1") startMatch(1); if (k === "2") startMatch(2); }
    if (state === "over" && (k === " " || k === "enter")) startMatch(mode);
    initAudio();
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  const touch = { left: false, right: false, jump: false, kick: false };
  function bindTouch(id, prop) {
    const b = document.getElementById(id);
    const on = (e) => { e.preventDefault(); touch[prop] = true; initAudio(); };
    const off = (e) => { e.preventDefault(); touch[prop] = false; };
    b.addEventListener("touchstart", on, { passive: false });
    b.addEventListener("touchend", off, { passive: false });
    b.addEventListener("touchcancel", off, { passive: false });
    b.addEventListener("mousedown", on);
    b.addEventListener("mouseup", off);
  }
  bindTouch("tLeft", "left"); bindTouch("tRight", "right");
  bindTouch("tJump", "jump"); bindTouch("tKick", "kick");
  window.addEventListener("touchstart", () => document.body.classList.add("touch"), { once: true, passive: true });

  function readInputs() {
    const soloArrows = mode === 1; // solo: arrows drive P1 too
    input[0].left = keys["a"] || (soloArrows && keys["arrowleft"]) || touch.left;
    input[0].right = keys["d"] || (soloArrows && keys["arrowright"]) || touch.right;
    input[0].jump = keys["w"] || (soloArrows && keys["arrowup"]) || touch.jump;
    input[0].kick = keys["s"] || keys[" "] || (soloArrows && keys["arrowdown"]) || touch.kick;
    if (mode === 2) {
      input[1].left = !!keys["arrowleft"];
      input[1].right = !!keys["arrowright"];
      input[1].jump = !!keys["arrowup"];
      input[1].kick = !!keys["arrowdown"];
    }
  }

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: cx * (W / r.width), y: cy * (H / r.height) };
  }
  function handleTap(e) {
    if (state !== "menu" && state !== "over") return;
    const pt = canvasPoint(e);
    for (const b of buttons) {
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
        e.preventDefault(); initAudio(); b.action(); return;
      }
    }
  }
  canvas.addEventListener("mousedown", handleTap);
  canvas.addEventListener("touchstart", handleTap, { passive: false });

  // ========================== LOOP ==========================
  function frame() {
    readInputs();
    update();
    draw();
    requestAnimationFrame(frame);
  }
  frame();
})();
