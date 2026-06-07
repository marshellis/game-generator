// Browser-side personalization: header chip + menu, login/signup modal, solve
// recording (with a sign-in nudge for logged-out players), solved badges on
// grade lists, home count, and the /profile listing. All network calls degrade
// silently — gameplay never depends on them.
import { groupByGame, type GameGroup } from "./profile/completions";
import type { Completion } from "./profile/types";

type Me = { username: string } | null;
type Meta = { game?: string; puzzleId?: string; grade?: string };

const GAME_LABELS: Record<string, string> = {
  "logic-grid": "Logic Grid",
  "math-packet": "Math Worksheets",
  "maze": "Mazes",
  "sudoku": "Sudoku",
  "word-search": "Word Search",
  "kenken": "KenKen",
};

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
  btn.style.cssText =
    "border:1px solid #cbd5e1;background:#fff;border-radius:9999px;padding:4px 12px;" +
    `font-size:13px;font-weight:600;color:#334155;cursor:pointer;transition:background .15s,border-color .15s;font-family:${FONT};`;
  if (me) {
    btn.textContent = `👤 ${me.username} ▾`;
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
  } else {
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
  const setMode = (m: "login" | "signup") => {
    mode = m;
    $("[data-title]").textContent = m === "login" ? "Sign in" : "Create a profile";
    submit.textContent = m === "login" ? "Sign in" : "Create profile";
    $("[data-toggle]").textContent = m === "login" ? "New here? Create a profile" : "Have a profile? Sign in";
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
        body: JSON.stringify({ username, pin }),
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
    } else {
      pendingCompletion = meta;
      // Splash overlay is appended synchronously right after this event fires.
      setTimeout(injectSaveNudge, 0);
    }
  });
}

// ---- solved badges on grade lists ----------------------------------------
async function markSolvedCards(): Promise<void> {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("a[data-puzzle-id]"));
  if (cards.length === 0) return;
  const done = new Set((await fetchCompletions()).map((c) => `${c.game}:${c.puzzleId}`));
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
  const n = (await fetchCompletions()).length;
  if (n > 0) { el.textContent = `✓ ${n} puzzles solved`; el.hidden = false; }
}

// ---- /profile listing -----------------------------------------------------
async function renderProfile(me: Me): Promise<void> {
  const root = document.getElementById("profile-root");
  if (!root) return;
  if (!me) {
    root.innerHTML = `<p style="color:#64748b;">Please <button id="profile-signin" style="background:none;border:none;color:#4f46e5;font-weight:600;cursor:pointer;">sign in</button> to see your progress.</p>`;
    document.getElementById("profile-signin")?.addEventListener("click", () => openAuthModal());
    return;
  }
  const groups: GameGroup[] = groupByGame(await fetchCompletions());
  const total = groups.reduce((s, g) => s + g.count, 0);
  root.innerHTML =
    `<p style="font-size:18px;font-weight:700;margin:0 0 16px;">${me.username} — ${total} puzzles solved</p>` +
    (groups.length === 0
      ? `<p style="color:#64748b;">No puzzles solved yet. Go play one!</p>`
      : groups.map((g) => `
        <div style="margin-bottom:18px;">
          <div style="font-weight:700;margin-bottom:6px;">${GAME_LABELS[g.game] ?? g.game} · ${g.count}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${g.completions.map((c) => `<span style="font-size:12px;background:#f1f5f9;border-radius:9999px;padding:3px 10px;color:#475569;">${c.puzzleId}</span>`).join("")}
          </div>
        </div>`).join(""));
}

// ---- bootstrap ------------------------------------------------------------
async function init(): Promise<void> {
  wireSolveRecording();
  currentMe = await fetchMe();
  renderChip(currentMe);
  void markSolvedCards();
  void renderHomeCount();
  void renderProfile(currentMe);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
