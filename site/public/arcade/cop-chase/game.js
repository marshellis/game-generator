(() => {
'use strict';

// ============================================================
// Canvas & sizing
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mirrorCanvas = document.getElementById('mirror');
const mirrorCtx = mirrorCanvas.getContext('2d');

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // Road should always read as ~52% of screen width regardless of device — a fixed
  // world-to-pixel rate would make the road too wide on narrow phones (pushing the
  // whole city off both edges) and too narrow on wide desktop windows.
  WORLD_PX = (0.52 * W) / (ROAD_HALF * 2);
}
window.addEventListener('resize', resize);

// ============================================================
// RNG helpers (deterministic per-index scenery, non-deterministic gameplay)
// ============================================================
function seededRand(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function seededRange(n, lo, hi) { return lo + seededRand(n) * (hi - lo); }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// ============================================================
// World / road constants
// ============================================================
const SEG_LEN = 200;
const ROAD_HALF = 1150;
const SIDEWALK_HALF = 1750;
const OFFROAD_LIMIT = 1750;
const LANE_W = ROAD_HALF * 2 / 3;

// Top-down bird's-eye camera: flat orthographic scroll, no perspective. World units
// convert to pixels at a constant rate (derived from canvas width in resize(), so
// the road reads the same relative size on a phone as on a desktop window), and the
// player sits at a fixed screen anchor with the world scrolling past — everything
// (buildings, cars) stays true-size regardless of "distance."
let WORLD_PX = 0.16;
const ANCHOR_Y_FRAC = 0.62; // player's fixed screen position, as a fraction of height
const AHEAD_SEGS = 24;
const BEHIND_SEGS = 16;

const CAR_W = 170, CAR_LEN = 260, CAR_H = 145;

// ============================================================
// Input
// ============================================================
const input = { left: false, right: false, up: false, down: false };
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': input.left = true; break;
    case 'ArrowRight': case 'KeyD': input.right = true; break;
    case 'ArrowUp': case 'KeyW': input.up = true; break;
    case 'ArrowDown': case 'KeyS': input.down = true; break;
    case 'Space': case 'Enter':
      if (state.mode === 'start') startGame();
      else if (state.mode === 'gameover') startGame();
      break;
  }
});
window.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': input.left = false; break;
    case 'ArrowRight': case 'KeyD': input.right = false; break;
    case 'ArrowUp': case 'KeyW': input.up = false; break;
    case 'ArrowDown': case 'KeyS': input.down = false; break;
  }
});
const touchLeft = document.getElementById('touch-left');
const touchRight = document.getElementById('touch-right');
function bindHold(el, onFlag) {
  const down = (e) => { e.preventDefault(); onFlag(true); };
  const up = (e) => { e.preventDefault(); onFlag(false); };
  el.addEventListener('touchstart', down, { passive: false });
  el.addEventListener('touchend', up, { passive: false });
  el.addEventListener('touchcancel', up, { passive: false });
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
}
bindHold(touchLeft, (v) => { input.left = v; });
bindHold(touchRight, (v) => { input.right = v; });

// A key/pointer release missed while focus is elsewhere (alt-tab, a dragged
// touch leaving its zone) would otherwise leave a control stuck "held" forever.
function clearInputs() { input.left = input.right = input.up = input.down = false; }
window.addEventListener('blur', clearInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInputs(); });

// ============================================================
// Audio (WebAudio, lazily started on first gesture)
// ============================================================
let actx = null, engineOsc, engineGain, engineFilter;
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    engineOsc = actx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineFilter = actx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 500;
    engineGain = actx.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(actx.destination);
    engineOsc.frequency.value = 60;
    engineOsc.start();
  } catch (err) { actx = null; }
}
function playCrash() {
  if (!actx) return;
  const t = actx.currentTime;
  const bufSize = actx.sampleRate * 0.5;
  const buf = actx.createBuffer(1, bufSize, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
  const noise = actx.createBufferSource();
  noise.buffer = buf;
  const g = actx.createGain();
  g.gain.value = 0.55;
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1400;
  noise.connect(lp).connect(g).connect(actx.destination);
  noise.start(t);
  const thud = actx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(120, t);
  thud.frequency.exponentialRampToValueAtTime(30, t + 0.35);
  const tg = actx.createGain();
  tg.gain.setValueAtTime(0.6, t);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  thud.connect(tg).connect(actx.destination);
  thud.start(t); thud.stop(t + 0.4);
}
function playRam() {
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + 0.2);
}

// ============================================================
// Game state
// ============================================================
const state = {
  mode: 'start', // start | playing | crashing | gameover
  runTime: 0,
  crashTimer: 0,
  shake: 0,
  flash: 0,
};

const HEALTH_MAX = 100;
const MAX_HIT_DAMAGE = 20;

const player = {
  z: 0,
  lateral: 0,
  lateralVel: 0,
  speed: 0,
  baseSpeed: 2600,
  maxSpeed: 9200,
  nitro: 1,
  braking: false,
  boosting: false,
  lean: 0,
  impactSpin: 0, // extra rotation kicked in by a hit, decays back to 0 — the "little physics" wobble
  wobble: 0,
  invuln: 0,
  health: HEALTH_MAX,
};

// A hit's damage scales with how hard it was (the input is a speed-like quantity —
// player speed for a plain collision, a cop's ram power for a ram), clamped to a
// 3-20 range so a light graze and a full-speed slam feel meaningfully different.
function impactDamage(speedLike, divisor) {
  return clamp(Math.round(speedLike / divisor), 3, MAX_HIT_DAMAGE);
}

let bestScore = Number(localStorage.getItem('cop-chase:best') || 0);
document.getElementById('best-val').textContent = Math.floor(bestScore);

let traffic = [];
let cops = [];
let hazards = [];
let jaywalkers = [];
let particles = [];
let copIdSeq = 1;

const director = {
  elapsed: 0,
  wanted: 0,
  heat: 0,
  copSpawnCooldown: 3.5,
  trafficSpawnCooldown: 2.5,
  hazardSpawnCooldown: 14,
  jaywalkCooldown: 14,
  boxTimer: 0,
};

