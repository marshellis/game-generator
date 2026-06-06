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
