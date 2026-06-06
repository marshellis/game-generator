/**
 * Client-side enhancement for a math packet: tapping/typing, answer checking,
 * reveal, reset, and a little celebration. Correct answers live in the DOM as
 * data-* attributes (emitted by MathPacket.astro / SignChoice.astro), so this
 * script needs no puzzle payload.
 */

const GREEN = ["!border-green-500", "bg-green-50"];
const RED = ["!border-red-400", "bg-red-50"];
const CHIP_OK = ["!border-green-500", "ring-2", "ring-green-400"];
const CHIP_BAD = ["!border-red-400", "ring-2", "ring-red-300"];
const SEG_SEL = ["bg-brand-600", "text-white"];
const SEG_OK = ["bg-green-500", "text-white"];
const SEG_BAD = ["bg-red-400", "text-white"];

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function shake(el: Element) {
  if (reduceMotion()) return;
  (el as HTMLElement).animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" },
     { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }],
    { duration: 320, easing: "ease-in-out" },
  );
}

function confetti() {
  if (reduceMotion()) return;
  const colors = ["#4f46e5", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7"];
  for (let i = 0; i < 70; i++) {
    const d = document.createElement("div");
    const size = 7 + Math.random() * 8;
    d.style.cssText =
      `position:fixed;top:-24px;left:${Math.random() * 100}vw;width:${size}px;height:${size}px;` +
      `background:${colors[i % colors.length]};z-index:9999;border-radius:2px;pointer-events:none;`;
    document.body.appendChild(d);
    const dur = 1300 + Math.random() * 1400;
    d.animate(
      [{ transform: `translateY(0) rotate(0deg)`, opacity: 1 },
       { transform: `translateY(105vh) rotate(${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg)`, opacity: 0.9 }],
      { duration: dur, easing: "cubic-bezier(.18,.6,.4,1)" },
    );
    setTimeout(() => d.remove(), dur);
  }
}

const WIN = ["🎉 All {n} correct — you're a math star!", "🌟 Perfect! {n} for {n}!", "🚀 Boom! Nailed all {n}!", "🏆 Champion — {n} out of {n}!"];
const KEEP = ["{c} of {n} — so close, fix the red ones! 💪", "{c} of {n} correct — keep going! ✨", "Nice, {c}/{n}! Try the red ones again. 🔍"];

function clearStatus(el: Element) {
  el.classList.remove(...GREEN, ...RED);
}

export function initPacket(root: HTMLElement): { check: () => void; reveal: () => void; reset: () => void } {
  const numInputs = () => [...root.querySelectorAll<HTMLInputElement>("input.ans-num")];
  const choices = () => [...root.querySelectorAll<HTMLElement>(".js-choice")];
  const clusters = () => [...root.querySelectorAll<HTMLElement>(".js-cluster")];

  const setSeg = (btn: HTMLElement, state: "sel" | "ok" | "bad" | "none") => {
    btn.classList.remove(...SEG_SEL, ...SEG_OK, ...SEG_BAD);
    if (state === "sel") btn.classList.add(...SEG_SEL);
    else if (state === "ok") btn.classList.add(...SEG_OK);
    else if (state === "bad") btn.classList.add(...SEG_BAD);
  };

  // Tap-to-pick for symbol slots (single selection per group).
  for (const grp of choices()) {
    grp.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button.seg");
      if (!btn) return;
      for (const b of grp.querySelectorAll<HTMLElement>("button.seg")) setSeg(b, "none");
      setSeg(btn, "sel");
      grp.dataset.selected = btn.dataset.val;
    });
  }

  // Tap-to-circle for find-the-sum chips (single selection per cluster).
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

  // Laptop: Enter jumps to the next answer box (so you can type, Enter, type…).
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const inputs = numInputs();
    const idx = inputs.indexOf(e.target as HTMLInputElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = inputs[idx + 1];
    if (next) { next.focus(); next.select(); }
    else (e.target as HTMLInputElement).blur();
  });

  let revealed = false;
  // The player's own work, captured before a reveal so Hide can restore it.
  type Snap = { nums: string[]; choices: string[]; clusters: string[] };
  let snap: Snap | null = null;

  const captureSnap = (): Snap => ({
    nums: numInputs().map((i) => i.value),
    choices: choices().map((g) => g.dataset.selected ?? ""),
    clusters: clusters().map((c) => c.dataset.selected ?? ""),
  });
  const markChip = (cl: HTMLElement, idx: string | undefined, kind: "sel" | "ok") => {
    const chips = [...cl.querySelectorAll<HTMLButtonElement>("button.chip")];
    chips.forEach((c) => c.classList.remove("!border-brand-500", "ring-2", "ring-brand-500", ...CHIP_OK, ...CHIP_BAD));
    if (idx === undefined || idx === "") { delete cl.dataset.selected; return; }
    cl.dataset.selected = idx;
    const cls = kind === "ok" ? CHIP_OK : ["!border-brand-500", "ring-2", "ring-brand-500"];
    chips[Number(idx)]?.classList.add(...cls);
  };
  const restoreSnap = (s: Snap) => {
    numInputs().forEach((inp, i) => { inp.value = s.nums[i] ?? ""; clearStatus(inp); });
    choices().forEach((g, i) => {
      g.querySelectorAll<HTMLElement>("button.seg").forEach((b) => setSeg(b, "none"));
      const v = s.choices[i];
      if (v) { g.dataset.selected = v; const seg = [...g.querySelectorAll<HTMLElement>("button.seg")].find((b) => b.dataset.val === v); seg && setSeg(seg, "sel"); }
      else delete g.dataset.selected;
    });
    clusters().forEach((c, i) => markChip(c, s.clusters[i], "sel"));
  };

  const say = (msg: string, tone: "win" | "go" | "none") => {
    const el = document.getElementById("result");
    if (!el) return;
    el.textContent = msg;
    el.className =
      "mt-3 min-h-5 text-sm font-semibold " +
      (tone === "win" ? "text-green-700" : tone === "go" ? "text-slate-700" : "text-slate-700");
  };
  const fill = (tpl: string, c: number, n: number) => tpl.replaceAll("{c}", String(c)).replaceAll("{n}", String(n));

  function check() {
    if (revealed) { say("Hide the answers first to check your own work.", "none"); return; }
    let correct = 0, total = 0;
    for (const inp of numInputs()) {
      clearStatus(inp);
      if (inp.value.trim() === "") continue;
      total++;
      const ok = Number(inp.value) === Number(inp.dataset.answer);
      inp.classList.add(...(ok ? GREEN : RED));
      if (ok) correct++; else shake(inp);
    }
    for (const grp of choices()) {
      for (const b of grp.querySelectorAll<HTMLElement>("button.seg")) setSeg(b, "none");
      if (grp.dataset.selected === undefined) continue;
      total++;
      const ok = grp.dataset.selected === grp.dataset.answer;
      const segs = [...grp.querySelectorAll<HTMLElement>("button.seg")];
      const chosen = segs.find((b) => b.dataset.val === grp.dataset.selected);
      if (chosen) setSeg(chosen, ok ? "ok" : "bad");
      if (!ok) {
        segs.find((b) => b.dataset.val === grp.dataset.answer)?.classList.add(...SEG_OK);
        shake(grp);
      }
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
      if (!ok) { chips[Number(cl.dataset.answerIndex)]?.classList.add(...CHIP_OK); shake(cl); }
      if (ok) correct++;
    }

    if (total === 0) { say("Tap a number, fill the boxes, then check.", "none"); return; }
    if (correct === total) {
      say(fill(WIN[Math.floor(Math.random() * WIN.length)]!, correct, total), "win");
      confetti();
    } else {
      say(fill(KEEP[Math.floor(Math.random() * KEEP.length)]!, correct, total), "go");
    }
  }

  const revealBtn = () => document.getElementById("reveal");
  const setRevealLabel = (on: boolean) => {
    const b = revealBtn();
    if (!b) return;
    const noun = b.dataset.noun ?? "answers";
    b.textContent = on ? `Hide ${noun}` : `👁 Reveal ${noun}`;
    b.setAttribute("aria-pressed", on ? "true" : "false");
  };

  function showAnswers() {
    for (const inp of numInputs()) { inp.value = inp.dataset.answer ?? ""; clearStatus(inp); inp.classList.add(...GREEN); }
    for (const grp of choices()) {
      grp.querySelectorAll<HTMLElement>("button.seg").forEach((b) => setSeg(b, b.dataset.val === grp.dataset.answer ? "ok" : "none"));
      grp.dataset.selected = grp.dataset.answer;
    }
    for (const cl of clusters()) markChip(cl, cl.dataset.answerIndex, "ok");
  }

  /** Toggle: reveal the answer key, or hide it and restore the player's work. */
  function reveal() {
    if (!revealed) {
      snap = captureSnap();
      showAnswers();
      revealed = true;
      setRevealLabel(true);
      say("Showing the answers.", "none");
      const el = document.getElementById("result");
      if (el) el.className = "mt-3 min-h-5 text-sm font-semibold text-amber-700";
    } else {
      if (snap) restoreSnap(snap);
      revealed = false;
      setRevealLabel(false);
      say("", "none");
    }
  }

  function reset() {
    if (revealed) { revealed = false; setRevealLabel(false); }
    for (const inp of numInputs()) { inp.value = ""; clearStatus(inp); }
    for (const grp of choices()) {
      delete grp.dataset.selected;
      grp.querySelectorAll<HTMLElement>("button.seg").forEach((b) => setSeg(b, "none"));
    }
    for (const cl of clusters()) {
      delete cl.dataset.selected;
      cl.querySelectorAll<HTMLButtonElement>("button.chip").forEach((c) => {
        c.setAttribute("aria-pressed", "false");
        c.classList.remove("!border-brand-500", "ring-2", "ring-brand-500", ...CHIP_OK, ...CHIP_BAD);
      });
    }
    say("", "none");
  }

  return { check, reveal, reset };
}
