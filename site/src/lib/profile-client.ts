// Browser-side personalization: header chip + menu, login/signup modal, solve
// recording (with a sign-in nudge for logged-out players), solved badges on
// grade lists, home count, and the /profile listing. All network calls degrade
// silently — gameplay never depends on them.
import { groupByGame, type GameGroup } from "./profile/completions";
import { deriveBadges, earnedBadgeIds, currentStreak, type Badge } from "./profile/badges";
import { AVATARS, AVATAR_COLORS, DEFAULT_AVATAR, DEFAULT_COLOR, sanitizeAvatar, sanitizeColor } from "./profile/avatars";
import type { Completion } from "./profile/types";

type Me = { username: string; avatar?: string; avatarColor?: string } | null;
type Meta = { game?: string; puzzleId?: string; grade?: string };

/** A solid-color circle holding the avatar emoji — reused in chip, modal, profile. */
function avatarCircle(avatar: string, color: string, size = 28): string {
  return `<span style="display:inline-flex;align-items:center;justify-content:center;flex:none;` +
    `width:${size}px;height:${size}px;border-radius:9999px;background:${color};font-size:${Math.round(size * 0.58)}px;line-height:1;">${avatar}</span>`;
}

const GAME_META: Record<string, { label: string; emoji: string; path: string }> = {
  "logic-grid": { label: "Logic Grid", emoji: "🧩", path: "/logic-grid" },
  "math-packet": { label: "Math Worksheets", emoji: "🔢", path: "/math" },
  "maze": { label: "Mazes", emoji: "🌀", path: "/maze" },
  "sudoku": { label: "Sudoku", emoji: "⭐", path: "/sudoku" },
  "word-search": { label: "Word Search", emoji: "🔎", path: "/word-search" },
  "kenken": { label: "KenKen", emoji: "✖️", path: "/kenken" },
};

const MASTERY_NEED = 5;
const SEEN_KEY = "mg_seen_badges";

// In-memory completion list, seeded once and kept current so the solve handler
// can derive badges optimistically (the server write may not have landed yet).
let completionsCache: Completion[] | null = null;
async function getCompletions(): Promise<Completion[]> {
  if (completionsCache) return completionsCache;
  completionsCache = await fetchCompletions();
  return completionsCache;
}

function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]); }
  catch { return new Set(); }
}
function saveSeen(ids: Iterable<string>): void {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

// Set once at init; lets the solve handler decide record-vs-nudge without a round trip.
let currentMe: Me = null;
// A solve made while logged out, held so we can save it the moment the player signs in.
let pendingCompletion: Meta | null = null;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

async function fetchMe(): Promise<Me> {
  try {
    const r = await fetch("/api/me", { credentials: "same-origin" });
    if (!r.ok) return null;
    return (await r.json()) as Me;
  } catch {
    return null;
  }
}

async function fetchCompletions(): Promise<Completion[]> {
  try {
    const r = await fetch("/api/me/completions", { credentials: "same-origin" });
    if (!r.ok) return [];
    const j = (await r.json()) as { completions: Completion[] };
    return j.completions ?? [];
  } catch {
    return [];
  }
}

async function postCompletion(meta: Meta): Promise<void> {
  try {
    await fetch("/api/completions", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(meta),
    });
  } catch {
    // ignore — recording is best-effort
  }
}

// One-time inline <style> for hover states (inline element styles can't do :hover,
// and a dedicated style block can't be stripped by Tailwind purging).
function ensureStyles(): void {
  if (document.getElementById("mg-profile-styles")) return;
  const s = document.createElement("style");
  s.id = "mg-profile-styles";
  s.textContent =
    "#profile-chip [data-chip]:hover{background:#f8fafc;border-color:#94a3b8}" +
    "[data-menu] a:hover,[data-menu] [data-logout]:hover{background:#f1f5f9}";
  document.head.appendChild(s);
}