// ============================================================
// Reset / start / end
// ============================================================
function resetGame() {
  player.z = 0;
  player.lateral = 0;
  player.lateralVel = 0;
  player.speed = player.baseSpeed;
  player.nitro = 1;
  player.braking = false;
  player.boosting = false;
  player.lean = 0;
  player.impactSpin = 0;
  player.wobble = 0;
  player.invuln = 2.2;
  player.health = HEALTH_MAX;
  traffic = [];
  cops = [];
  hazards = [];
  jaywalkers = [];
  particles = [];
  curveState.target = 0;
  curveState.remaining = 0;
  curveState.current = 0;
  curveCache.clear();
  nextCurveIndex = 0;
  curveAccumCache.clear();
  curveAccumCache.set(0, 0);
  nextAccumIndex = 1;
  director.elapsed = 0;
  director.wanted = 0;
  director.heat = 0;
  director.copSpawnCooldown = 9;
  director.trafficSpawnCooldown = 2.5;
  director.hazardSpawnCooldown = 22;
  director.jaywalkCooldown = 16;
  director.boxTimer = 0;
  state.shake = 0;
  state.flash = 0;
  state.crashTimer = 0;
}

function startGame() {
  initAudio();
  resetGame();
  state.mode = 'playing';
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
}

function endGame(reason) {
  if (state.mode !== 'playing') return;
  state.mode = 'crashing';
  state.crashTimer = 0;
  state.crashReason = reason;
  playCrash();
  state.shake = 26;
  state.flash = 1;
  spawnCrashParticles();
  if (engineGain) engineGain.gain.setTargetAtTime(0, actx.currentTime, 0.1);
}

function showGameOver() {
  state.mode = 'gameover';
  const score = Math.floor(player.z / 10);
  const isBest = score > bestScore;
  if (isBest) {
    bestScore = score;
    localStorage.setItem('cop-chase:best', String(bestScore));
    el.best.textContent = Math.floor(bestScore);
  }
  document.getElementById('busted-title').textContent = state.crashReason === 'busted' ? 'BUSTED' : 'WRECKED';
  document.getElementById('gameover-reason').textContent = state.crashReason === 'busted'
    ? 'The cops boxed you in.'
    : (state.crashReason || 'You wrecked the car.');
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-best').textContent = bestScore;
  document.getElementById('new-best').classList.toggle('hidden', !isBest);
  document.getElementById('gameover-screen').classList.remove('hidden');
}

