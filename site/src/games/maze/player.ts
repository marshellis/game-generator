// site/src/games/maze/player.ts
import { type Cell, isValidStep, isEntryPoint, corridorPath, nearestReachable } from "./grid";
import { celebrate } from "../shared/win";

// How far the trail will "catch up" along a corridor in a single pointer move.
// Covers sparse pointer events on fast drags and the 2-cell diagonal jump at a
// corner, while keeping an accidental cross-wall drift from filling a long detour.
const MAX_STEP = 6;

interface MazeData {
  id: string; cols: number; rows: number; open: number[][];
  start: Cell; end: Cell; solution: Cell[];
  decoyStarts?: Cell[];
}
const storageKey = (id: string) => `maze:${id}`;

export function initMaze(data: MazeData): void {
  const root = document.querySelector<HTMLElement>(".maze");
  if (!root || root.dataset.interactive !== "1") return;
  const svg = root.querySelector<SVGSVGElement>("svg.maze-svg")!;
  const trailEl = svg.querySelector<SVGPolylineElement>("#trail")!;
  const solEl = svg.querySelector<SVGPolylineElement>("#solution")!;
  const result = document.querySelector<HTMLElement>("#result");
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const revealBtn = document.querySelector<HTMLButtonElement>("#reveal");

  const CS = 28; // must match Maze.astro
  const center = (c: Cell) => `${c.c * CS + CS / 2},${c.r * CS + CS / 2}`;
  const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
  const entries: Cell[] = [data.start, ...(data.decoyStarts ?? [])];

  let trail: Cell[] = [data.start];
  let revealed = false;

  const render = () => { trailEl.setAttribute("points", trail.map(center).join(" ")); };
  const save = () => localStorage.setItem(storageKey(data.id), JSON.stringify(trail));
  const load = () => {
    try {
      const raw = localStorage.getItem(storageKey(data.id));
      if (raw) { const t = JSON.parse(raw) as Cell[]; if (t.length && isEntryPoint(entries, t[0]!)) trail = t; }
    } catch { /* ignore */ }
  };

  // map a pointer event to a grid cell via the SVG bounding box
  const cellAt = (ev: PointerEvent): Cell | null => {
    const rect = svg.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width * data.cols;
    const y = (ev.clientY - rect.top) / rect.height * data.rows;
    const c = Math.floor(x), r = Math.floor(y);
    if (r < 0 || r >= data.rows || c < 0 || c >= data.cols) return null;
    return { r, c };
  };

  // continuous finger position in grid units (cell (r,c) center = (c+0.5, r+0.5)).
  // We chase the *nearest reachable corridor cell* to this point, not the cell the
  // finger floors onto, so an off-center drag still flows in the obvious direction.
  const fingerAt = (ev: PointerEvent): { x: number; y: number } => {
    const rect = svg.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) / rect.width * data.cols,
      y: (ev.clientY - rect.top) / rect.height * data.rows,
    };
  };

  const trailIndexOf = (cell: Cell) => trail.findIndex((t) => same(t, cell));
  const truncateTo = (i: number) => { if (i >= 0 && i < trail.length - 1) { trail.length = i + 1; render(); save(); } };

  // one orthogonal step from the head (push, per-step backtrack, win detection)
  const extendStep = (cell: Cell) => {
    if (revealed) return;
    const head = trail[trail.length - 1]!;
    if (same(cell, head)) return;
    const prev = trail[trail.length - 2];
    if (prev && same(cell, prev)) { trail.pop(); render(); save(); return; } // backtrack
    if (isValidStep(data.open, head, cell)) {
      trail.push(cell); render(); save();
      if (same(cell, data.end)) { if (result) result.textContent = "🎉 You made it!"; celebrate("🎉 You made it!"); }
    }
  };

  // chase the finger at grid coords (fx, fy): pick the nearest reachable corridor
  // cell and move the head there so the line flows smoothly in the obvious direction
  // even when the finger is off-center. Forward: fill the unique corridor (follows
  // corners and catches up on fast drags). Backward: retrace contiguously from the
  // head only — never jump the head to a far/earlier segment the finger drifted near.
  // `allowBack` is off for taps so a tap can only ever advance, never back up.
  const chase = (fx: number, fy: number, allowBack: boolean) => {
    if (revealed) return;
    const head = trail[trail.length - 1]!;
    const target = nearestReachable(data.open, head, fx, fy, MAX_STEP);
    if (same(target, head)) return;
    const onTrail = trailIndexOf(target);
    if (onTrail >= 0) {
      if (allowBack && trail.length - 1 - onTrail <= MAX_STEP) truncateTo(onTrail);
      return;
    }
    const path = corridorPath(data.open, head, target, MAX_STEP);
    if (path) for (const step of path) extendStep(step);
  };

  let dragging = false;
  svg.addEventListener("pointerdown", (ev) => {
    if (revealed) return;
    const cell = cellAt(ev); if (!cell) return;
    const onTrail = trailIndexOf(cell);
    if (onTrail >= 0) {
      // grab the trail (it's a fat, easy target) to start dragging — but never jump
      // the head back to the press point. Backing up happens only by dragging the
      // head back over the trail (see dragTo), so a press near a previous line can't
      // erase progress.
      dragging = true; svg.setPointerCapture(ev.pointerId);
    } else if (isEntryPoint(entries, cell)) {
      trail = [cell]; render(); save();
      dragging = true; svg.setPointerCapture(ev.pointerId);
      if (result) result.textContent = "";
    }
  });
  svg.addEventListener("pointermove", (ev) => { if (dragging) { const f = fingerAt(ev); chase(f.x, f.y, true); } });
  svg.addEventListener("pointerup", () => { dragging = false; });
  // tap fallback: tapping ahead flows the corridor forward toward the tap. Taps never
  // back up (allowBack=false) — you drag the head back, so a tap can't jump the trail.
  svg.addEventListener("click", (ev) => {
    if (revealed) return;
    const f = fingerAt(ev as unknown as PointerEvent);
    chase(f.x, f.y, false);
  });

  // Laptop: arrow keys step the trail head (extendStep handles walls, backtrack, win).
  document.addEventListener("keydown", (e) => {
    if (revealed) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const head = trail[trail.length - 1]!;
    let next: Cell | null = null;
    if (e.key === "ArrowUp") next = { r: head.r - 1, c: head.c };
    else if (e.key === "ArrowDown") next = { r: head.r + 1, c: head.c };
    else if (e.key === "ArrowLeft") next = { r: head.r, c: head.c - 1 };
    else if (e.key === "ArrowRight") next = { r: head.r, c: head.c + 1 };
    else return;
    e.preventDefault();
    if (next.r < 0 || next.r >= data.rows || next.c < 0 || next.c >= data.cols) return;
    extendStep(next);
  });

  clearBtn?.addEventListener("click", () => {
    if (revealed) { if (result) result.textContent = "Hide the solution first."; return; }
    trail = [data.start]; render(); localStorage.removeItem(storageKey(data.id));
    if (result) result.textContent = "";
  });

  revealBtn?.addEventListener("click", () => {
    revealed = !revealed;
    if (revealed) {
      solEl.style.display = ""; trailEl.style.display = "none";
      revealBtn.setAttribute("aria-pressed", "true");
      if (result) result.textContent = "Showing the path.";
    } else {
      solEl.style.display = "none"; trailEl.style.display = "";
      revealBtn.setAttribute("aria-pressed", "false");
      if (result) result.textContent = same(trail[trail.length - 1]!, data.end) ? "🎉 You made it!" : "";
    }
  });

  load(); render();
}