// ---- header chip + menu ---------------------------------------------------
function renderChip(me: Me): void {
  const slot = document.getElementById("profile-chip");
  if (!slot) return;
  ensureStyles();
  slot.style.position = "relative";
  slot.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("data-chip", "");
  if (me) {
    btn.style.cssText =
      "display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#fff;border-radius:9999px;" +
      `padding:3px 10px 3px 4px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;transition:background .15s,border-color .15s;font-family:${FONT};`;
    btn.innerHTML = `${avatarCircle(sanitizeAvatar(me.avatar), sanitizeColor(me.avatarColor), 24)}<span>${me.username}</span><span aria-hidden="true" style="color:#94a3b8;">▾</span>`;
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
  } else {
    btn.style.cssText =
      "border:1px solid #cbd5e1;background:#fff;border-radius:9999px;padding:4px 12px;" +
      `font-size:13px;font-weight:600;color:#334155;cursor:pointer;transition:background .15s,border-color .15s;font-family:${FONT};`;
    btn.textContent = "Sign in";
    btn.addEventListener("click", () => openAuthModal());
  }
  slot.appendChild(btn);
}

function toggleMenu(): void {
  const slot = document.getElementById("profile-chip");
  if (!slot) return;
  const existing = slot.querySelector("[data-menu]");
  if (existing) { existing.remove(); return; }

  const menu = document.createElement("div");
  menu.setAttribute("data-menu", "");
  menu.style.cssText =
    "position:absolute;right:0;top:calc(100% + 6px);min-width:170px;background:#fff;" +
    "border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.12);" +
    `padding:6px;z-index:10020;font-family:${FONT};`;
  const item =
    "display:block;width:100%;box-sizing:border-box;text-align:left;padding:8px 10px;" +
    "border:none;background:none;border-radius:7px;font-size:14px;color:#334155;cursor:pointer;text-decoration:none;";
  menu.innerHTML =
    `<a href="/profile" style="${item}">My profile</a>` +
    `<button type="button" data-logout style="${item}color:#dc2626;">Log out</button>`;
  slot.appendChild(menu);

  menu.querySelector<HTMLButtonElement>("[data-logout]")!.addEventListener("click", () => {
    void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .finally(() => location.reload());
  });

  const cleanup = () => {
    menu.remove();
    document.removeEventListener("mousedown", onDoc);
    document.removeEventListener("keydown", onKey);
  };
  const onDoc = (e: MouseEvent) => { if (!slot.contains(e.target as Node)) cleanup(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cleanup(); };
  setTimeout(() => {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  }, 0);
}

// ---- auth modal -----------------------------------------------------------
function openAuthModal(): void {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;" +
    `padding:24px;background:rgba(15,23,42,.6);font-family:${FONT};`;
  const input = "width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;margin-top:8px;";
  const btn = "display:block;width:100%;box-sizing:border-box;padding:11px 16px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:none;";
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" style="width:100%;max-width:340px;background:#fff;border-radius:16px;padding:28px;box-shadow:0 20px 50px rgba(0,0,0,.25);">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#0f172a;" data-title>Sign in</h2>
      <p style="margin:0;font-size:13px;color:#64748b;">Username + PIN. No email needed.</p>
      <input data-username placeholder="username" autocomplete="username" maxlength="20" style="${input}" />
      <input data-pin placeholder="PIN (4-8 digits)" inputmode="numeric" autocomplete="off" maxlength="8" style="${input}" />
      <div data-avatar-picker hidden style="margin-top:14px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#334155;">Pick your character</p>
        <div data-av-preview style="display:flex;justify-content:center;margin-bottom:10px;"></div>
        <div data-av-grid style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;"></div>
        <div data-col-row style="display:flex;gap:8px;justify-content:center;margin-top:10px;"></div>
      </div>
      <p data-error style="margin:10px 0 0;font-size:13px;color:#dc2626;min-height:16px;"></p>
      <button data-submit style="${btn}background:#4f46e5;color:#fff;margin-top:8px;">Sign in</button>
      <button data-toggle style="background:none;border:none;margin-top:12px;width:100%;font-size:13px;color:#4f46e5;cursor:pointer;">New here? Create a profile</button>
      <button data-cancel style="background:none;border:none;margin-top:6px;width:100%;font-size:13px;color:#94a3b8;cursor:pointer;">Cancel</button>
    </div>`;
  document.body.appendChild(overlay);

  let mode: "login" | "signup" = "login";
  const $ = <T extends HTMLElement>(sel: string) => overlay.querySelector<T>(sel)!;
  const error = $("[data-error]");
  const submit = $<HTMLButtonElement>("[data-submit]");
  const usernameEl = $<HTMLInputElement>("[data-username]");
  const pinEl = $<HTMLInputElement>("[data-pin]");

  // Avatar picker (signup only). Defaults to a random character so each new kid
  // starts unique. Selection is held locally and sent with the signup request.
  const picker = $("[data-avatar-picker]");
  const preview = $("[data-av-preview]");
  const avGrid = $("[data-av-grid]");
  const colRow = $("[data-col-row]");
  let selAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? DEFAULT_AVATAR;
  let selColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? DEFAULT_COLOR;
  const syncSel = () => {
    preview.innerHTML = avatarCircle(selAvatar, selColor, 52);
    avGrid.querySelectorAll<HTMLElement>("[data-av-opt]").forEach((el) => {
      const on = el.getAttribute("data-av-opt") === selAvatar;
      el.style.borderColor = on ? "#4f46e5" : "transparent";
      el.style.background = on ? "#eef2ff" : "#f8fafc";
    });
    colRow.querySelectorAll<HTMLElement>("[data-col-opt]").forEach((el) => {
      el.style.borderColor = el.getAttribute("data-col-opt") === selColor ? "#0f172a" : "#e2e8f0";
    });
  };
  for (const a of AVATARS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = a; b.setAttribute("data-av-opt", a);
    b.style.cssText = "display:flex;align-items:center;justify-content:center;height:34px;border-radius:9px;border:2px solid transparent;background:#f8fafc;font-size:20px;line-height:1;cursor:pointer;";
    b.addEventListener("click", () => { selAvatar = a; syncSel(); });
    avGrid.appendChild(b);
  }
  for (const c of AVATAR_COLORS) {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("data-col-opt", c);
    b.style.cssText = `width:28px;height:28px;border-radius:9999px;background:${c};border:2px solid #e2e8f0;cursor:pointer;`;
    b.addEventListener("click", () => { selColor = c; syncSel(); });
    colRow.appendChild(b);
  }
  syncSel();

  const setMode = (m: "login" | "signup") => {
    mode = m;
    $("[data-title]").textContent = m === "login" ? "Sign in" : "Create a profile";
    submit.textContent = m === "login" ? "Sign in" : "Create profile";
    $("[data-toggle]").textContent = m === "login" ? "New here? Create a profile" : "Have a profile? Sign in";
    picker.hidden = m === "login";
  };

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  $("[data-cancel]").addEventListener("click", close);
  $("[data-toggle]").addEventListener("click", () => { setMode(mode === "login" ? "signup" : "login"); usernameEl.focus(); });
  // PINs are numeric only — strip anything else as the player types.
  pinEl.addEventListener("input", () => { pinEl.value = pinEl.value.replace(/\D/g, ""); });

  const doSubmit = async () => {
    const username = usernameEl.value.trim();
    const pin = pinEl.value.trim();
    error.textContent = "";
    submit.disabled = true;
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { username, pin, avatar: selAvatar, avatarColor: selColor } : { username, pin }),
      });
      if (r.ok) {
        // Save a solve the player made before signing in, then refresh everything.
        if (pendingCompletion) { await postCompletion(pendingCompletion); pendingCompletion = null; }
        location.reload();
        return;
      }
      error.textContent =
        r.status === 409 ? "That username is taken." :
        r.status === 401 ? "Wrong username or PIN." :
        r.status === 429 ? "Too many tries — wait a bit." :
        "Check your username (3-20) and PIN (4-8 digits).";
    } catch {
      error.textContent = "Network error — try again.";
    } finally {
      submit.disabled = false;
    }
  };
  submit.addEventListener("click", () => void doSubmit());
  for (const el of [usernameEl, pinEl]) {
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") void doSubmit(); });
  }
  usernameEl.focus();
}

