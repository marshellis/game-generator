// site/src/games/maze/player.ts
import { type Cell, isValidStep, isEntryPoint } from "./grid";

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

  const extendTo = (cell: Cell) => {
    if (revealed) return;
    const head = trail[trail.length - 1]!;
    if (same(cell, head)) return;
    const prev = trail[trail.length - 2];
    if (prev && same(cell, prev)) { trail.pop(); render(); save(); return; } // backtrack
    if (isValidStep(data.open, head, cell)) {
      trail.push(cell); render(); save();
      if (same(cell, data.end) && result) result.textContent = "🎉 You made it!";
    }
  };

  let dragging = false;
  svg.addEventListener("pointerdown", (ev) => {
    if (revealed) return;
    const cell = cellAt(ev); if (!cell) return;
    // continue dragging from the current head, or (re)start a trail at any entrance icon
    if (same(cell, trail[trail.length - 1]!)) {
      dragging = true; svg.setPointerCapture(ev.pointerId);
    } else if (isEntryPoint(entries, cell)) {
      trail = [cell]; render(); save();
      dragging = true; svg.setPointerCapture(ev.pointerId);
      if (result) result.textContent = "";
    }
  });
  svg.addEventListener("pointermove", (ev) => { if (dragging) { const c = cellAt(ev); if (c) extendTo(c); } });
  svg.addEventListener("pointerup", () => { dragging = false; });
  // tap-to-step fallback: tapping a neighbor of the head steps once
  svg.addEventListener("click", (ev) => {
    if (revealed) return;
    const c = cellAt(ev as unknown as PointerEvent); if (c) extendTo(c);
  });

  // Laptop: arrow keys step the trail head (extendTo handles walls, backtrack, win).
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
    extendTo(next);
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
