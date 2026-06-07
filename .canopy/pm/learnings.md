# Product Management Learnings

Items closed or rejected during PM cycles. Read this before every scout run to avoid re-proposing.

## Closed Items
(none yet)

## Preferences
- Audience is the owner's kids + friends' kids — fun-first, not commercial, not schools. Discoverability/SEO is out of scope.
- Priorities: more games > polish existing > correctness. Lead proposals with kid-facing value, not code cleanliness.

## Project gotchas
- **Tailwind utility shadowing in client islands.** Components paint base classes
  (`bg-white text-slate-800`); an island that *adds* a highlight class (`bg-brand-100`)
  without *removing* the base sees no visual change — both are utilities, so the one later
  in the compiled stylesheet wins regardless of DOM class order. Always swap the base class
  OUT when applying a state class in JS (and back on clear). Caught on word-search 2026-06-06.
  Astro pages that set the class statically (e.g. answer-key `showSolution`) are unaffected.
- **A new game ≈ 20 templated files + per-grade content JSON.** Each puzzle serializes one
  grid cell per line, so 8 puzzles ≈ 1800 lines. The autonomous `diff_size_limit_lines` is
  set to 3000 for this reason; content is deterministic, test-covered generator output.
- **Adding a game = module + `registry.ts` entry + content collection in `content/config.ts`
  + render component + island + 5 routes + home card.** `cli.ts` needs NO edit (dispatches via
  registry). Sudoku (PR #8) and Word Search (PR #10) are the templates.
- **Serverless functions ⇒ build under Node 20.** The site is `output: 'hybrid'` with
  `@astrojs/vercel@7` (pinned for Astro 4). That adapter only recognizes Node **18/20**
  (`SUPPORTED_NODE_VERSIONS`); building under anything else (CI was Node 22) silently falls
  back to the now-**invalid `nodejs18.x`** runtime and *every* Vercel deploy fails with
  `invalid "runtime": _render (nodejs18.x)`. `.github/workflows/deploy.yml` pins the deploy
  job to Node 20 → `nodejs20.x`. Don't bump it without checking the adapter's supported set.
  Caught after the user-profiles feature (2026-06-07). Upgrading to `@astrojs/vercel@8`
  (needs Astro 5) would lift this.
- **`@upstash/redis` auto-(de)serializes JSON.** `set`/`hset` an object → it's stored as
  JSON; `get`/`hgetall` returns it already **parsed to an object**, not a string. Do NOT
  `JSON.parse()` the read value (it throws and you silently lose data — the completions list
  came back empty for exactly this reason). Store/read plain objects. Caught 2026-06-07.
- **Profiles/accounts run on a thin `/api/*` serverless layer** (username+PIN, Upstash Redis).
  Pure logic lives in `site/src/lib/profile/` (unit-tested with a fake store); routes are thin
  adapters with `export const prerender = false`. The integration injects `KV_REST_API_URL/TOKEN`
  (not `UPSTASH_REDIS_REST_*`); `SESSION_SECRET` is set manually in Vercel (Production). CI
  needs no secrets. Pages stay static and personalize client-side via `profile-client.ts`.

## Process notes
- This repo is worked by **multiple concurrent autonomous sessions** (emdash worktrees). The
  "one PR in flight" guardrail is session-scoped — it does not see peer agents' PRs. Expect
  merge-queue cancellations and watch for theme collisions (a parallel KenKen sprint also
  claimed "game 5" on 2026-06-06). Re-enqueue if your merge_group run gets cancelled.
- **Force-push is BLOCKED on all branches** (server pre-receive hook: "protected branch hook
  declined"), not just `main`. You cannot rebase-and-force an open PR's branch. To rewrite
  history (rebase onto newer main), push a **new branch + new PR** and close the old — or merge
  main IN (non-rewriting). Caught 2026-06-07.
- **Squash-merge ships the PR's DIFF, not the branch's file snapshot.** A PR whose base predates
  a peer's change to file X will NOT revert X when it merges, as long as the PR's own diff doesn't
  touch X. `git diff origin/main` on a behind-branch showing X as "changed" is cosmetic (you're
  just behind) — don't panic-rebase over it; only rebase if YOUR diff conflicts. (2026-06-07:
  feared a trophy-case PR was reverting the #31 maze fix; the squash kept #31 intact.)
- **Peer refactored the same file concurrently?** Take their version wholesale
  (`git checkout origin/main -- <file>`), then re-apply your *additive* changes via Edit. Cleaner
  than a line-level rebase conflict when both sides rewrote the same functions. (2026-06-07: #29
  rewrote profile-client.ts's menu/modal while I added the trophy shelf.)