// ---- solve recording + sign-in nudge --------------------------------------
function readSolvedMeta(): Meta | null {
  const el = document.getElementById("puzzle-meta");
  if (!el?.textContent) return null;
  try { return JSON.parse(el.textContent) as Meta; } catch { return null; }
}

// Add a "save your progress" prompt into the win splash (built by win.ts on solve).
function injectSaveNudge(): void {
  // win.ts splash overlay has role="dialog"; its inner card is the first div.
  const host = document.querySelector<HTMLElement>('[role="dialog"]');
  const target = host?.querySelector<HTMLElement>("div") ?? host;
  if (!target || target.querySelector("[data-save-nudge]")) return;
  const wrap = document.createElement("div");
  wrap.setAttribute("data-save-nudge", "");
  wrap.style.cssText = "margin-top:18px;padding-top:16px;border-top:1px solid #e2e8f0;";
  wrap.innerHTML = `<p style="margin:0 0 8px;font-size:13px;color:#64748b;">Want to keep track of what you've solved?</p>`;
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = "Sign in to save your progress";
  b.style.cssText =
    "display:block;width:100%;box-sizing:border-box;padding:10px 16px;border-radius:10px;" +
    `font-size:14px;font-weight:600;cursor:pointer;border:1px solid #c7d2fe;background:#eef2ff;color:#4f46e5;font-family:${FONT};`;
  b.addEventListener("click", () => openAuthModal());
  wrap.appendChild(b);
  target.appendChild(wrap);
}

