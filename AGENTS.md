# Agent merge policy

Multiple agents merge to `main` constantly. `main` is protected by a ruleset:
**every change goes through a PR, the `test` check must pass, and merges run
through a merge queue** (squash). Direct pushes to `main` are blocked. Follow
these norms so concurrent merges stay clean.

## Before you push
- **Rebase on latest main first:** `git fetch origin && git rebase origin/main`.
  Small, frequent PRs drift less and conflict less.
- **Run the gate locally:** `cd generator && npm test` and `cd site && npm test`,
  and `cd site && npm run build`. The CI `test` job runs both suites; don't push
  red.

## Merging
- Open a PR and enable auto-merge with squash:
  `gh pr create ... && gh pr merge --auto --squash`.
- The merge queue serializes merges and re-runs `test` against the combined
  result, so `main` never goes red from two PRs that each passed against an
  older `main`. Don't try to merge manually/bypass the queue.
- Branches auto-delete on merge.

## Avoid conflicts at the source
- **One module per game.** A new game is its own directory under
  `generator/src/games/<game>/` + `site/src/games/<game>/` and registers itself;
  don't hand-edit shared hot files for each game.
- **Prefer registry/auto-discovery over central lists.** Editing the same lines
  of `cli.ts`, `site/src/content/config.ts`, or `site/src/pages/index.astro` in
  two branches at once is the main collision source — extend the shared
  GameModule contract instead.
- **Generated content is one file per item** (`site/src/content/<coll>/<id>.json`),
  so regenerating never conflicts across games.

## Difficulty
All games calibrate against `docs/grade-appropriateness.md` and report the same
`{maxTier, steps, score}` shape with a stored 1–5 rating. See that doc before
changing per-grade tuning.
