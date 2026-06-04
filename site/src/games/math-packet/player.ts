/**
 * Client-side enhancement for a math packet: typing/tapping, answer checking,
 * reveal, and reset. Correct answers live in the DOM as data-* attributes
 * (emitted by MathPacket.astro), so this script needs no puzzle payload.
 */

const GREEN = ["!border-green-500", "bg-green-50"];
const RED = ["!border-red-400", "bg-red-50"];
const CHIP_OK = ["!border-green-500", "ring-2", "ring-green-400"];
const CHIP_BAD = ["!border-red-400", "ring-2", "ring-red-300"];

/** Normalize a typed comparison/operator symbol to its canonical glyph. */
function normSign(v: string): string {
  const t = v.trim();
  if (t === "x" || t === "X" || t === "*") return "×";
  if (t === "-" || t === "–" || t === "—") return "−";
  return t;
}

function clearStatus(el: Element) {
  el.classList.remove(...GREEN, ...RED);
}

export function initPacket(root: HTMLElement): { check: () => void; reveal: () => void; reset: () => void } {
  const numInputs = () => [...root.querySelectorAll<HTMLInputElement>("input.ans-num")];
  const signInputs = () => [...root.querySelectorAll<HTMLInputElement>("input.ans-sign")];
  const clusters = () => [...root.querySelectorAll<HTMLElement>(".js-cluster")];

  // Tap-to-select for find-the-sum chips (single selection per cluster).
  for (const cl of clusters()) {
    cl.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button.chip");
      if (!btn) return;
      const chips = [...cl.querySelectorAll<HTMLButtonElement>("button.chip")];
      const already = btn.getAttribute("aria-pressed") === "true";
      for (const c of chips) {
        c.setAttribute("aria-pressed", "false");
        c.classList.remove("!border-brand-500", "ring-2", "ring-brand-500", ...CHIP_OK, ...CHIP_BAD);
      }
      if (!already) {
        btn.setAttribute("aria-pressed", "true");
        btn.classList.add("!border-brand-500", "ring-2", "ring-brand-500");
        cl.dataset.selected = btn.dataset.idx;
      } else {
        delete cl.dataset.selected;
      }
    });
  }

  const result = (correct: number, total: number) => {
    const el = document.getElementById("result");
    if (el) {
      el.textContent = total === 0 ? "" : correct === total ? `🎉 All ${total} correct!` : `${correct} of ${total} correct — keep going!`;
      el.className = "mt-3 min-h-5 text-sm font-semibold " + (correct === total ? "text-green-700" : "text-slate-700");
    }
  };

  function check() {
    let correct = 0, total = 0;
    for (const inp of numInputs()) {
      clearStatus(inp);
      if (inp.value.trim() === "") continue;
      total++;
      const ok = Number(inp.value) === Number(inp.dataset.answer);
      inp.classList.add(...(ok ? GREEN : RED));
      if (ok) correct++;
    }
    for (const inp of signInputs()) {
      clearStatus(inp);
      if (inp.value.trim() === "") continue;
      total++;
      const want = inp.dataset.answer ?? inp.dataset.answerOp ?? "";
      const ok = normSign(inp.value) === normSign(want);
      inp.classList.add(...(ok ? GREEN : RED));
      if (ok) correct++;
    }
    for (const cl of clusters()) {
      const chips = [...cl.querySelectorAll<HTMLButtonElement>("button.chip")];
      chips.forEach((c) => c.classList.remove(...CHIP_OK, ...CHIP_BAD));
      if (cl.dataset.selected === undefined) continue;
      total++;
      const ok = cl.dataset.selected === cl.dataset.answerIndex;
      const chosen = chips[Number(cl.dataset.selected)];
      chosen?.classList.add(...(ok ? CHIP_OK : CHIP_BAD));
      if (!ok) chips[Number(cl.dataset.answerIndex)]?.classList.add(...CHIP_OK);
      if (ok) correct++;
    }
    result(correct, total);
  }

  function reveal() {
    for (const inp of numInputs()) { inp.value = inp.dataset.answer ?? ""; clearStatus(inp); inp.classList.add(...GREEN); }
    for (const inp of signInputs()) { inp.value = inp.dataset.answer ?? inp.dataset.answerOp ?? ""; clearStatus(inp); inp.classList.add(...GREEN); }
    for (const cl of clusters()) {
      const chips = [...cl.querySelectorAll<HTMLButtonElement>("button.chip")];
      chips.forEach((c, i) => {
        c.classList.remove("!border-brand-500", "ring-brand-500", ...CHIP_BAD);
        c.classList.toggle("!border-green-500", String(i) === cl.dataset.answerIndex);
        c.classList.toggle("ring-2", String(i) === cl.dataset.answerIndex);
        c.classList.toggle("ring-green-400", String(i) === cl.dataset.answerIndex);
      });
      cl.dataset.selected = cl.dataset.answerIndex;
    }
    const el = document.getElementById("result");
    if (el) { el.textContent = "Answers revealed."; el.className = "mt-3 min-h-5 text-sm font-semibold text-amber-700"; }
  }

  function reset() {
    for (const inp of [...numInputs(), ...signInputs()]) { inp.value = ""; clearStatus(inp); }
    for (const cl of clusters()) {
      delete cl.dataset.selected;
      cl.querySelectorAll<HTMLButtonElement>("button.chip").forEach((c) => {
        c.setAttribute("aria-pressed", "false");
        c.classList.remove("!border-brand-500", "ring-2", "ring-brand-500", ...CHIP_OK, ...CHIP_BAD);
      });
    }
    result(0, 0);
  }

  return { check, reveal, reset };
}
