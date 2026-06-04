type Mark = "" | "x" | "o";
const CYCLE: Record<Mark, Mark> = { "": "x", x: "o", o: "" };
const glyph = (m: Mark): string => (m === "x" ? "✗" : m === "o" ? "○" : "");

// v2: the old key persisted revealed solutions, which made puzzles load pre-filled.
function storageKey(id: string): string {
  return `lg2:${id}`;
}

export function initPlayer(puzzleId: string, solution: number[][]): void {
  const root = document.querySelector<HTMLElement>(".logic-grid");
  if (!root || root.dataset.interactive !== "1") return;
  const cells = Array.from(root.querySelectorAll<HTMLTableCellElement>("td.cell"));
  const result = document.querySelector<HTMLElement>("#result");
  const checkBtn = document.querySelector<HTMLButtonElement>("#check");
  const clearBtn = document.querySelector<HTMLButtonElement>("#clear");
  const revealBtn = document.querySelector<HTMLButtonElement>("#reveal");

  let revealed = false;

  const cellId = (c: HTMLTableCellElement) =>
    `${c.dataset.a}-${c.dataset.ai}-${c.dataset.b}-${c.dataset.bi}`;

  const setMark = (c: HTMLTableCellElement, m: Mark) => {
    if (m) c.dataset.mark = m;
    else delete c.dataset.mark;
    c.textContent = glyph(m);
  };

  const sameEntity = (a: number, ai: number, b: number, bi: number) =>
    solution[a]!.indexOf(ai) === solution[b]!.indexOf(bi);
  const solutionMark = (c: HTMLTableCellElement): Mark =>
    sameEntity(+c.dataset.a!, +c.dataset.ai!, +c.dataset.b!, +c.dataset.bi!) ? "o" : "x";

  // --- the player's own marks live in localStorage; the revealed solution never does ---
  const saveProgress = () => {
    const state: Record<string, string> = {};
    for (const c of cells) if (c.dataset.mark) state[cellId(c)] = c.dataset.mark;
    localStorage.setItem(storageKey(puzzleId), JSON.stringify(state));
  };
  const renderFromSaved = () => {
    let state: Record<string, string> = {};
    try {
      state = JSON.parse(localStorage.getItem(storageKey(puzzleId)) || "{}");
    } catch { state = {}; }
    for (const c of cells) setMark(c, (state[cellId(c)] as Mark) || "");
  };

  renderFromSaved();

  for (const c of cells) {
    c.addEventListener("click", () => {
      if (revealed) return; // don't edit the revealed overlay
      setMark(c, CYCLE[(c.dataset.mark as Mark) || ""]);
      saveProgress();
    });
  }

  checkBtn?.addEventListener("click", () => {
    if (!result) return;
    if (revealed) { result.textContent = "Hide the solution first to check your own work."; return; }
    let marked = 0, wrong = 0;
    for (const c of cells) {
      const m = (c.dataset.mark as Mark) || "";
      if (!m) continue;
      marked++;
      if (m !== solutionMark(c)) wrong++;
    }
    if (wrong > 0) result.textContent = `${wrong} mark${wrong > 1 ? "s" : ""} ${wrong > 1 ? "don't" : "doesn't"} fit the clues yet. 🤔`;
    else if (marked < cells.length) result.textContent = "Looking good so far — keep going! ✅";
    else result.textContent = "You solved it! 🎉";
  });

  clearBtn?.addEventListener("click", () => {
    if (revealed) { if (result) result.textContent = "Hide the solution first."; return; }
    if (!confirm("Clear all your marks on this puzzle?")) return;
    for (const c of cells) setMark(c, "");
    localStorage.removeItem(storageKey(puzzleId));
    if (result) result.textContent = "";
  });

  revealBtn?.addEventListener("click", () => {
    revealed = !revealed;
    if (revealed) {
      for (const c of cells) setMark(c, solutionMark(c));
      revealBtn.textContent = "Hide solution";
      revealBtn.setAttribute("aria-pressed", "true");
      root.dataset.revealed = "1";
      if (result) result.textContent = "Showing the answer.";
    } else {
      renderFromSaved();
      revealBtn.textContent = "Reveal solution";
      revealBtn.setAttribute("aria-pressed", "false");
      delete root.dataset.revealed;
      if (result) result.textContent = "";
    }
  });
}
