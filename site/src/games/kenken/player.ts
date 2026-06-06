// site/src/games/kenken/player.ts
import { conflicts, cageSatisfied, type Cage } from "./grid";

interface KenKenData { id: string; size: number; cages: Cage[]; solution: number[][]; }
const storageKey = (id: string) => `kenken:${id}`;

export function initKenKen(data: KenKenData): void {
  const root = document.querySelector<HTMLElement>(".kenken");
  if (!root) return;
  const result = document.querySelector<HTMLElement>("#result");
  const cellEls = Array.from(root.querySelectorAll<HTMLElement>(".kenken-cell"));
  const numEls = Array.from(root.querySelectorAll<HTMLButtonElement>(".num"));
  const checkBtn = document.querySelector<HTMLButtonElement>("#check");
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const revealBtn = document.querySelector<HTMLButtonElement>("#reveal");

  const { size, cages, solution } = data;
  const values: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  let selected: { r: number; c: number } | null = null;
  let revealed = false;

  const valSpan = (el: HTMLElement) => el.querySelector<HTMLElement>(".val")!;
  const save = () => localStorage.setItem(storageKey(data.id), JSON.stringify(values));
  const load = () => {
    try { const raw = localStorage.getItem(storageKey(data.id)); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v) && v.length === size) for (let r=0;r<size;r++) for (let c=0;c<size;c++) values[r]![c] = v[r]![c]!; } } catch { /* ignore */ }
  };

  const render = () => {
    const grid = revealed ? solution : values;
    const bad = revealed ? new Set<string>() : conflicts(values, size);
    for (const el of cellEls) {
      const r = +el.dataset.r!, c = +el.dataset.c!;
      const v = grid[r]![c]!;
      valSpan(el).textContent = v === 0 ? "" : String(v);
      el.classList.toggle("bg-red-100", bad.has(`${r},${c}`));
      el.classList.toggle("text-red-600", bad.has(`${r},${c}`));
      el.classList.toggle("ring-2", !revealed && selected?.r === r && selected?.c === c);
      el.classList.toggle("ring-brand-500", !revealed && selected?.r === r && selected?.c === c);
    }
  };

  cellEls.forEach((el) => el.addEventListener("click", () => {
    if (revealed) return;
    selected = { r: +el.dataset.r!, c: +el.dataset.c! };
    render();
  }));
  numEls.forEach((btn) => btn.addEventListener("click", () => {
    if (revealed || !selected) return;
    values[selected.r]![selected.c] = +btn.dataset.n!;
    save(); if (result) result.textContent = ""; render();
  }));

  checkBtn?.addEventListener("click", () => {
    if (revealed) return;
    let blanks = 0;
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (values[r]![c]! === 0) blanks++;
    if (blanks > 0) { if (result) result.textContent = `${blanks} cell${blanks===1?"":"s"} to go.`; return; }
    if (conflicts(values, size).size > 0) { if (result) result.textContent = "A row or column repeats — keep trying!"; return; }
    if (!cages.every((cage) => cageSatisfied(cage, values))) { if (result) result.textContent = "A cage doesn't hit its target yet."; return; }
    if (result) result.textContent = "🎉 Solved!";
  });

  clearBtn?.addEventListener("click", () => {
    if (revealed) { if (result) result.textContent = "Hide the solution first."; return; }
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) values[r]![c] = 0;
    selected = null; localStorage.removeItem(storageKey(data.id)); if (result) result.textContent = ""; render();
  });

  revealBtn?.addEventListener("click", () => {
    revealed = !revealed;
    revealBtn.setAttribute("aria-pressed", revealed ? "true" : "false");
    if (result) result.textContent = revealed ? "Showing the solution." : "";
    render();
  });

  load(); render();
}
