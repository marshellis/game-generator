type Mark = "" | "x" | "o";
const CYCLE: Record<Mark, Mark> = { "": "x", x: "o", o: "" };

function storageKey(id: string): string {
  return `lg:${id}`;
}

export function initPlayer(puzzleId: string, solution: number[][]): void {
  const root = document.querySelector<HTMLElement>(".logic-grid");
  if (!root || root.dataset.interactive !== "1") return;
  const cells = Array.from(root.querySelectorAll<HTMLTableCellElement>("td.cell"));

  const cellId = (c: HTMLTableCellElement) =>
    `${c.dataset.a}-${c.dataset.ai}-${c.dataset.b}-${c.dataset.bi}`;

  const save = () => {
    const state: Record<string, string> = {};
    for (const c of cells) if (c.dataset.mark) state[cellId(c)] = c.dataset.mark;
    localStorage.setItem(storageKey(puzzleId), JSON.stringify(state));
  };

  const stored = localStorage.getItem(storageKey(puzzleId));
  if (stored) {
    const state = JSON.parse(stored) as Record<string, string>;
    for (const c of cells) {
      const m = state[cellId(c)];
      if (m) { c.dataset.mark = m; c.textContent = m === "x" ? "✗" : m === "o" ? "○" : ""; }
    }
  }

  for (const c of cells) {
    c.addEventListener("click", () => {
      const next = CYCLE[(c.dataset.mark as Mark) || ""];
      c.dataset.mark = next;
      c.textContent = next === "x" ? "✗" : next === "o" ? "○" : "";
      save();
    });
  }

  document.querySelector("#check")?.addEventListener("click", () => {
    let correct = true;
    for (const c of cells) {
      const a = +c.dataset.a!, ai = +c.dataset.ai!, b = +c.dataset.b!, bi = +c.dataset.bi!;
      const want: Mark = sameEntity(solution, a, ai, b, bi) ? "o" : "x";
      // only judge cells the player has marked; blanks are "not yet", not "wrong"
      if ((c.dataset.mark || "") && c.dataset.mark !== want) correct = false;
    }
    const msg = document.querySelector("#result");
    if (msg) msg.textContent = correct ? "Looks right so far! ✅" : "Something doesn't match yet. 🤔";
  });

  document.querySelector("#reveal")?.addEventListener("click", () => {
    for (const c of cells) {
      const a = +c.dataset.a!, ai = +c.dataset.ai!, b = +c.dataset.b!, bi = +c.dataset.bi!;
      const yes = sameEntity(solution, a, ai, b, bi);
      c.dataset.mark = yes ? "o" : "x";
      c.textContent = yes ? "○" : "✗";
    }
    save();
  });
}

/** True if (cat a,item ai) and (cat b,item bi) belong to the same anchor entity. */
function sameEntity(sol: number[][], a: number, ai: number, b: number, bi: number): boolean {
  const ea = sol[a]!.indexOf(ai);
  const eb = sol[b]!.indexOf(bi);
  return ea === eb;
}
