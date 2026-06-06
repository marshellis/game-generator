// site/src/games/sudoku/player.ts
import { conflicts } from "./grid";
import { initNumberGrid } from "../shared/number-grid";

interface SudokuData { id: string; size: number; boxW: number; boxH: number; givens: number[][]; solution: number[][]; }

export function initSudoku(data: SudokuData): void {
  const { size, boxW, boxH, givens, solution } = data;
  initNumberGrid({
    rootSel: ".sudoku",
    cellSel: ".sudoku-cell",
    storageKey: `sudoku:${data.id}`,
    size,
    solution,
    initialValues: givens,
    editable: (r, c) => givens[r]![c]! === 0,
    conflicts: (values) => conflicts(values, size, boxW, boxH),
    writeCell: (el, text) => { el.textContent = text; },
    messages: { repeat: "Some numbers repeat — keep trying!" },
  });
}
