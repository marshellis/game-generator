// site/src/games/kenken/player.ts
import { conflicts, cageSatisfied, type Cage } from "./grid";
import { initNumberGrid } from "../shared/number-grid";

interface KenKenData { id: string; size: number; cages: Cage[]; solution: number[][]; }

export function initKenKen(data: KenKenData): void {
  const { size, cages, solution } = data;
  const zeros = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  initNumberGrid({
    rootSel: ".kenken",
    cellSel: ".kenken-cell",
    storageKey: `kenken:${data.id}`,
    size,
    solution,
    initialValues: zeros,
    editable: () => true,
    conflicts: (values) => conflicts(values, size),
    extraSolved: (values) => cages.every((cage) => cageSatisfied(cage, values)),
    writeCell: (el, text) => { el.querySelector<HTMLElement>(".val")!.textContent = text; },
    messages: { repeat: "A row or column repeats — keep trying!", extraFail: "A cage doesn't hit its target yet." },
  });
}
