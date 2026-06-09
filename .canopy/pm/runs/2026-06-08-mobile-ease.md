## 2026-06-08 — ease of use on mobile (custom lens)

User framing: "lens is ease of use on mobile." The audience plays on a tablet/phone
(per context.md), so mobile ergonomics is a first-class concern, not an afterthought.

Method: read the interactive islands + render components, then **dogfooded the LIVE prod
site at 390×844 across all 7 game types** with the `browse` headless browser (measurements
from `getBoundingClientRect`, not eyeballed). Headline result: **6 of 7 game types are
mobile-solid; Logic Grid was the lone failure** — and it failed worst on its hardest
puzzles (biggest grids).

### Do it
1. **Logic-grid: make the play grid usable on a phone** — Effort: M — Status: MERGED (#40)
   - Branch: feat/logic-grid-mobile-fit. File: `site/src/components/LogicGrid.astro`.
   - Problem: the g7/g8 matrix renders 543–677px wide inside a ~350px phone, but the
     overflow lived in an inner `overflow:auto` box → the *page* didn't scroll and an
     entire answer column sat hidden off the right edge with NO hint it existed. A kid
     can't solve a puzzle whose column they can't see.
   - Fix: wrapped the scroller in a non-scrolling `.grid-frame` so CSS edge-fades + a
     one-time "Swipe for more →" hint pin to the visible edges; a small client script
     reflects scroll position onto `data-overflow` (left/right) so fades only show when a
     column is actually hidden (hint retires after first scroll via `data-scrolled`).
     Bumped X/O cells 30px → 38px on phones for finger taps.
   - Verified on a 390px build of g8: cells 38px, right fade + hint on load (327px hidden),
     scroll right reveals the last category + flips to a left fade, tap-to-cycle ✗/○ intact.

2. **Thumb-reachable Check/Clear/Reveal bar on phones** — Effort: M — Status: auto-merge enabled (#41)
   - Branch: feat/mobile-thumb-controls. File: `site/src/components/GameHeader.astro`.
   - Problem: play controls + result line sat ABOVE the puzzle, so on a tall page (logic
     grid) a kid scrolled back up past the whole grid to Check, and Check's feedback
     appeared off-screen at the top.
   - Fix: split the toolbar into `.gh-setup` (print/answer-key, stays top) and `.gh-play`
     (check/clear/reveal + `#result`). On ≤640px `.gh-play` is `position:fixed` at the
     bottom; buttons flex to equal ~61px-tall taps; result is full-width above them. `main`
     gets `padding-bottom` so the bar never hides the puzzle. Desktop stays one static row.
   - Verified at 390px (g8 logic + g7 sudoku): bar pinned + visible without scrolling, 61px
     taps, result above buttons, number pad works through the bar, nothing clipped at full
     scroll. Desktop 1280px unchanged (static toolbar). All 75 site tests pass.

### Backlog
1. **Logic-grid Clear: replace native `confirm()` with the app's own modal** — Effort: S —
   Why not now: low impact; functional on touch, just inconsistent with the win/profile
   modals. Park until a logic-grid polish pass touches that island.

### Closed
(none)

### Meta-observations
- **Live mobile-width dogfooding > code reading for a mobile lens.** Reading CSS suggested
  *several* possible mobile issues (fixed-px logic-grid cells, number-pad placement, sudoku
  9×9 fold). The 390px prod dogfood collapsed that to ONE real failure (logic grid) and
  cleared the rest with measured evidence. Saved proposing 2–3 speculative fixes to things
  that already work. For any "mobile/responsive/UX" lens, dogfood real device widths FIRST,
  then read code only for the confirmed offenders.
- **A clean negative result is a real deliverable.** "5 of 6 games are mobile-fine" is worth
  stating plainly — it stops future scouts from re-litigating sudoku/maze/word-search mobile.
- **The worst mobile bug was an INVISIBLE scroll.** Overflow inside an `overflow:auto` child
  means the page doesn't scroll, so there's zero affordance that content is hidden — strictly
  worse than the page itself overflowing (which at least shows a scrollbar). When you put
  content in an inner scroll box, you OWN the discoverability (edge fade / hint). Generalize:
  audit every `overflow-x:auto`/`overflow-y:auto` container for "is it obvious there's more?"
- **Build-output path for dogfooding the vercel adapter is `.vercel/output/static/`**, not
  `dist/`. `astro preview` isn't supported with `output:'hybrid'` + `@astrojs/vercel`; serve
  that static dir with `python3 -m http.server` to dogfood a local build before pushing.
- Two independent PRs (different files) shipped cleanly in parallel through the merge queue;
  #40 merged first, #41 enqueued behind it. No conflict — confirms the "different files →
  squash is safe" norm again.
