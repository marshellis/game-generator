# CLAUDE.md

Guidance for AI agents working in this repo (`game-generator` → https://games.marshellis.com).

## Merge policy — ALWAYS AUTO-MERGE, NEVER WAIT FOR HUMAN REVIEW

The owner does **not** do code reviews. Do not ask for one, do not wait for one, do not
leave PRs open pending approval.

- After opening a PR, **merge it yourself immediately** once CI is green. There is no human
  review gate.
- Prefer: `gh pr create ...` then `gh pr merge <n> --merge --auto --delete-branch`
  (`--auto` lets GitHub merge the moment the `test` check passes; repo auto-merge is enabled).
  If `--auto` isn't applicable, merge directly: `gh pr merge <n> --merge --delete-branch`.
- You may also commit small changes straight to `main` — that's fine here.
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
  `generator/src/games/<game>/`; shared RNG in `generator/src/core/`. `cli.ts` dispatches by
  `--game`. Generators write JSON into `site/src/content/<collection>/`.
- `site/` — Astro + Tailwind v4 static app. Per-game render components in
  `site/src/components/`, client islands in `site/src/games/<game>/`, routes in
  `site/src/pages/<game>/`. Shared `GameHeader.astro`; play/print/answer route split.
- `docs/grade-appropriateness.md` — cited grade-level framework ALL games calibrate
  difficulty against. `docs/research/` — raw research. `docs/superpowers/` — specs + plans.

Games so far: logic-grid, math-packet, maze. New games follow the same per-game module +
content-collection + route pattern, calibrated to the grade framework, with web play + a
printable + an answer key.

## Commands

- Generator: `cd generator && npm test` · `npm run generate -- --game <game> --difficulty g3 --seed 1`
- Site: `cd site && npm run build` · `npm test` · `npm run dev`

## Conventions

- Difficulty presets cover grades 1–8 (platform default).
- Logic in code, flavor in content: generators emit correct template text; fun/themed
  wording is authored in-session (no API key).
