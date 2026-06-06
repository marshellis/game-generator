// site/src/games/shared/number-grid.ts
// Shared controller for "fill an N×N grid with 1–N" games (Sudoku, KenKen).
// Handles selection, conflict highlighting, the on-screen number pad (with
// used-digit dimming), keyboard entry (type / erase / arrow-move), check/clear/
// reveal, localStorage, and the win splash. Each game supplies only what differs.

import { celebrate } from "./win";

export interface NumberGridConfig {
  /** Root element selector, e.g. ".sudoku". */
  rootSel: string;
  /** Cell selector within the root, e.g. ".sudoku-cell". */
  cellSel: string;
  /** localStorage key (already namespaced + id'd). */
  storageKey: string;
  size: number;
  solution: number[][];
  /** Starting grid: givens copy (Sudoku) or zeros (KenKen). */
  initialValues: number[][];
  /** Editable cells accept input; non-editable (givens) are locked. */
  editable: (r: number, c: number) => boolean;
  /** Set of "r,c" cells currently in conflict (row/col/box repeats). */
  conflicts: (values: number[][]) => Set<string>;
  /** Extra win condition beyond "full + no conflicts" (KenKen cages). */
  extraSolved?: (values: number[][]) => boolean;
  /** Write a value into a cell (Sudoku: textContent; KenKen: a .val span). */
  writeCell: (el: HTMLElement, text: string) => void;
  /** Check-button feedback wording (games phrase repeats differently). */
  messages: { repeat: string; extraFail?: string };
}

export function initNumberGrid(cfg: NumberGridConfig): void {
  const root = document.querySelector<HTMLElement>(cfg.rootSel);
  if (!root) return;
  const result = document.querySelector<HTMLElement>("#result");
  const cellEls = Array.from(root.querySelectorAll<HTMLElement>(cfg.cellSel));
  const numEls = Array.from(root.querySelectorAll<HTMLButtonElement>(".num"));
  const checkBtn = document.querySelector<HTMLButtonElement>("#check");
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const revealBtn = document.querySelector<HTMLButtonElement>("#reveal");

  const { size, solution, editable, conflicts } = cfg;
  const extraSolved = cfg.extraSolved ?? (() => true);
  const values = cfg.initialValues.map((r) => r.slice());
  let selected: { r: number; c: number } | null = null;
  let revealed = false;

  const save = () => localStorage.setItem(cfg.storageKey, JSON.stringify(values));
  const load = () => {
    try {
      const raw = localStorage.getItem(cfg.storageKey);
      if (!raw) return;
      const v = JSON.parse(raw);
      if (Array.isArray(v) && v.length === size)
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (editable(r, c)) values[r]![c] = v[r]![c]!;
    } catch { /* ignore */ }
  };

  const render = () => {
    const grid = revealed ? solution : values;
    const bad = revealed ? new Set<string>() : conflicts(values);
    for (const el of cellEls) {
      const r = +el.dataset.r!, c = +el.dataset.c!;
      cfg.writeCell(el, grid[r]![c]! === 0 ? "" : String(grid[r]![c]));
      el.classList.toggle("bg-red-100", bad.has(`${r},${c}`));
      el.classList.toggle("text-red-600", bad.has(`${r},${c}`));
      // Selected cell: bold inset ring + a clear fill so "click a cell, then type"
      // is obvious. Inline background beats the bg-* utilities; inset ring can't
      // be clipped by neighbouring cells.
      const isSel = !revealed && selected?.r === r && selected?.c === c;
      el.classList.toggle("ring-2", isSel);
      el.classList.toggle("ring-inset", isSel);
      el.classList.toggle("ring-brand-500", isSel);
      el.style.backgroundColor = isSel ? "#e0e7ff" : "";
      if (editable(r, c) && !revealed) el.classList.add("cursor-pointer");
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

  const blanks = () => {
    let n = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (values[r]![c]! === 0) n++;
    return n;
  };
  const isSolved = () => blanks() === 0 && conflicts(values).size === 0 && extraSolved(values);

  // Set the selected cell (n = 0 erases). Locked cells are immutable.
  const setValue = (n: number) => {
    if (revealed || !selected || !editable(selected.r, selected.c)) return;
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
    const r = +el.dataset.r!, c = +el.dataset.c!;
    if (revealed || !editable(r, c)) return;
    selected = { r, c };
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
    if (revealed || !result) return;
    if (blanks() > 0) { result.textContent = `${blanks()} cell${blanks() === 1 ? "" : "s"} to go.`; return; }
    if (conflicts(values).size > 0) { result.textContent = cfg.messages.repeat; return; }
    if (!extraSolved(values)) { result.textContent = cfg.messages.extraFail ?? cfg.messages.repeat; return; }
    result.textContent = "🎉 Solved!";
  });

  clearBtn?.addEventListener("click", () => {
    if (revealed) { if (result) result.textContent = "Hide the solution first."; return; }
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (editable(r, c)) values[r]![c] = 0;
    selected = null;
    localStorage.removeItem(cfg.storageKey);
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
