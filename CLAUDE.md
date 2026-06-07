# CLAUDE.md

Guidance for AI agents working in this repo (`game-generator` → https://games.marshellis.com).

## Merge policy — ALWAYS AUTO-MERGE, NEVER WAIT FOR HUMAN REVIEW

The owner does **not** do code reviews. Do not ask for one, do not wait for one, do not
leave PRs open pending approval.

- After opening a PR, **merge it yourself immediately** once CI is green. There is no human
  review gate.
- Prefer: `gh pr create ...` then `gh pr merge <n> --squash --auto --delete-branch`
  (`--auto` adds the PR to the merge queue; it merges the moment the `test` check passes).
- `main` is a **protected, squash-only merge queue** — direct pushes are blocked and
  `--merge` commits are rejected. Everything goes through a PR. See `AGENTS.md` for the
  full concurrent-merge norms (rebase-first, watch for merge-queue cancellations).
- The **only** gate is **green CI** (the `test` job: generator + site test suites). Never
  merge red. If tests fail, fix them, then merge.
- Quality still matters: keep using TDD and the spec → plan → build flow for features. The
  "no review" rule is about not waiting on a human, not about lowering the bar.

## Deploy

Push/merge to `main` → GitHub Actions (`.github/workflows/deploy.yml`) runs tests, then
`vercel pull/build/deploy --prebuilt --prod`. On pull requests the `test` job runs as a
gating check but no deploy happens. Live at games.marshellis.com. Manual fallback:
`cd site && npx vercel --prod`.

## Layout

- `generator/` — TypeScript puzzle generators (Vitest). One module per game under
  `generator/src/games/<game>/`, each implementing the shared `GameModule` contract in
  `generator/src/games/framework.ts` and registered in `generator/src/registry.ts`.
  `generator/src/grades.ts` defines the game-agnostic meaning of g1–g8 (each module's
  `difficultyFor()` maps a grade to its own knobs). Shared RNG in `generator/src/core/`.
  `cli.ts` dispatches by `--game`; `catalog.ts` + `--all` drive every registered module.
  Generators write JSON into `site/src/content/<collection>/`.
- `site/` — Astro + Tailwind v4 static app. Per-game render components in
  `site/src/components/`, client islands in `site/src/games/<game>/`, shared island helpers
  (N×N number-grid controller, win splash) in `site/src/games/shared/`, routes in
  `site/src/pages/<game>/`. Shared `GameHeader.astro`; play/print/answer route split.
- `docs/grade-appropriateness.md` — cited grade-level framework ALL games calibrate
  difficulty against. `docs/research/` — raw research. `docs/superpowers/` — specs + plans.
- `AGENTS.md` — concurrent-merge norms (this repo is worked by multiple parallel agents).
  `.canopy/pm/learnings.md` — project gotchas worth reading before a new game (e.g. Tailwind
  utility-shadowing in islands: swap the base class OUT, don't just add a state class).

Games so far: logic-grid (Logic Grid), math-packet (Math Worksheets), maze (Mazes),
sudoku (Sudoku), word-search (Word Search), kenken (KenKen). Adding a game = a module under
`generator/src/games/<game>/` registered in `registry.ts`, a content collection in
`site/src/content/config.ts`, a render component + client island + route set + home card —
all calibrated to the grade framework and shipping web play + a printable + an answer key.
`cli.ts` needs no edit (it dispatches via the registry).

## Commands

- Generator: `cd generator && npm test` · `npm run generate -- --game <game> --difficulty g3 --seed 1`
  · `npm run generate:all` (every registered game) · `npm run typecheck`
- Site: `cd site && npm run build` · `npm test` · `npm run dev`

## Conventions

- Difficulty presets cover grades 1–8 (platform default); the grade→difficulty meaning lives
  in `generator/src/grades.ts`, game-specific knobs in each module's `difficultyFor()`.
- Logic in code, flavor in content: generators emit correct template text; fun/themed
  wording is authored in-session (no API key).
- **Logic-grid clues are ALWAYS flavored before shipping — never ship plain template
  wording.** Generation happens in a session like this one: after `generate`/`generate:all`
  produces the structured puzzles, rewrite every clue's `text` in the theme's voice
  (pirate/wizard/monster/etc.), in character and funny, keeping the `structured` logic and
  person-anchoring untouched (text is display-only). There is no "plain" output mode in
  practice — flavoring is part of generating logic-grid puzzles.
- Every game shows the **day of the week** it's for (derived from `createdAt` via
  `site/src/lib/day.ts`): a long badge on the play page (GameHeader `date` prop) and a short
  weekday tag on grade-list cards.