function wireSolveRecording(): void {
  document.addEventListener("puzzle:solved", () => {
    const meta = readSolvedMeta();
    if (!meta) return;
    if (currentMe) {
      void postCompletion(meta);
      void maybeCelebrateBadges(meta);
    } else {
      pendingCompletion = meta;
      // Splash overlay is appended synchronously right after this event fires.
      setTimeout(injectSaveNudge, 0);
    }
  });
}

/**
 * After a logged-in solve, optimistically fold the just-solved puzzle into the
 * cached completions, recompute earned badges, and toast any that are newly
 * earned. Purely client-side and best-effort — never blocks gameplay.
 */
async function maybeCelebrateBadges(meta: Meta): Promise<void> {
  if (!meta.game || !meta.puzzleId) return;
  const cache = await getCompletions();
  const field = `${meta.game}:${meta.puzzleId}`;
  if (!cache.some((c) => `${c.game}:${c.puzzleId}` === field)) {
    cache.push({ game: meta.game, puzzleId: meta.puzzleId, grade: meta.grade ?? "", ts: Date.now() });
  }
  const seen = loadSeen();
  const earnedNow = earnedBadgeIds(cache, Date.now());
  const fresh = earnedNow.filter((id) => !seen.has(id));
  saveSeen(earnedNow);
  if (fresh.length === 0) return;
  const byId = new Map(deriveBadges(cache, Date.now()).map((b) => [b.id, b]));
  // Win splash lands first; stack badge toasts above it, one after another.
  setTimeout(() => fresh.forEach((id, i) => { const b = byId.get(id); if (b) setTimeout(() => toastBadge(b), i * 600); }), 700);
}

