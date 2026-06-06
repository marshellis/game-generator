# 2026-06-06 — Word Search (game 5)

Lens: user-value (priority #1 = more games / variety)
Mode: autonomous (`/canopy:pm-autonomous`)

## Phase A — Working-backwards draft

Prior runs: none (first autonomous sprint on this project). No overlap risk.

### Target email draft (as if already true)

**Subject:** [game-generator] What's new — Word Search

**Headline:** New game: Word Search — themed letter hunts to play or print.

**Highlight 1 — Word Search (game 5), grades 1–8.**
Hunt themed words (animals, space, ocean, and more) in a letter grid. Tap the first
and last letter to find a word on screen — it crosses off your list — or print the
sheet with a matching answer key. Grids and word counts scale by grade: little kids
get an 8×8 with across/down words; older kids get bigger grids with diagonals and
backwards words.
- Try it: https://games.marshellis.com/word-search

### Self-critique

- **Clear — PASS.** A parent reads "New game: Word Search" and immediately knows what's
  new and who it's for. The highlight names one concrete clickable thing (`/word-search`).
- **Testable — PASS.** One-line proof: "Open games.marshellis.com/word-search, pick a
  grade, open a puzzle, tap a word's first + last letter → it crosses off; or open Print /
  Print answer key." Every claim is click-provable on prod.
- **Impressive — PASS.** A brand-new playable + printable game in a genre kids love,
  directly serving the #1 priority (variety). Not "code is cleaner" — "there's a whole new
  game tonight."

All three PASS → proceed to Phase B. Single strong highlight; keep the PR focused.

## Phase B — Derived work

One proposal (the headline IS the work):

**Word Search game (game 5) on the catalog framework.**
- Generator: `games/word-search/{types,themes,difficulty,generate,module}.ts` + `registry.ts` entry.
- Content collection `wordsearches` in `site/src/content/config.ts`.
- Site: `components/WordSearch.astro`, `games/word-search/{grid,player}.ts`,
  routes `word-search/{index, grade/[grade], [id], [id]/print, [id]/answer}`, home card.
- Tests (TDD): generator placement-correctness property tests + site grid-selection tests.
- Content: one puzzle per grade g1–g8 (lean, to keep the diff reasonable).

Correctness is low-risk vs. sudoku: no uniqueness solver needed — each placed word is
recorded with exact start/end coords, so the answer key is correct by construction. Tests
assert every listed word reads correctly along the grid.

Effort: L (single proposal, ~the Sudoku template). Within the ~6h cycle budget.

## Phase C — Ship

Branch: `game-generator/auto/word-search-game` (from origin/main).

### Gate 3a — mechanical checks (all PASS)
- unit: 202 generator + 11 site tests pass (added 6 generator + 5 site word-search tests).
- types: `tsc --noEmit` exit 0. (Surfaced + fixed a *pre-existing* type error in
  `math-packet.test.ts:281` — an `inBand(...)` call missing the required `stars` field,
  unrelated to word search. Fixed incidentally so the types gate is honestly green;
  echoes skill learning #10: a diagnostic must pass on known-good state.)
- lint: no-op (no lint script configured).
- secret-scan: clean. diff-size: 2699 lines < 3000 cap.

### Gate 3b — five-question self-review (all PASS)
1. **Invariant changed?** Extended the catalog `REGISTRY` (now 5 modules) and added the
   `wordsearches` Astro content collection. New game-level invariant: every entry in
   `words[]` reads correctly along its `start→end` coords (answer-key correctness),
   enforced by the generate property test across all grades × seeds.
2. **Riskiest line?** `generate.ts`: `if (words.length >= d.wordCount) break;` — relies on
   each theme having enough grid-fitting words to hit the target count. Mitigated: every
   theme has ≥20 words ≤8 letters, and a test asserts `words.length === wordCount` for
   every grade (incl. the smallest 8×8 grid).
3. **Senior-eng objection?** Placement is brute-force (scans all start cells per direction);
   fine at size ≤12 but wouldn't scale to huge grids. Also: themed word banks live in the
   generator (matching the maze-themes precedent) rather than in content/ — a defensible
   but arguable placement.
4. **Touched a behavior-codifying test?** Yes — `registry.test.ts` expected-id list 4→5
   games (intent legitimately grew, not an assertion patch). The math-packet fix added a
   type-required field only; `stars` is unused by `inBand`, so no intent changed.
5. **Ship while on vacation?** Yes — answer-key correctness is property-tested across all
   grades/seeds; full site build emits all 313 pages incl. word-search play/print/answer.
   The only unverified surface is the live tap-to-find interaction → covered by the
   post-deploy 3c prod dogfood.

### Ship outcome
- PR #10 merged → deployed (run 27074347177 success). Live at /word-search.
- **Concurrency note:** this repo had ~4 other autonomous sessions shipping at the same
  time (math-packet #11, maze #13, and a competing **KenKen "game 5"** PR #12). My #10's
  first merge_group run was cancelled when #11 took the queue batch; re-enqueued and merged
  clean. The "one PR in flight" guardrail is per-session — it does NOT see other agents' PRs.

### 3d post-deploy health — PASS
Root, /word-search, a play page, and an answer page all 200; home shows the Word Search card.

### 3c prod dogfood — PASS (after 1 fix-forward)
Drove https://games.marshellis.com/word-search/...g3-3 with the headless browser:
tapped GRASS (1,2)→(5,2) and RAIN (0,5)→(3,8) — result went 0→1→2 of 8, words struck off.
- **Fix-forward 1/3 (PR #14):** found/revealed grid cells weren't visually highlighting.
  The island added `bg-brand-100` but left the component's base `bg-white`; both are Tailwind
  utilities so stylesheet order (not DOM order) decided, and `bg-white` won. Fixed by swapping
  base classes out on highlight / back on clear. Re-deployed (run 27074517450 success),
  re-dogfooded: found cell now computes `rgb(224,231,255)`. Captured hero shots
  (play / revealed / answer / mobile / home).

## Phase D — Reality reconciliation
What shipped matches the plan: one brand-new game, live, with working tap-to-find + print +
answer key across grades 1–8. The single email highlight survived intact.
- Re-run critiques: **Clear** ✓ / **Testable** ✓ (tap-to-find verified on prod) /
  **Impressive** ✓ (a whole new game). Proceed to send.
- **PM-process learning (candidate universal):** the autonomous guardrail "one PR in flight"
  is session-scoped and blind to *other* concurrent autonomous agents on the same repo. Today
  that produced a merge-queue cancellation and a duplicate "game 5" naming collision with a
  parallel KenKen sprint. Worth a canopy follow-up (detect peer autonomous PRs by label
  before claiming a theme). Logged here; surfaced in the closing message.

## Phase E — Send + stop
- Screenshots captured from prod, pushed to `pm-assets/2026-06-06-word-search` (raw URLs 200).
- Email rendered (2 highlights: tap-to-find play + printable answer key), E.4 desktop+mobile
  render checked — both heroes load, layout typographic, links indigo, mobile holds.
- **Sent** via `ace:email-communicator` (gog, ace@dimagi-ai.com → jjackson@dimagi.com).
  messageId `19e9ee42b2423b60`, threadId `19e9ee42b2423b60`.
- Asset branch: https://github.com/marshellis/game-generator/tree/pm-assets/2026-06-06-word-search

### Phase E.5 — post-send self-review
Sender: ace:email-communicator · message 19e9ee42b2423b60 · assets on pm-assets/2026-06-06-word-search.
Improvement ideas for next cycle, ranked:
1. **Cross-session theme claim check (universal).** Before Phase A commits to a theme, query
   `gh pr list --label autonomous --state open` AND scan recent merges so two agents don't both
   ship "game 5". Today word-search and a parallel KenKen sprint collided. Strongest candidate
   for a canopy follow-up PR.
2. **E.4 must wait for remote images before judging.** First render screenshotted before the
   raw.githubusercontent images loaded; they looked missing. Always `wait --networkidle` (or
   poll `img.naturalWidth>0`) before the render-check screenshot. Worth baking into the skill's
   E.4 step.
3. **Mobile brand bar wraps** ("MARSHELLIS GAMES · RELEASE NOTES" → 2 lines at 375px). Minor;
   shorten to "MARSHELLIS · RELEASE NOTES" or stack the date deliberately next time.
4. **Add a jsdom regression test for the island highlight** so the bg-white/bg-brand-100
   shadowing bug can't silently return (current site tests are pure-logic, no DOM).
