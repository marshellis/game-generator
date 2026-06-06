// site/src/games/sudoku/player.ts
import { conflicts } from "./grid";
import { celebrate } from "../shared/win";

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
      // Selected cell: bold inset ring + a clear fill so "click a cell, then type"
      // is obvious. Inline background beats the bg-* utilities reliably; inset ring
      // can't be clipped by neighbouring cells.
      const isSel = !revealed && selected?.r === r && selected?.c === c;
      el.classList.toggle("ring-2", isSel);
      el.classList.toggle("ring-inset", isSel);
      el.classList.toggle("ring-brand-500", isSel);
      el.style.backgroundColor = isSel ? "#e0e7ff" : "";
      if (!given && !revealed) el.classList.add("cursor-pointer");
    }
    // Dim number-pad keys already placed `size` times — nothing left to enter.
    const counts = new Array(size + 1).fill(0);
    for (const row of values) for (const v of row) counts[v]!++;
    for (const btn of numEls) {
      const n = +btn.dataset.n!;
      if (n === 0) continue; // Erase is always available
      btn.disabled = !revealed && counts[n]! >= size;
      btn.classList.toggle("opacity-30", btn.disabled);
    }
  };

  const isSolved = () => {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (values[r]![c]! === 0) return false;
    return conflicts(values, size, boxW, boxH).size === 0;
  };

  // Set the selected cell (n = 0 erases). Givens are immutable.
  const setValue = (n: number) => {
    if (revealed || !selected) return;
    if (givens[selected.r]![selected.c]! !== 0) return;
    values[selected.r]![selected.c] = n;
    save();
    if (result) result.textContent = "";
    render();
    if (isSolved()) { if (result) result.textContent = "🎉 Solved!"; celebrate("🎉 Solved!"); }
  };
  // Move the selection with arrow keys, clamped to the grid.
  const move = (dr: number, dc: number) => {
    const r = selected ? selected.r : 0, c = selected ? selected.c : 0;
    selected = { r: Math.max(0, Math.min(size - 1, r + dr)), c: Math.max(0, Math.min(size - 1, c + dc)) };
    render();
  };

  cellEls.forEach((el) => el.addEventListener("click", () => {
    if (revealed || el.dataset.given === "1") return;
    selected = { r: +el.dataset.r!, c: +el.dataset.c! };
    render();
  }));

  numEls.forEach((btn) => btn.addEventListener("click", () => setValue(+btn.dataset.n!)));

  // Laptop: type a digit to fill, Backspace/Delete/0 to erase, arrows to move.
  document.addEventListener("keydown", (e) => {
    if (revealed) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const k = e.key;
    if (k === "ArrowUp") move(-1, 0);
    else if (k === "ArrowDown") move(1, 0);
    else if (k === "ArrowLeft") move(0, -1);
    else if (k === "ArrowRight") move(0, 1);
    else if (k === "Backspace" || k === "Delete" || k === "0") setValue(0);
    else if (/^[1-9]$/.test(k) && +k <= size) setValue(+k);
    else return;
    e.preventDefault();
  });

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
