// site/src/games/sudoku/player.ts
import { conflicts } from "./grid";

interface SudokuData { id: string; size: number; boxW: number; boxH: number; givens: number[][]; solution: number[][]; }
const storageKey = (id: string) => `sudoku:${id}`;

export function initSudoku(data: SudokuData): void {
  const root = document.querySelector<HTMLElement>(".sudoku");
  if (!root) return;
  const result = document.querySelector<HTMLElement>("#result");
  const cellEls = Array.from(root.querySelectorAll<HTMLElement>(".sudoku-cell"));
  const numEls = Array.from(root.querySelectorAll<HTMLButtonElement>(".num"));
  const checkBtn = document.querySelector<HTMLButtonElement>("#check");
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const revealBtn = document.querySelector<HTMLButtonElement>("#reveal");

  const { size, boxW, boxH, givens, solution } = data;
  const values = givens.map((r) => r.slice());
  let selected: { r: number; c: number } | null = null;
  let revealed = false;

  const at = (r: number, c: number) => cellEls.find((e) => +e.dataset.r! === r && +e.dataset.c! === c)!;

  const load = () => {
    try {
      const raw = localStorage.getItem(storageKey(data.id));
      if (raw) { const v = JSON.parse(raw) as number[][]; if (Array.isArray(v) && v.length === size) for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (givens[r]![c]! === 0) values[r]![c] = v[r]![c]!; }
    } catch { /* ignore */ }
  };
  const save = () => localStorage.setItem(storageKey(data.id), JSON.stringify(values));

  const render = () => {
    const grid = revealed ? solution : values;
    const bad = revealed ? new Set<string>() : conflicts(values, size, boxW, boxH);
    for (const el of cellEls) {
      const r = +el.dataset.r!, c = +el.dataset.c!;
      const given = el.dataset.given === "1";
      const v = grid[r]![c]!;
      el.textContent = v === 0 ? "" : String(v);
      el.classList.toggle("bg-red-100", bad.has(`${r},${c}`));
      el.classList.toggle("text-red-600", bad.has(`${r},${c}`));
      el.classList.toggle("ring-2", !revealed && selected?.r === r && selected?.c === c);
      el.classList.toggle("ring-brand-500", !revealed && selected?.r === r && selected?.c === c);
      if (!given && !revealed) el.classList.add("cursor-pointer");
    }
  };

  cellEls.forEach((el) => el.addEventListener("click", () => {
    if (revealed || el.dataset.given === "1") return;
    selected = { r: +el.dataset.r!, c: +el.dataset.c! };
    render();
  }));

  numEls.forEach((btn) => btn.addEventListener("click", () => {
    if (revealed || !selected) return;
    const n = +btn.dataset.n!;
    if (givens[selected.r]![selected.c]! !== 0) return;
    values[selected.r]![selected.c] = n;
    save();
    if (result) result.textContent = "";
    render();
  }));

  checkBtn?.addEventListener("click", () => {
    if (revealed) return;
    let blanks = 0;
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (values[r]![c]! === 0) blanks++;
    const bad = conflicts(values, size, boxW, boxH);
    if (blanks > 0) { if (result) result.textContent = `${blanks} cell${blanks===1?"":"s"} to go.`; return; }
    if (bad.size > 0) { if (result) result.textContent = "Some numbers repeat — keep trying!"; return; }
    if (result) result.textContent = "🎉 Solved!";
  });

  clearBtn?.addEventListener("click", () => {
    if (revealed) { if (result) result.textContent = "Hide the solution first."; return; }
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (givens[r]![c]! === 0) values[r]![c] = 0;
    selected = null; localStorage.removeItem(storageKey(data.id));
    if (result) result.textContent = "";
    render();
  });

  revealBtn?.addEventListener("click", () => {
    revealed = !revealed;
    revealBtn.setAttribute("aria-pressed", revealed ? "true" : "false");
    if (result) result.textContent = revealed ? "Showing the solution." : "";
    render();
  });

  load();
  render();
}
