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

Push/merge to `main` → GitHub Actions (`.github/workflows/deploy.yml`) runs generator typecheck + tests, site tests + the production
build, then `vercel pull/build/deploy --prebuilt --prod` (Node 22, asserts `nodejs22.x` functions). On pull requests the `test` job is the
required gating check; `e2e.yml` / `e2e-multiplayer.yml` also run on PRs touching the site (not required). Live at games.marshellis.com
(games on play.marshellis.com). Env changes need a new deploy. Rollback and everything else operational: `docs/runbook.md`.

## Layout

- `generator/` — TypeScript puzzle generators (Vitest). One module per game under
  `generator/src/games/<game>/`, each implementing the shared `GameModule` contract in
  `generator/src/games/framework.ts` and registered in `generator/src/registry.ts`.
  `generator/src/grades.ts` defines the game-agnostic meaning of g1–g8 (each module's
  `difficultyFor()` maps a grade to its own knobs). Shared RNG in `generator/src/core/`.
  `cli.ts` dispatches by `--game`; `catalog.ts` + `--all` drive every registered module.
  Generators write JSON into `site/src/content/<collection>/`.
- `site/` — Astro 7 + Tailwind v4 (hybrid: static pages + serverless API on Vercel). Per-game render components in
  `site/src/components/`, client islands in `site/src/games/<game>/`, shared island helpers
  (N×N number-grid controller, win splash) in `site/src/games/shared/`, routes in
  `site/src/pages/<game>/`. Shared `GameHeader.astro`; play/print/answer route split.
- `docs/grade-appropriateness.md` — cited grade-level framework ALL games calibrate
  difficulty against. `docs/research/` — raw research. `docs/superpowers/` — specs + plans.
- `AGENTS.md` — concurrent-merge norms (this repo is worked by multiple parallel agents).
  `docs/README.md` — the documentation index. `.canopy/pm/learnings.md` — project gotchas worth reading before a new game (e.g. Tailwind
  utility-shadowing in islands: swap the base class OUT, don't just add a state class).

Games so far: logic-grid (Logic Grid), math-packet (Math Worksheets), maze (Mazes),
sudoku (Sudoku), word-search (Word Search), kenken (KenKen). Adding a game = a module under
`generator/src/games/<game>/` registered in `registry.ts`, a content collection in
`site/src/content.config.ts` (a `glob` loader per collection), a render component + client island + route set + home card —
all calibrated to the grade framework and shipping web play + a printable + an answer key.
`cli.ts` needs no edit (it dispatches via the registry).

## Arcade (a separate, simpler pathway)

The generated games above are grade-calibrated puzzle content. **Arcade games** are self-contained interactive HTML/JS games in `/arcade`
(NOT grade-calibrated, NOT daily). Adding one = drop a folder into `site/public/arcade/<slug>/` (`index.html`, `game.json`, assets) and open a PR; discovery
(`site/src/lib/arcade.ts`) generates the cards and the per-game wrapper page. The contract for authors (and their AI) is
`site/public/arcade/README.md`; `_template/` is a working example.

What every arcade change must respect (all enforced by tests):
- Games run on the **isolated origin** (`play.marshellis.com`) in a sandboxed iframe: no cookies, no direct site/API access. The wrapper page
  (`src/pages/arcade/[slug]/play.astro`) is the host: it owns the play clock, the time-up screen, brain breaks and the "Who's playing?" picker, and
  relays an allowlist (`_sdk/marshellis.js`). Never widen the relay without a test in `site/test/sim/isolation.sim.test.ts`.
- **Every game wires the learning loop**: load `_sdk/marshellis.js` + `_sdk/rounds.js` and call `MGRounds.end()` where a round ends
  (`arcade-contract.test.ts` fails otherwise). Games that call `/api/...` themselves load `_sdk/compat.js` first.
- **Guests are first-class and metered** (default 15 min/day). Never add a login wall.
- Architecture, trust boundaries and the data model: `docs/architecture.md`. Ops: `docs/runbook.md`. Isolated origin: `docs/arcade-origin.md`.

## Family platform (accounts, learning mix, play time, subscriptions, store)

Code in `site/src/lib/family/` (pure handlers over an injectable `KV`; routes under `/api/family/*` via `router.ts`). Child profiles ARE the legacy
username accounts. Free-vs-paid is data in `plans.ts`; every parent-tunable choice is a field in `settings.ts`. Browser side:
`site/public/arcade/_sdk/`. Parent UI: `/family`; store: `/store`. Design history: `docs/superpowers/specs/2026-10-30-family-platform-design.md`.
Legal drafts (NOT live, need a lawyer): `docs/legal/`. **All environment variables are listed in `docs/runbook.md`** (do not add one without
adding it there). Rules of the road: the server is the source of truth for time; destructive parent actions need the password; every state-changing
request is Origin-checked; `SESSION_SECRET` and `GAME_PASS_SECRET` stay separate; fail closed.

## Tests - run the right layer (`docs/testing.md`)
- Changing the SDK, relay, wrapper, family API or a game: `cd site && npm test` (unit + `test/sim`), then `npm run e2e` (real browsers; ONE Playwright process at a time).
- Changing a multiplayer game or the pass/room kit: `npm run e2e:mp` (needs `npm run e2e:mp:setup` once).
- Changing a generator: `cd generator && npm test && npm run typecheck`.
- New feature: add its lifecycle step and its attacker to the simulation suite, and its routes to the fuzz table.
- Needs Node >= 22.23.4 (Astro 7).

## Commands

- Generator: `cd generator && npm test` · `npm run generate -- --game <game> --difficulty g3 --seed 1`
  · `npm run generate:all` (every registered game) · `npm run typecheck`
- Site: `cd site && npm run build` · `npm test` · `npm run dev` · `npm run e2e` · `npm run e2e:mp`

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
