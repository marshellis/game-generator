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

## Process notes
- This repo is worked by **multiple concurrent autonomous sessions** (emdash worktrees). The
  "one PR in flight" guardrail is session-scoped — it does not see peer agents' PRs. Expect
  merge-queue cancellations and watch for theme collisions (a parallel KenKen sprint also
  claimed "game 5" on 2026-06-06). Re-enqueue if your merge_group run gets cancelled.