function toastBadge(b: Badge): void {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const t = document.createElement("div");
  t.style.cssText =
    "position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:10080;" +
    "display:flex;align-items:center;gap:10px;background:#fff;border-radius:14px;padding:12px 18px;" +
    `box-shadow:0 16px 40px rgba(15,23,42,.28);font-family:${FONT};border:2px solid #facc15;max-width:90vw;`;
  t.innerHTML =
    `<span style="font-size:30px;line-height:1;">${b.emoji}</span>` +
    `<span style="text-align:left;"><span style="display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#ca8a04;">New badge!</span>` +
    `<span style="display:block;font-size:16px;font-weight:800;color:#0f172a;">${b.label}</span></span>`;
  if (!reduce) t.animate(
    [{ transform: "translateX(-50%) translateY(-16px)", opacity: 0 }, { transform: "translateX(-50%) translateY(0)", opacity: 1 }],
    { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.3)" },
  );
  document.body.appendChild(t);
  setTimeout(() => {
    const done = () => t.remove();
    if (reduce) return done();
    t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished.then(done, done);
  }, 3200);
}

// ---- solved badges on grade lists ----------------------------------------
async function markSolvedCards(): Promise<void> {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("a[data-puzzle-id]"));
  if (cards.length === 0) return;
  const done = new Set((await getCompletions()).map((c) => `${c.game}:${c.puzzleId}`));
  for (const card of cards) {
    const key = `${card.dataset.game}:${card.dataset.puzzleId}`;
    if (done.has(key)) {
      const badge = card.querySelector<HTMLElement>("[data-solved-badge]");
      if (badge) badge.hidden = false;
    }
  }
}

// ---- home count -----------------------------------------------------------
async function renderHomeCount(): Promise<void> {
  const el = document.getElementById("solved-count");
  if (!el) return;
  const cs = await getCompletions();
  const streak = currentStreak(cs, Date.now());
  if (cs.length > 0) {
    el.textContent = streak > 1 ? `✓ ${cs.length} solved · 🔥 ${streak}-day streak` : `✓ ${cs.length} puzzles solved`;
    el.hidden = false;
  }
}

// ---- /profile listing -----------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

function badgeChip(b: Badge): string {
  const ring = b.earned ? "#facc15" : "#e2e8f0";
  const bg = b.earned ? "#fffbeb" : "#f8fafc";
  const titleColor = b.earned ? "#0f172a" : "#94a3b8";
  const emoji = b.earned
    ? `<span style="font-size:30px;line-height:1;">${b.emoji}</span>`
    : `<span style="font-size:30px;line-height:1;filter:grayscale(1);opacity:.45;">${b.emoji}</span>`;
  const sub = b.earned
    ? `<span style="font-size:11px;color:#ca8a04;font-weight:600;">${esc(b.description)}</span>`
    : `<span style="font-size:11px;color:#94a3b8;">${esc(b.description)}</span>` +
      `<span style="display:block;margin-top:4px;height:5px;border-radius:9999px;background:#e2e8f0;overflow:hidden;">` +
        `<span style="display:block;height:100%;width:${Math.min(100, Math.round((b.have / b.need) * 100))}%;background:#cbd5e1;"></span></span>`;
  return `<div title="${esc(b.label)}" style="border:2px solid ${ring};background:${bg};border-radius:14px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;">
    ${emoji}
    <span style="font-size:13px;font-weight:800;color:${titleColor};line-height:1.15;">${esc(b.label)}</span>
    ${sub}
  </div>`;
}

