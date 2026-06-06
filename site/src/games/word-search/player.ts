// site/src/games/word-search/player.ts
import { lineBetween, matchEndpoints, wordCells, type PlacedWord, type Pos } from "./grid";

interface WordSearchData { id: string; words: PlacedWord[]; }
const storageKey = (id: string) => `word-search:${id}`;

export function initWordSearch(data: WordSearchData): void {
  const root = document.querySelector<HTMLElement>(".wordsearch");
  if (!root) return;
  const cellEls = Array.from(root.querySelectorAll<HTMLElement>(".ws-cell"));
  const wordEls = Array.from(root.querySelectorAll<HTMLElement>(".ws-word"));
  const result = document.querySelector<HTMLElement>("#result");
  const checkBtn = document.querySelector<HTMLButtonElement>("#check");
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const revealBtn = document.querySelector<HTMLButtonElement>("#reveal");

  const { words } = data;
  const total = words.length;
  const found = new Set<number>();
  let first: Pos | null = null;
  let revealed = false;

  const at = (p: Pos) => cellEls.find((e) => +e.dataset.r! === p.r && +e.dataset.c! === p.c)!;
  // The component paints unsolved cells `bg-white text-slate-800`. Both base and
  // highlight are Tailwind utilities, so the one later in the stylesheet wins
  // regardless of DOM class order — `bg-white` shadowed `bg-brand-100`. Swap the
  // base classes OUT when highlighting (and back when clearing) so the colour shows.
  const BASE_CLASSES = ["bg-white", "text-slate-800"];
  const FOUND_CLASSES = ["bg-brand-100", "text-brand-800"];

  const paintCell = (el: HTMLElement) => { el.classList.remove(...BASE_CLASSES); el.classList.add(...FOUND_CLASSES); };
  const unpaintCell = (el: HTMLElement) => { el.classList.remove(...FOUND_CLASSES); el.classList.add(...BASE_CLASSES); };

  const paintWord = (i: number) => {
    for (const p of wordCells(words[i]!)) paintCell(at(p));
    const el = wordEls.find((e) => e.dataset.word === words[i]!.word);
    el?.classList.add("line-through", "text-slate-400");
  };

  const clearSelection = () => {
    first = null;
    for (const el of cellEls) el.classList.remove("ring-2", "ring-brand-500");
  };

  const status = () => {
    if (result) result.textContent = found.size === total ? "🎉 You found them all!" : `${found.size} of ${total} found.`;
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(storageKey(data.id));
      if (raw) for (const i of JSON.parse(raw) as number[]) if (i >= 0 && i < total) found.add(i);
    } catch { /* ignore */ }
  };
  const save = () => localStorage.setItem(storageKey(data.id), JSON.stringify([...found]));

  cellEls.forEach((el) => el.addEventListener("click", () => {
    if (revealed) return;
    const p: Pos = { r: +el.dataset.r!, c: +el.dataset.c! };
    if (!first) { first = p; el.classList.add("ring-2", "ring-brand-500"); return; }
    // Second tap: validate the straight line, then match endpoints.
    const line = lineBetween(first, p);
    const i = line ? matchEndpoints(first, p, words) : -1;
    if (i >= 0 && !found.has(i)) {
      found.add(i);
      paintWord(i);
      save();
      status();
    } else if (result && i < 0) {
      result.textContent = "Not a word — try again.";
    }
    clearSelection();
  }));

  checkBtn?.addEventListener("click", status);

  clearBtn?.addEventListener("click", () => {
    if (revealed) { if (result) result.textContent = "Hide the answers first."; return; }
    found.clear();
    localStorage.removeItem(storageKey(data.id));
    for (const el of cellEls) unpaintCell(el);
    for (const el of wordEls) el.classList.remove("line-through", "text-slate-400");
    clearSelection();
    if (result) result.textContent = "";
  });

  revealBtn?.addEventListener("click", () => {
    revealed = !revealed;
    revealBtn.setAttribute("aria-pressed", revealed ? "true" : "false");
    clearSelection();
    if (revealed) {
      for (let i = 0; i < total; i++) paintWord(i);
      if (result) result.textContent = "Showing every word.";
    } else {
      for (const el of cellEls) unpaintCell(el);
      for (const el of wordEls) el.classList.remove("line-through", "text-slate-400");
      for (const i of found) paintWord(i);
      status();
    }
  });

  load();
  for (const i of found) paintWord(i);
  status();
}