// One of the player's 5 hearts. Busted (boxed in by cops) bypasses this and ends
// the run directly — being arrested isn't a "hit" you can shrug off.
// damage: 3-20 (see impactDamage) — how much of the 100 HP bar this hit costs.
// lateralImpulse: world-units/sec to kick into player.lateralVel; omit for a hit with
// no clear "push direction" (a straight rear-end), which gets a small random shove
// instead — a graze deflects you a little sideways rather than launching you straight.
function takeHit(reason, damage, lateralImpulse) {
  if (state.mode !== 'playing' || player.invuln > 0) return;
  damage = damage == null ? 10 : damage;
  player.health = Math.max(0, player.health - damage);
  player.invuln = 1.5;
  player.lateral = clamp(player.lateral, -OFFROAD_LIMIT - 100, OFFROAD_LIMIT + 100);

  const impulse = lateralImpulse != null ? lateralImpulse : (Math.random() < 0.5 ? -1 : 1) * (260 + damage * 26);
  player.lateralVel = player.lateralVel * -0.3 + impulse;
  // a spin that fights the steering lean for a moment, then decays away in updatePlayer —
  // the "little physics" of a hit knocking the car briefly sideways
  player.impactSpin += Math.sign(impulse || 1) * clamp(damage * 0.022, 0.05, 0.55);
  // a hard hit visibly costs speed too, not just a lateral shove; it recovers on its own
  // via the normal speed lerp toward baseSpeed over the following second or so
  player.speed *= 1 - clamp(damage / 40, 0, 0.5);

  const mag = 0.3 + (damage / MAX_HIT_DAMAGE) * 0.9;
  state.shake = Math.max(state.shake, 8 + damage * 0.9);
  state.flash = Math.max(state.flash, 0.15 + damage * 0.025);
  playRam();
  spawnHitParticles(mag);
  if (player.health <= 0) endGame(reason);
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// ============================================================
// Scenery (stateless, derived from segment index — purely decorative)
// ============================================================
const BUILDING_SPACING = 3; // every N segments
const LAMP_SPACING = 5;
const PED_SPACING = 2;
const BUILDING_PALETTE = ['#2a3244', '#232a3a', '#2e2438', '#26313f', '#332a3d', '#243542'];
const HOUSE_PALETTE = ['#6b4a3a', '#8a5a42', '#5c6b4a', '#7a5548', '#4a5a6b', '#8a6b4a'];
const NEON_PALETTE = ['#ff5fae', '#4fe0ff', '#ffd23f', '#7dff6b', '#ff6b6b'];
const OUTFIT_PALETTE = ['#e0533d', '#3d7de0', '#e0c53d', '#5ee0a0', '#c15ee0', '#e0895e', '#6b6b78', '#e8e8ea'];

// Blends from a short residential street (segIndex ~0) into the tall downtown
// skyline over a transition band beyond NEIGHBORHOOD_SEGS.
function buildingAt(segIndex, side) {
  // side: -1 left, +1 right. Returns null sometimes (gaps for variety).
  if (segIndex % BUILDING_SPACING !== 0) return null;
  const seed = segIndex * 17 + (side > 0 ? 91 : 3);
  if (seededRand(seed) < 0.08) return null; // gap / alley
  const cityT = clamp((segIndex - NEIGHBORHOOD_SEGS) / 55, 0, 1);
  const house = cityT < 0.5;
  const height = lerp(seededRange(seed + 1, 190, 430), seededRange(seed + 1, 900, 3400), cityT);
  const width = lerp(seededRange(seed + 2, 480, 720), seededRange(seed + 2, 600, 1000), cityT);
  const palette = house ? HOUSE_PALETTE : BUILDING_PALETTE;
  const color = palette[Math.floor(seededRand(seed + 3) * palette.length)];
  const neon = !house && seededRand(seed + 4) < 0.22 ? NEON_PALETTE[Math.floor(seededRand(seed + 5) * NEON_PALETTE.length)] : null;
  const litRatio = seededRange(seed + 6, 0.2, 0.6);
  const antenna = !house && seededRand(seed + 7) < 0.3;
  const porchLight = house && seededRand(seed + 8) < 0.6;
  return { seed, height, width, color, neon, litRatio, antenna, house, porchLight, offset: SIDEWALK_HALF + width / 2 + 40 };
}

function lampAt(segIndex, side) {
  if (segIndex % LAMP_SPACING !== 0) return null;
  return { offset: ROAD_HALF + 90 };
}

function pedAt(segIndex) {
  if (segIndex % PED_SPACING !== 0) return null;
  const seed = segIndex * 53 + 211;
  if (seededRand(seed) < 0.45) return null;
  const side = seededRand(seed + 9) < 0.5 ? -1 : 1;
  const off = seededRange(seed + 1, ROAD_HALF + 160, SIDEWALK_HALF - 90);
  const outfit = OUTFIT_PALETTE[Math.floor(seededRand(seed + 2) * OUTFIT_PALETTE.length)];
  const phase = seededRange(seed + 3, 0, Math.PI * 2);
  const scale = seededRange(seed + 4, 0.85, 1.15);
  return { side, offset: off, outfit, phase, scale };
}

// ============================================================
// Road curve generation (infinite, smooth stretches)
// ============================================================
// First stretch out of the driveway: a tight, twisty residential grid. Beyond it,
// the road opens up into long sweeping avenue curves as the city gets denser.
const NEIGHBORHOOD_SEGS = 46;
const curveState = { target: 0, remaining: 0, current: 0 };
function nextCurveSegment(idx) {
  const inHood = idx < NEIGHBORHOOD_SEGS;
  if (curveState.remaining <= 0) {
    const r = Math.random();
    if (inHood) {
      curveState.target = r < 0.12 ? 0 : rand(-0.5, 0.5) * (r < 0.75 ? 1 : 1.4);
      curveState.remaining = Math.floor(rand(9, 20));
    } else {
      curveState.target = r < 0.45 ? 0 : rand(-0.35, 0.35) * (r < 0.7 ? 1 : 1.6);
      curveState.remaining = Math.floor(rand(35, 85));
    }
  }
  curveState.current = lerp(curveState.current, curveState.target, inHood ? 0.1 : 0.045);
  curveState.remaining--;
  return curveState.current;
}
const curveCache = new Map();
let nextCurveIndex = 0;
function curveOfSegment(index) {
  if (curveCache.has(index)) return curveCache.get(index);
  // generate sequentially so the smoothing state stays consistent
  while (nextCurveIndex <= index) {
    curveCache.set(nextCurveIndex, nextCurveSegment(nextCurveIndex));
    nextCurveIndex++;
  }
  if (curveCache.size > 4000) {
    // trim old entries far behind the player
    const minKeep = Math.floor(player.z / SEG_LEN) - 200;
    for (const k of curveCache.keys()) { if (k < minKeep) curveCache.delete(k); else break; }
  }
  return curveCache.get(index);
}

// ============================================================
// Road-center world position (curve is cosmetic, same bounded-drift model as
// before — accumulated once per segment boundary and cached, since both the road
// ribbon and every entity's screen X need to read it many times per frame).
// ============================================================
const CURVE_SCALE = 130;
const curveAccumCache = new Map([[0, 0]]);
let nextAccumIndex = 1;
function curveAccumAt(idx) {
  idx = Math.max(0, idx);
  while (nextAccumIndex <= idx) {
    const prev = curveAccumCache.get(nextAccumIndex - 1);
    curveAccumCache.set(nextAccumIndex, prev + curveOfSegment(nextAccumIndex - 1) * CURVE_SCALE);
    nextAccumIndex++;
  }
  if (curveAccumCache.size > 3000) {
    const minKeep = Math.floor(player.z / SEG_LEN) - BEHIND_SEGS - 10;
    for (const k of curveAccumCache.keys()) { if (k < minKeep) curveAccumCache.delete(k); else break; }
  }
  return curveAccumCache.get(idx);
}
function roadCenterX(z) {
  const idxF = Math.max(0, z / SEG_LEN);
  const i0 = Math.floor(idxF);
  const frac = idxF - i0;
  return lerp(curveAccumAt(i0), curveAccumAt(i0 + 1), frac);
}

// ============================================================
// Projection (flat top-down — no perspective, just world units to pixels)
// ============================================================
function worldToScreen(lateral, z) {
  const dx = (lateral - player.lateral) + (roadCenterX(z) - roadCenterX(player.z));
  return {
    x: W / 2 + dx * WORLD_PX,
    y: H * ANCHOR_Y_FRAC - (z - player.z) * WORLD_PX,
  };
}

// ============================================================
// Entity spawning
// ============================================================
const SPAWN_AHEAD = AHEAD_SEGS * SEG_LEN;
function spawnTraffic() {
  const aheadZ = player.z + SPAWN_AHEAD * rand(0.55, 0.95);
  const lat = pick([-1, 0, 1]) * LANE_W + rand(-120, 120);
  traffic.push({
    z: aheadZ,
    lateral: lat,
    speed: player.baseSpeed * rand(0.45, 0.68),
    color: pick(['#c94c4c', '#4c8ac9', '#c9b04c', '#7a7a86', '#e8e8ea', '#3f9e5f']),
    w: CAR_W, len: CAR_LEN,
  });
}

function spawnCop(tier) {
  cops.push({
    id: copIdSeq++,
    z: player.z - rand(1200, 2600),
    lateral: rand(-ROAD_HALF * 0.6, ROAD_HALF * 0.6),
    speed: player.baseSpeed,
    tier,
    state: 'approach',
    ramCooldown: rand(1.2, 2.4),
    boxT: 0,
    lightPhase: Math.random() * Math.PI * 2,
  });
}

function spawnHazard() {
  const gapSide = pick([-1, 1]);
  hazards.push({
    z: player.z + SPAWN_AHEAD * 0.8,
    gapCenter: gapSide * ROAD_HALF * 0.55,
    gapWidth: Math.max(CAR_W * 1.9, ROAD_HALF * 1.1 - director.heat * 260),
  });
}

function spawnJaywalker() {
  const fromLeft = Math.random() < 0.5;
  jaywalkers.push({
    z: player.z + SPAWN_AHEAD * rand(0.35, 0.55),
    lateral: fromLeft ? -SIDEWALK_HALF + 60 : SIDEWALK_HALF - 60,
    vx: (fromLeft ? 1 : -1) * rand(340, 480),
    outfit: pick(OUTFIT_PALETTE),
    warned: false,
  });
}

function spawnHitParticles(mag) {
  const ox = W / 2 + rand(-30, 30), oy = H * ANCHOR_Y_FRAC + rand(-20, 10);
  const n = Math.round(16 * mag);
  for (let i = 0; i < n; i++) {
    particles.push({
      x: ox, y: oy,
      vx: rand(-320, 320) * mag, vy: rand(-360, -60) * mag,
      life: rand(0.35, 0.75), age: 0,
      color: pick(['#ffe08a', '#ffb04f', '#fff2c9']),
      size: rand(2, 5) * mag, kind: 'spark',
    });
  }
  for (let i = 0; i < Math.round(6 * mag); i++) {
    particles.push({
      x: ox + rand(-16, 16), y: oy,
      vx: rand(-60, 60), vy: rand(-140, -60),
      life: rand(0.5, 0.9), age: 0,
      color: 'rgba(180,180,190,0.6)',
      size: rand(6, 12) * mag, kind: 'smoke', grow: rand(18, 30),
    });
  }
}

function spawnCrashParticles() {
  spawnHitParticles(1.8);
  for (let i = 0; i < 16; i++) {
    particles.push({
      x: W / 2 + rand(-30, 30), y: H * ANCHOR_Y_FRAC + rand(-20, 10),
      vx: rand(-260, 260), vy: rand(-320, -40),
      life: rand(0.5, 1.1), age: 0,
      color: pick(['#ffcf5f', '#ff6b3f', '#bfbfbf', '#ffffff']),
      size: rand(3, 8), kind: 'spark',
    });
  }
}

// ============================================================
// Director (difficulty escalation)
// ============================================================
const GRACE_PERIOD = 12; // seconds of cop-free driving at the start of every run
function updateDirector(dt) {
  director.elapsed += dt;
  director.wanted = director.elapsed < GRACE_PERIOD ? 0 : clamp(1 + Math.floor((director.elapsed - GRACE_PERIOD) / 20), 1, 5);
  director.heat = clamp((director.elapsed - GRACE_PERIOD) / 130, 0, 1) + Math.max(0, (director.elapsed - GRACE_PERIOD - 130) / 900);

  player.baseSpeed = Math.min(player.maxSpeed, 2600 + director.elapsed * 30);

  // cops
  const targetCops = director.wanted + (director.heat > 0.6 ? 1 : 0);
  director.copSpawnCooldown -= dt;
  if (cops.length < targetCops && director.copSpawnCooldown <= 0) {
    let tier = 1;
    if (director.wanted >= 3 && Math.random() < 0.5) tier = 2;
    if (director.wanted >= 5 && Math.random() < 0.35) tier = 3;
    spawnCop(tier);
    director.copSpawnCooldown = clamp(3.0 - director.heat * 1.8, 0.8, 3.0);
  }
  // despawn cops far behind
  cops = cops.filter(c => c.z > player.z - 5200 && c.state !== 'gone');

  // traffic
  director.trafficSpawnCooldown -= dt;
  if (director.trafficSpawnCooldown <= 0) {
    spawnTraffic();
    director.trafficSpawnCooldown = clamp(2.3 - director.heat * 1.6, 0.55, 2.3);
  }
  traffic = traffic.filter(t => t.z > player.z - 800);

  // hazards (roadblocks) - unlock at wanted 4+
  if (director.wanted >= 4) {
    director.hazardSpawnCooldown -= dt;
    if (director.hazardSpawnCooldown <= 0) {
      spawnHazard();
      director.hazardSpawnCooldown = rand(11, 17) - director.heat * 4;
    }
  }
  hazards = hazards.filter(h => h.z > player.z - 800);

  // jaywalkers
  director.jaywalkCooldown -= dt;
  if (director.jaywalkCooldown <= 0) {
    spawnJaywalker();
    director.jaywalkCooldown = rand(7, 13) - director.heat * 3;
  }
  jaywalkers = jaywalkers.filter(j => j.z > player.z - 800 && Math.abs(j.lateral) < SIDEWALK_HALF + 200);
}

// ============================================================
// Player update
// ============================================================
function updatePlayer(dt) {
  player.braking = input.down;
  player.boosting = input.up && player.nitro > 0.02;

  if (player.boosting) {
    player.nitro = Math.max(0, player.nitro - dt * 0.42);
  } else {
    player.nitro = Math.min(1, player.nitro + dt * 0.10);
  }

  let targetSpeed = player.baseSpeed;
  if (player.braking) targetSpeed *= 0.48;
  if (player.boosting) targetSpeed += 2600;
  player.speed = lerp(player.speed, targetSpeed, dt * 2.4);

  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const steerAccel = 9200;
  player.lateralVel = lerp(player.lateralVel, steer * 1900, dt * 6);
  player.lateral += player.lateralVel * dt;
  player.lean = lerp(player.lean, steer * 0.24 + clamp(player.lateralVel / 4200, -0.18, 0.18), dt * 8);
  player.impactSpin = lerp(player.impactSpin, 0, dt * 5); // the hit-spin settles back out over ~0.3-0.5s

  const hardLimit = OFFROAD_LIMIT + 260;
  if (player.lateral > hardLimit || player.lateral < -hardLimit) {
    const dmg = impactDamage(player.speed, 480);
    takeHit('You slammed into a storefront.', dmg, -Math.sign(player.lateral) * (300 + dmg * 24));
  }
  if (Math.abs(player.lateral) > OFFROAD_LIMIT) {
    player.speed *= 0.985; // sidewalk drag
    state.shake = Math.max(state.shake, 3);
  }

  player.z += player.speed * dt;
  player.invuln = Math.max(0, player.invuln - dt);
  player.wobble += dt;

  if (engineGain && actx) {
    const ratio = player.speed / player.maxSpeed;
    engineOsc.frequency.setTargetAtTime(55 + ratio * 220, actx.currentTime, 0.08);
    engineFilter.frequency.setTargetAtTime(400 + ratio * 2200, actx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(0.05 + ratio * 0.05, actx.currentTime, 0.08);
  }
}

// ============================================================
// Traffic / hazard / jaywalker update + collisions
// ============================================================
const COLLIDE_Z = 210;
function rectsOverlapLateral(aLat, aW, bLat, bW) {
  return Math.abs(aLat - bLat) < (aW + bW) / 2;
}

function updateTraffic(dt) {
  for (const t of traffic) {
    t.z += (t.speed - player.speed) * dt;
    if (Math.abs(t.z - player.z) < COLLIDE_Z &&
        rectsOverlapLateral(player.lateral, CAR_W * 0.9, t.lateral, t.w * 0.9)) {
      takeHit('You rear-ended traffic.', impactDamage(Math.abs(player.speed - t.speed), 420));
    }
  }
}

function updateHazards(dt) {
  for (const h of hazards) {
    h.z -= player.speed * dt;
    if (Math.abs(h.z - player.z) < COLLIDE_Z * 0.8) {
      const inGap = Math.abs(player.lateral - h.gapCenter) < h.gapWidth / 2 - CAR_W * 0.45;
      if (!inGap) takeHit('You hit a police roadblock.', impactDamage(player.speed, 460));
    }
  }
}

function updateJaywalkers(dt) {
  for (const j of jaywalkers) {
    j.z -= player.speed * dt;
    j.lateral += j.vx * dt;
    if (!j.warned && Math.abs(j.z - player.z) < COLLIDE_Z * 3.2) j.warned = true;
    if (Math.abs(j.z - player.z) < COLLIDE_Z * 0.7 &&
        rectsOverlapLateral(player.lateral, CAR_W * 0.8, j.lateral, 90)) {
      takeHit('You couldn\'t swerve in time.', impactDamage(player.speed, 550));
    }
  }
}

// ============================================================
// Cop AI
// ============================================================
const TIER_INFO = {
  1: { name: 'Cruiser', speedMul: 1.02, ramChance: 0.35, ramPower: 620, color: '#1c2c4a' },
  2: { name: 'Interceptor', speedMul: 1.12, ramChance: 0.5, ramPower: 820, color: '#161a26' },
  3: { name: 'Enforcer SUV', speedMul: 1.08, ramChance: 0.62, ramPower: 1150, color: '#101014' },
};

function updateCops(dt) {
  let boxingCount = 0;
  for (const c of cops) {
    const info = TIER_INFO[c.tier];
    const gapZ = player.z - c.z;
    // approach speed logic: close distance, then match
    let desiredGap = 260 + Math.random() * 40;
    let speedTarget = player.speed * info.speedMul;
    if (gapZ > desiredGap + 120) speedTarget += 900; // catch up
    else if (gapZ < desiredGap - 120) speedTarget -= 500; // ease off
    c.speed = lerp(c.speed, speedTarget, dt * 2.2);
    c.z += c.speed * dt;

    // steer toward the player laterally once close enough to be a threat
    const closeEnough = gapZ < 900 && gapZ > -400;
    if (closeEnough) {
      const wantLateral = player.lateral + Math.sign((c.id % 2 === 0) ? 1 : -1) * CAR_W * 1.35;
      c.lateral = lerp(c.lateral, clamp(wantLateral, -ROAD_HALF + 100, ROAD_HALF - 100), dt * 1.6);
    } else {
      c.lateral = lerp(c.lateral, player.lateral * 0.4, dt * 0.6);
    }

    const alongside = Math.abs(gapZ) < 230 && Math.abs(c.lateral - player.lateral) < CAR_W * 1.6;
    if (alongside) {
      c.ramCooldown -= dt;
      if (c.ramCooldown <= 0 && Math.random() < info.ramChance && player.invuln <= 0) {
        const dir = c.lateral < player.lateral ? 1 : -1;
        takeHit(`Rammed by a ${info.name.toLowerCase()}.`, impactDamage(info.ramPower, 60), dir * info.ramPower);
        c.ramCooldown = rand(1.6, 2.8);
      } else if (c.ramCooldown <= 0) {
        c.ramCooldown = rand(0.6, 1.2);
      }
      const boxed = Math.abs(gapZ) < 130 && Math.abs(c.lateral - player.lateral) < CAR_W * 1.15;
      c.boxT = boxed ? c.boxT + dt : Math.max(0, c.boxT - dt * 2);
      if (c.boxT > 0.15) boxingCount++;
    } else {
      c.boxT = Math.max(0, c.boxT - dt);
      c.ramCooldown = Math.min(c.ramCooldown, 1.2);
    }
    c.lightPhase += dt * 9;
  }

  if (boxingCount >= 2) {
    director.boxTimer += dt;
    if (director.boxTimer > 1.15) endGame('busted');
  } else {
    director.boxTimer = Math.max(0, director.boxTimer - dt * 2);
  }
}

// ============================================================
// Particles
// ============================================================
function updateParticles(dt) {
  for (const p of particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 620 * dt;
  }
  particles = particles.filter(p => p.age < p.life);
}

// ============================================================
// Rendering helpers
// ============================================================
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fillQuad(x1, y1, x2, y2, x3, y3, x4, y4) {
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
  return `rgb(${r},${g},${b})`;
}

// ============================================================
// Rendering: ground
// ============================================================
function drawGround() {
  ctx.fillStyle = '#0d1a13';
  ctx.fillRect(0, 0, W, H);
}

// ============================================================
// Rendering: road (flat top-down ribbon; curve is a cosmetic centerline drift)
// ============================================================
function drawRoad() {
  const baseIndex = Math.floor((player.z - BEHIND_SEGS * SEG_LEN) / SEG_LEN);
  const endIndex = Math.floor((player.z + AHEAD_SEGS * SEG_LEN) / SEG_LEN) + 1;
  const roadHalfPx = ROAD_HALF * WORLD_PX;
  const sidewalkHalfPx = SIDEWALK_HALF * WORLD_PX;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  const rows = [];
  for (let idx = baseIndex; idx <= endIndex; idx++) {
    const p = worldToScreen(0, idx * SEG_LEN);
    rows.push({ idx, x: p.x, y: p.y });
  }

  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    const dark = a.idx % 2 === 0;
    ctx.fillStyle = dark ? '#3a3c46' : '#40424d';
    fillQuad(a.x - sidewalkHalfPx, a.y, a.x + sidewalkHalfPx, a.y, b.x + sidewalkHalfPx, b.y, b.x - sidewalkHalfPx, b.y);
    ctx.fillStyle = dark ? '#26262c' : '#2c2c33';
    fillQuad(a.x - roadHalfPx, a.y, a.x + roadHalfPx, a.y, b.x + roadHalfPx, b.y, b.x - roadHalfPx, b.y);
    ctx.fillStyle = `rgba(150,190,230,${dark ? 0.05 : 0.08})`;
    fillQuad(a.x - roadHalfPx * 0.15, a.y, a.x + roadHalfPx * 0.15, a.y, b.x + roadHalfPx * 0.15, b.y, b.x - roadHalfPx * 0.15, b.y);
    ctx.fillStyle = dark ? '#d94c4c' : '#e8e8e8';
    const rw = 4;
    fillQuad(a.x - roadHalfPx, a.y, a.x - roadHalfPx + rw, a.y, b.x - roadHalfPx + rw, b.y, b.x - roadHalfPx, b.y);
    fillQuad(a.x + roadHalfPx - rw, a.y, a.x + roadHalfPx, a.y, b.x + roadHalfPx, b.y, b.x + roadHalfPx - rw, b.y);
  }

  // dashed lane markers, scrolling continuously with world z
  ctx.fillStyle = 'rgba(255,235,180,0.85)';
  const dashLen = 90, gapLen = 70, period = dashLen + gapLen;
  for (const lf of [-1 / 3, 1 / 3]) {
    let z = Math.floor((player.z - BEHIND_SEGS * SEG_LEN) / period) * period;
    const zEnd = player.z + AHEAD_SEGS * SEG_LEN;
    while (z < zEnd) {
      const z0 = z, z1 = Math.min(z + dashLen, zEnd);
      if (z1 > z0) {
        const p0 = worldToScreen(lf * ROAD_HALF, z0);
        const p1 = worldToScreen(lf * ROAD_HALF, z1);
        fillQuad(p0.x - 2.5, p0.y, p0.x + 2.5, p0.y, p1.x + 2.5, p1.y, p1.x - 2.5, p1.y);
      }
      z += period;
    }
  }

  ctx.restore();
  return { baseIndex, endIndex };
}

// ============================================================
// Rendering: scenery (buildings, lamps, pedestrians) — flat top-down with a
// pseudo-3D "extruded" look (an offset drop-shadow duplicate under the roof) so
// the city doesn't read as flat paper cutouts.
// ============================================================
function drawBuildingTopDown(x, y, b) {
  const w = b.width * WORLD_PX;
  const depth = Math.max(w * 0.7, b.height * WORLD_PX * 0.45);
  if (w < 2) return;
  const r = Math.min(6, w * 0.1);
  const lift = clamp(b.height * WORLD_PX * 0.16, 3, 40);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(x - w / 2, y - depth / 2 + lift, w, depth, r);
  ctx.fill();

  const roofGrad = ctx.createLinearGradient(x - w / 2, y - depth / 2, x + w / 2, y + depth / 2);
  roofGrad.addColorStop(0, shade(b.color, 16));
  roofGrad.addColorStop(1, shade(b.color, -18));
  ctx.fillStyle = roofGrad;
  roundRect(x - w / 2, y - depth / 2, w, depth, r);
  ctx.fill();
  ctx.strokeStyle = shade(b.color, -32);
  ctx.lineWidth = 1;
  roundRect(x - w / 2, y - depth / 2, w, depth, r);
  ctx.stroke();

  if (b.house) {
    ctx.strokeStyle = shade(b.color, -35);
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.32, y); ctx.lineTo(x + w * 0.32, y);
    ctx.stroke();
    if (b.porchLight) {
      const g = ctx.createRadialGradient(x, y + depth * 0.5, 0, x, y + depth * 0.5, w * 0.22);
      g.addColorStop(0, 'rgba(255,200,120,0.75)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y + depth * 0.5, w * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    const unitCount = Math.max(1, Math.round(w / 24));
    for (let i = 0; i < unitCount; i++) {
      const useed = b.seed * 13 + i * 7;
      if (seededRand(useed) > 0.5) continue;
      const ux = x - w / 2 + (i + 0.5) * (w / unitCount);
      const uy = y + (seededRand(useed + 1) - 0.5) * depth * 0.5;
      const us = Math.max(2, w * 0.05);
      ctx.fillStyle = '#20222a';
      ctx.fillRect(ux - us / 2, uy - us / 2, us, us);
    }
    if (b.neon && w > 5) {
      ctx.fillStyle = b.neon;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(state.runTime * 4 + b.seed);
      ctx.beginPath(); ctx.arc(x, y, Math.max(2, w * 0.07), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (b.antenna && w > 10) {
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - depth * 0.6); ctx.stroke();
    }
  }
  if (w > 6) {
    ctx.strokeStyle = `rgba(255,206,120,${b.litRatio * 0.4})`;
    ctx.lineWidth = Math.max(1, w * 0.035);
    roundRect(x - w / 2, y - depth / 2, w, depth, r);
    ctx.stroke();
  }
}

function drawLampTopDown(x, y) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 15);
  g.addColorStop(0, 'rgba(255,220,150,0.5)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2a30';
  ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
}

function drawPedestrianTopDown(x, y, ped) {
  const r = 6 * (ped.scale || 1);
  const wobble = Math.sin(state.runTime * 8 + ped.phase) * 1.4;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.7, r * 0.85, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.outfit;
  ctx.beginPath(); ctx.arc(x + wobble * 0.3, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e7bd94';
  ctx.beginPath(); ctx.arc(x + wobble * 0.3, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
}

function drawScenery(range) {
  for (let idx = range.baseIndex; idx <= range.endIndex; idx++) {
    const z = idx * SEG_LEN;
    for (const side of [-1, 1]) {
      const b = buildingAt(idx, side);
      if (b) {
        const p = worldToScreen(side * b.offset, z);
        drawBuildingTopDown(p.x, p.y, b);
      }
      const lamp = lampAt(idx, side);
      if (lamp) {
        const p = worldToScreen(side * lamp.offset, z);
        drawLampTopDown(p.x, p.y);
      }
    }
    const ped = pedAt(idx);
    if (ped) {
      const p = worldToScreen(ped.side * ped.offset, z);
      drawPedestrianTopDown(p.x, p.y, ped);
    }
  }
}

// ============================================================
// Rendering: cars — pseudo-3D top-down (an offset "side" slab under the roof,
// wheels peeking at the corners) so they read as toy cars, not flat plan shapes.
// ============================================================
function drawCarTopDown(cx, cy, opts) {
  const w = CAR_W * WORLD_PX;
  const len = CAR_LEN * WORLD_PX;
  if (w < 2) return;
  ctx.save();
  ctx.translate(cx, cy);
  if (opts.rot) ctx.rotate(opts.rot);

  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  roundRect(-w * 0.5, -len * 0.46, w, len * 0.92, w * 0.24);
  ctx.fill();

  const lift = Math.max(2.5, w * 0.2);
  const r = w * 0.22;

  ctx.fillStyle = '#0c0c0f';
  const wheelW = w * 0.15, wheelL = len * 0.16;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    ctx.fillRect(sx * w * 0.52 - wheelW / 2, sy * len * 0.3 + lift * 0.4 - wheelL / 2, wheelW, wheelL);
  }

  // body: shifted down from the roof — the "3D toy car" trick, reads as the raised side
  ctx.fillStyle = shade(opts.color, -38);
  roundRect(-w / 2, -len / 2 + lift, w, len, r);
  ctx.fill();

  const bodyGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  bodyGrad.addColorStop(0, shade(opts.color, -14));
  bodyGrad.addColorStop(0.46, shade(opts.color, 28));
  bodyGrad.addColorStop(0.54, shade(opts.color, 28));
  bodyGrad.addColorStop(1, shade(opts.color, -14));
  ctx.fillStyle = bodyGrad;
  roundRect(-w / 2, -len / 2, w, len, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  roundRect(-w / 2, -len / 2, w, len, r);
  ctx.stroke();

  ctx.fillStyle = 'rgba(180,215,240,0.72)';
  roundRect(-w * 0.36, -len * 0.42, w * 0.72, len * 0.22, w * 0.1);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,180,210,0.55)';
  roundRect(-w * 0.34, len * 0.18, w * 0.68, len * 0.2, w * 0.1);
  ctx.fill();

  ctx.fillStyle = shade(opts.color, -25);
  ctx.fillRect(-w * 0.58, -len * 0.1, w * 0.09, len * 0.08);
  ctx.fillRect(w * 0.49, -len * 0.1, w * 0.09, len * 0.08);

  // headlights face "up" (ahead), taillights face "down" (behind) — both visible
  // at once now that we're looking straight down, unlike the old rear-only view
  ctx.fillStyle = '#fff7d6';
  ctx.fillRect(-w * 0.42, -len * 0.5, w * 0.17, len * 0.07);
  ctx.fillRect(w * 0.25, -len * 0.5, w * 0.17, len * 0.07);
  ctx.fillStyle = opts.braking ? '#ff5252' : '#a32020';
  ctx.fillRect(-w * 0.42, len * 0.43, w * 0.17, len * 0.07);
  ctx.fillRect(w * 0.25, len * 0.43, w * 0.17, len * 0.07);

  if (opts.isCop) {
    const onA = Math.sin(opts.lightPhase) > 0;
    ctx.fillStyle = '#111';
    roundRect(-w * 0.32, -len * 0.08, w * 0.64, len * 0.16, w * 0.05);
    ctx.fill();
    ctx.fillStyle = onA ? '#ff3b3b' : '#2b4bff';
    ctx.globalAlpha = 0.55 + (onA ? 0.45 : 0.2);
    ctx.fillRect(-w * 0.3, -len * 0.06, w * 0.28, len * 0.12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = onA ? '#2b4bff' : '#ff3b3b';
    ctx.globalAlpha = 0.55 + (onA ? 0.2 : 0.45);
    ctx.fillRect(w * 0.02, -len * 0.06, w * 0.28, len * 0.12);
    ctx.globalAlpha = 1;
    const bleedColor = onA ? '255,60,60' : '43,75,255';
    const bleed = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 1.5);
    bleed.addColorStop(0, `rgba(${bleedColor},0.3)`);
    bleed.addColorStop(1, `rgba(${bleedColor},0)`);
    ctx.fillStyle = bleed;
    ctx.beginPath(); ctx.arc(0, 0, w * 1.5, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = opts.tier === 3 ? '#ffd23f' : '#ffffff';
    ctx.lineWidth = Math.max(1, w * 0.05);
    ctx.beginPath(); ctx.moveTo(-w * 0.46, -len * 0.02); ctx.lineTo(w * 0.46, len * 0.05); ctx.stroke();
  }

  ctx.restore();
}

function drawRoadblockTopDown(x, y) {
  const w = 42, h = 16;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(-w / 2 + 2, -h / 2 + 3, w, h, 4);
  ctx.fill();
  ctx.fillStyle = '#ff7a1f';
  roundRect(-w / 2, -h / 2, w, h, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.beginPath();
  roundRect(-w / 2, -h / 2, w, h, 4);
  ctx.clip();
  for (let i = -1; i <= 1; i++) ctx.fillRect(i * w * 0.3 - 3, -h / 2, 6, h);
  ctx.restore();
  ctx.restore();
}

function drawDynamicEntities() {
  const drawables = [];
  for (const t of traffic) drawables.push({ p: worldToScreen(t.lateral, t.z), type: 'traffic', ref: t });
  for (const c of cops) drawables.push({ p: worldToScreen(c.lateral, c.z), type: 'cop', ref: c });
  for (const j of jaywalkers) drawables.push({ p: worldToScreen(j.lateral, j.z), type: 'jay', ref: j });
  for (const h of hazards) {
    drawables.push({ p: worldToScreen(h.gapCenter - h.gapWidth / 2 - 120, h.z), type: 'hazard', ref: h });
    drawables.push({ p: worldToScreen(h.gapCenter + h.gapWidth / 2 + 120, h.z), type: 'hazard', ref: h });
  }

  drawables.sort((a, b) => a.p.y - b.p.y);

  for (const d of drawables) {
    if (d.p.x < -80 || d.p.x > W + 80 || d.p.y < -80 || d.p.y > H + 80) continue;
    if (d.type === 'traffic') {
      drawCarTopDown(d.p.x, d.p.y, { color: d.ref.color, braking: false });
    } else if (d.type === 'cop') {
      const info = TIER_INFO[d.ref.tier];
      drawCarTopDown(d.p.x, d.p.y, { color: info.color, isCop: true, tier: d.ref.tier, lightPhase: d.ref.lightPhase, braking: d.ref.z < player.z });
    } else if (d.type === 'jay') {
      drawPedestrianTopDown(d.p.x, d.p.y, { outfit: d.ref.warned ? '#ffe157' : d.ref.outfit, phase: state.runTime * 10, scale: 1.3 });
    } else if (d.type === 'hazard') {
      drawRoadblockTopDown(d.p.x, d.p.y);
    }
  }
}

// ============================================================
// Player car (fixed screen anchor)
// ============================================================
function drawPlayerCar() {
  const px = W / 2;
  const py = H * ANCHOR_Y_FRAC;
  const flicker = player.invuln > 0 ? (Math.sin(state.runTime * 30) > 0 ? 0.4 : 1) : 1;
  ctx.save();
  ctx.globalAlpha = flicker;
  drawCarTopDown(px, py, { color: '#1f6fe0', braking: player.braking, rot: player.lean * 0.5 + player.impactSpin });
  if (player.boosting) {
    const w = CAR_W * WORLD_PX, len = CAR_LEN * WORLD_PX;
    const fy = py + len * 0.5;
    for (let i = 0; i < 2; i++) {
      const fx = px + (i === 0 ? -1 : 1) * w * 0.26;
      const flameLen = 22 + Math.random() * 14;
      ctx.fillStyle = 'rgba(90,160,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - 5, fy + flameLen);
      ctx.lineTo(fx + 5, fy + flameLen);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(230,245,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(fx, fy + 2);
      ctx.lineTo(fx - 2, fy + flameLen * 0.55);
      ctx.lineTo(fx + 2, fy + flameLen * 0.55);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================
// Radar (replaces the rearview mirror — pointless in a top-down view where you
// can already see behind you, but a quick "who's coming from where" at a glance
// is still useful, echoing the minimap corner Mad Pursuit uses)
// ============================================================
function drawRadar() {
  const mw = mirrorCanvas.width, mh = mirrorCanvas.height;
  mirrorCtx.clearRect(0, 0, mw, mh);
  const cx = mw / 2, cy = mh / 2;
  const R = Math.min(mw, mh) / 2 - 3;

  const g = mirrorCtx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, '#1c2338');
  g.addColorStop(1, '#0c0f1a');
  mirrorCtx.fillStyle = g;
  mirrorCtx.beginPath(); mirrorCtx.arc(cx, cy, R, 0, Math.PI * 2); mirrorCtx.fill();

  mirrorCtx.strokeStyle = 'rgba(255,255,255,0.12)';
  mirrorCtx.beginPath(); mirrorCtx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); mirrorCtx.stroke();

  const RADAR_RANGE = 3600;
  for (const c of cops) {
    const dz = c.z - player.z, dx = c.lateral - player.lateral;
    const dist = Math.hypot(dz, dx);
    if (dist > RADAR_RANGE) continue;
    const bx = cx + (dx / RADAR_RANGE) * R;
    const by = cy - (dz / RADAR_RANGE) * R;
    const onA = Math.sin(c.lightPhase) > 0;
    mirrorCtx.fillStyle = onA ? '#ff3b3b' : '#2b4bff';
    mirrorCtx.beginPath(); mirrorCtx.arc(bx, by, 4, 0, Math.PI * 2); mirrorCtx.fill();
  }

  mirrorCtx.fillStyle = '#7fe0ff';
  mirrorCtx.beginPath();
  mirrorCtx.moveTo(cx, cy - 6);
  mirrorCtx.lineTo(cx - 5, cy + 5);
  mirrorCtx.lineTo(cx + 5, cy + 5);
  mirrorCtx.closePath();
  mirrorCtx.fill();

  mirrorCtx.strokeStyle = 'rgba(255,255,255,0.25)';
  mirrorCtx.lineWidth = 2;
  mirrorCtx.beginPath(); mirrorCtx.arc(cx, cy, R, 0, Math.PI * 2); mirrorCtx.stroke();
}

// ============================================================
// Particles render + vignette + shake/flash
// ============================================================
function drawParticles() {
  for (const p of particles) {
    const t = p.age / p.life;
    if (p.kind === 'smoke') {
      ctx.globalAlpha = clamp((1 - t) * 0.5, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + t * (p.grow || 20), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = clamp(1 - t, 0, 1);
      ctx.fillStyle = p.color;
      const r = p.size * (1 - t * 0.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = clamp((1 - t) * 0.4, 0, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H * ANCHOR_Y_FRAC, H * 0.25, W / 2, H * ANCHOR_Y_FRAC, H * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ============================================================
// HUD
// ============================================================
const el = {
  score: document.getElementById('score-val'),
  best: document.getElementById('best-val'),
  stars: document.getElementById('stars'),
  speed: document.getElementById('speed-val'),
  speedFill: document.getElementById('speed-fill'),
  nitroFill: document.getElementById('nitro-fill'),
  healthFill: document.getElementById('health-fill'),
  healthVal: document.getElementById('health-val'),
};
function updateHud() {
  el.score.textContent = Math.floor(player.z / 10);
  const mph = Math.round(player.speed / 68);
  el.speed.textContent = mph;
  el.speedFill.style.width = `${clamp(player.speed / player.maxSpeed, 0, 1) * 100}%`;
  el.nitroFill.style.width = `${player.nitro * 100}%`;
  el.stars.textContent = '★'.repeat(director.wanted) + '☆'.repeat(5 - director.wanted);

  const hpRatio = clamp(player.health / HEALTH_MAX, 0, 1);
  el.healthFill.style.width = `${hpRatio * 100}%`;
  el.healthFill.style.background = hpRatio > 0.5
    ? 'linear-gradient(90deg, #3fe07f, #8dff9f)'
    : hpRatio > 0.25
      ? 'linear-gradient(90deg, #e0a83f, #ffd166)'
      : 'linear-gradient(90deg, #e03f3f, #ff6b6b)';
  el.healthVal.textContent = Math.ceil(player.health);
}

// ============================================================
// Main loop
// ============================================================
let lastT = performance.now();
function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = clamp(dt, 0, 0.05);
  state.runTime += dt;

  if (state.mode === 'playing') {
    updateDirector(dt);
    updatePlayer(dt);
    if (state.mode === 'playing') {
      updateTraffic(dt);
      updateHazards(dt);
      updateJaywalkers(dt);
      updateCops(dt);
      updateHud();
    }
  } else if (state.mode === 'crashing') {
    state.crashTimer += dt;
    updateParticles(dt);
    player.speed = lerp(player.speed, 0, dt * 3);
    if (state.crashTimer > 1.1) {
      showGameOver();
    }
  }

  state.shake = Math.max(0, state.shake - dt * 40);
  state.flash = Math.max(0, state.flash - dt * 2.2);
  updateParticles(dt);

  render();
  requestAnimationFrame(frame);
}

function render() {
  ctx.save();
  if (state.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawGround();
  const range = drawRoad();
  drawScenery(range);
  drawDynamicEntities();
  drawPlayerCar();
  drawParticles();
  drawVignette();
  ctx.restore();

  if (state.flash > 0.01) {
    ctx.fillStyle = `rgba(255,40,40,${state.flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state.mode === 'playing') drawRadar();
}

// ============================================================
// Init
// ============================================================
resize();
updateHud();
requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
})();
