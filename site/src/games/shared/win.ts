// site/src/games/shared/win.ts
// Shared "you won!" celebration: confetti + a splash overlay that points the
// player back to the grade list (pick another puzzle) or the all-games home.
// The back links are read from the GameHeader breadcrumb already on the page, so
// this works for every game with no per-route wiring. Styling is inline so the
// runtime-injected overlay never depends on whether Tailwind kept these classes.

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function confetti(): void {
  if (reduceMotion()) return;
  const colors = ["#4f46e5", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7"];
  for (let i = 0; i < 90; i++) {
    const d = document.createElement("div");
    const size = 7 + Math.random() * 9;
    d.style.cssText =
      `position:fixed;top:-24px;left:${Math.random() * 100}vw;width:${size}px;height:${size}px;` +
      `background:${colors[i % colors.length]};z-index:10001;border-radius:2px;pointer-events:none;`;
    document.body.appendChild(d);
    const dur = 1400 + Math.random() * 1500;
    d.animate(
      [{ transform: "translateY(0) rotate(0deg)", opacity: 1 },
       { transform: `translateY(110vh) rotate(${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg)`, opacity: 0.9 }],
      { duration: dur, easing: "cubic-bezier(.18,.6,.4,1)" },
    );
    setTimeout(() => d.remove(), dur);
  }
}

let shown = false;

/** Show the win splash once. `title` is the celebratory headline. */
export function celebrate(title = "You solved it!"): void {
  if (shown) return;
  shown = true;
  // Single recording chokepoint for every game — the profile client listens for this.
  document.dispatchEvent(new CustomEvent("puzzle:solved"));
  confetti();

  // GameHeader breadcrumb is [All games / <Game> / <grade>]. Last link = grade list
  // (pick another puzzle); middle link names the game.
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("header nav a"));
  const gradeLink = links[links.length - 1];
  const gameLink = links.length >= 2 ? links[links.length - 2] : null;
  const backHref = gradeLink?.getAttribute("href") || "/";
  const gameName = gameLink?.textContent?.trim() || "another puzzle";

  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;" +
    "padding:24px;background:rgba(15,23,42,.6);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";
  if (!reduceMotion()) overlay.style.animation = "wsfade .2s ease-out";

  const btn = "display:block;width:100%;box-sizing:border-box;padding:12px 16px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;";
  overlay.innerHTML = `
    <div style="width:100%;max-width:360px;background:#fff;border-radius:16px;padding:32px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.25);">
      <div style="font-size:60px;line-height:1;${reduceMotion() ? "" : "animation:wspop .45s cubic-bezier(.2,.9,.3,1.4)"}">🎉</div>
      <h2 style="margin:14px 0 4px;font-size:24px;font-weight:800;color:#0f172a;">${title}</h2>
      <p style="margin:0;font-size:15px;color:#64748b;">Great job! Ready for another?</p>
      <div style="margin-top:24px;display:flex;flex-direction:column;gap:8px;">
        <a href="${backHref}" style="${btn}background:#4f46e5;color:#fff;">Play another ${gameName} &rarr;</a>
        <a href="/" style="${btn}background:#fff;color:#334155;border:1px solid #cbd5e1;">All games</a>
      </div>
      <button type="button" class="win-stay" style="margin-top:16px;background:none;border:none;font-size:13px;color:#94a3b8;cursor:pointer;">Stay on this puzzle</button>
    </div>
    <style>
      @keyframes wsfade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes wspop { from { transform: scale(.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
    </style>`;

  const dismiss = () => { overlay.remove(); shown = false; };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });
  overlay.querySelector<HTMLButtonElement>(".win-stay")?.addEventListener("click", dismiss);
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { dismiss(); document.removeEventListener("keydown", esc); }
  });
  document.body.appendChild(overlay);
}
