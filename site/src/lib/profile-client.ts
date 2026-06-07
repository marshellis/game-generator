// Browser-side personalization: header chip, login/signup modal, solve recording,
// solved badges on grade lists, home count, and the /profile listing. All network
// calls degrade silently — gameplay never depends on them.
import { groupByGame, type GameGroup } from "./profile/completions";
import type { Completion } from "./profile/types";

type Me = { username: string } | null;

const GAME_LABELS: Record<string, string> = {
  "logic-grid": "Logic Grid",
  "math-packet": "Math Worksheets",
  "maze": "Mazes",
  "sudoku": "Sudoku",
  "word-search": "Word Search",
  "kenken": "KenKen",
};

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

// ---- header chip ----------------------------------------------------------
function renderChip(me: Me): void {
  const slot = document.getElementById("profile-chip");
  if (!slot) return;
  slot.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.style.cssText =
    "border:1px solid #cbd5e1;background:#fff;border-radius:9999px;padding:4px 12px;" +
    "font-size:13px;font-weight:600;color:#334155;cursor:pointer;";
  if (me) {
    btn.textContent = `👤 ${me.username}`;
    btn.addEventListener("click", () => openMenu(me));
  } else {
    btn.textContent = "Sign in";
    btn.addEventListener("click", () => openAuthModal());
  }
  slot.appendChild(btn);
}

function openMenu(me: Me): void {
  if (!me) return;
  if (confirm(`Signed in as ${me.username}.\n\nOK = go to your profile, Cancel = log out.`)) {
    location.href = "/profile";
  } else {
    void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(() => location.reload());
  }
}

// ---- auth modal -----------------------------------------------------------
function openAuthModal(): void {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;" +
    "padding:24px;background:rgba(15,23,42,.6);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";
  const input = "width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;margin-top:8px;";
  const btn = "display:block;width:100%;box-sizing:border-box;padding:11px 16px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:none;";
  overlay.innerHTML = `
    <div style="width:100%;max-width:340px;background:#fff;border-radius:16px;padding:28px;box-shadow:0 20px 50px rgba(0,0,0,.25);">
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#0f172a;" data-title>Sign in</h2>
      <p style="margin:0;font-size:13px;color:#64748b;">Username + PIN. No email needed.</p>
      <input data-username placeholder="username" autocomplete="username" style="${input}" />
      <input data-pin placeholder="PIN (4-8 digits)" inputmode="numeric" autocomplete="off" style="${input}" />
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
  const setMode = (m: "login" | "signup") => {
    mode = m;
    $("[data-title]").textContent = m === "login" ? "Sign in" : "Create a profile";
    submit.textContent = m === "login" ? "Sign in" : "Create profile";
    $("[data-toggle]").textContent = m === "login" ? "New here? Create a profile" : "Have a profile? Sign in";
  };

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  $("[data-cancel]").addEventListener("click", close);
  $("[data-toggle]").addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

  submit.addEventListener("click", async () => {
    const username = $<HTMLInputElement>("[data-username]").value.trim();
    const pin = $<HTMLInputElement>("[data-pin]").value.trim();
    error.textContent = "";
    submit.disabled = true;
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, pin }),
      });
      if (r.ok) { location.reload(); return; }
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
  });
}

// ---- solve recording ------------------------------------------------------
function wireSolveRecording(): void {
  document.addEventListener("puzzle:solved", () => {
    const el = document.getElementById("puzzle-meta");
    if (!el?.textContent) return;
    let meta: { game?: string; puzzleId?: string; grade?: string };
    try { meta = JSON.parse(el.textContent); } catch { return; }
    void fetch("/api/completions", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(meta),
    }).catch(() => {});
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
  const me = await fetchMe();
  renderChip(me);
  void markSolvedCards();
  void renderHomeCount();
  void renderProfile(me);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