async function renderProfile(me: Me): Promise<void> {
  const root = document.getElementById("profile-root");
  if (!root) return;
  if (!me) {
    root.innerHTML = `<p style="color:#64748b;">Please <button id="profile-signin" style="background:none;border:none;color:#4f46e5;font-weight:600;cursor:pointer;">sign in</button> to see your progress.</p>`;
    document.getElementById("profile-signin")?.addEventListener("click", () => openAuthModal());
    return;
  }
  const completions = await getCompletions();
  const groups: GameGroup[] = groupByGame(completions);
  const total = groups.reduce((s, g) => s + g.count, 0);
  const badges = deriveBadges(completions, Date.now());
  const earnedCount = badges.filter((b) => b.earned).length;
  const streak = currentStreak(completions, Date.now());

  const av = sanitizeAvatar(me.avatar), avc = sanitizeColor(me.avatarColor);
  const header = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      ${avatarCircle(av, avc, 56)}
      <span style="font-size:22px;font-weight:800;color:#0f172a;">${esc(me.username)}</span>
    </div>`;

  if (total === 0) {
    root.innerHTML = header + `<div style="text-align:center;padding:32px 16px;background:#f8fafc;border-radius:16px;">
      <div style="font-size:48px;">🎯</div>
      <p style="font-size:17px;font-weight:700;margin:10px 0 4px;color:#0f172a;">No trophies yet, ${esc(me.username)}!</p>
      <p style="color:#64748b;margin:0 0 16px;">Solve your first puzzle to start your collection.</p>
      <a href="/" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px;">Pick a game →</a>
    </div>`;
    return;
  }

  const stat = (big: string, small: string) =>
    `<div style="flex:1;min-width:96px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 12px;text-align:center;">
      <div style="font-size:26px;font-weight:800;color:#0f172a;line-height:1;">${big}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">${small}</div></div>`;

  const cards = groups.map((g) => {
    const meta = GAME_META[g.game] ?? { label: g.game, emoji: "🎮", path: "/" };
    const mastered = g.count >= MASTERY_NEED;
    const progress = mastered
      ? `<span style="font-size:12px;color:#ca8a04;font-weight:700;">⭐ Mastered</span>`
      : `<span style="display:block;margin-top:6px;height:6px;border-radius:9999px;background:#eef2f7;overflow:hidden;">
           <span style="display:block;height:100%;width:${Math.round((g.count / MASTERY_NEED) * 100)}%;background:#4f46e5;"></span></span>
         <span style="font-size:11px;color:#94a3b8;">${g.count}/${MASTERY_NEED} to master</span>`;
    return `<a href="${meta.path}" style="display:block;text-decoration:none;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:26px;line-height:1;">${meta.emoji}</span>
        <span style="flex:1;"><span style="display:block;font-size:15px;font-weight:800;color:#0f172a;">${esc(meta.label)}</span>
        <span style="font-size:12px;color:#64748b;">${g.count} solved</span></span>
      </div>
      <div style="margin-top:10px;">${progress}</div>
    </a>`;
  }).join("");

  root.innerHTML = header + `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;">
      ${stat(String(total), "puzzles solved")}
      ${stat(`${earnedCount}<span style="font-size:15px;color:#94a3b8;">/${badges.length}</span>`, "badges earned")}
      ${stat(streak > 0 ? `🔥 ${streak}` : "—", streak > 0 ? "day streak" : "no streak yet")}
    </div>

    <h2 style="font-size:16px;font-weight:800;color:#0f172a;margin:0 0 12px;">🏆 Trophy shelf</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:28px;">
      ${badges.map(badgeChip).join("")}
    </div>

    <h2 style="font-size:16px;font-weight:800;color:#0f172a;margin:0 0 12px;">By game</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;">
      ${cards}
    </div>`;

  // Earned badges shown here count as "seen" so the next solve only toasts new ones.
  saveSeen(earnedBadgeIds(completions, Date.now()));
}

// ---- bootstrap ------------------------------------------------------------
async function init(): Promise<void> {
  wireSolveRecording();
  currentMe = await fetchMe();
  renderChip(currentMe);
  // Seed the "seen" set once so badges earned before this load never toast —
  // only genuinely new ones earned during this session pop.
  void getCompletions().then((cs) => {
    if (loadSeen().size === 0) saveSeen(earnedBadgeIds(cs, Date.now()));
  });
  void markSolvedCards();
  void renderHomeCount();
  void renderProfile(currentMe);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
