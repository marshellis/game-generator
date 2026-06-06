# game-generator — Product Context

## What It Is
A kids' puzzle-game generator that produces play-online + printable + answer-key puzzles, calibrated to grade levels (g1–g8), deployed as a static Astro site at https://games.marshellis.com.

## Who Uses It
- **Primary users**: the owner's own kids and friends' kids — at home, on a tablet/phone or on printed paper. NOT a commercial product, NOT schools.
- **Usage pattern**: ad-hoc play. A kid (or parent) opens a game, picks a difficulty/grade, plays in the browser or prints a sheet + answer key. Low-stakes, fun-first.

## What Matters Most
1. **More games / variety** — keep it fresh with new game types and mechanics.
2. **Polish existing games** — the games we have should feel great: play UX, print quality, difficulty that actually matches the grade.
3. **Reliability / correctness** — generators must always emit solvable, correctly-graded, bug-free puzzles (a wrong answer key or unsolvable puzzle is the worst outcome for a kid).

(Discoverability / landing-page SEO is explicitly NOT a priority — the audience arrives by direct link.)

## Tech Stack
- `generator/` — TypeScript puzzle generators (Vitest). One module per game implementing the shared `GameModule` contract (`framework.ts`), registered in `registry.ts`; `grades.ts` holds the game-agnostic grade bands; `catalog.ts` + `--all` drive all games. Seeded RNG in `core/rng.ts`.
- `site/` — Astro + Tailwind v4 static app. Per-game render component + client island + play/print/answer routes. Shared `GameHeader.astro`.
- Deploy: merge to `main` → GitHub Actions (`deploy.yml`) runs tests then `vercel deploy --prod`.

## Current State
4 games live: Logic Grid, Math Worksheets, Mazes, Sudoku — all on the shared catalog framework. Difficulty calibrated against `docs/grade-appropriateness.md`. CI is a single `test` gate (generator + site Vitest suites); repo auto-merges via merge queue, no human review.

## Known Considerations
- **Merge policy**: ALWAYS auto-merge once CI is green (merge queue enabled); no human review gate. Quality bar stays high via TDD + spec→plan→build.
- **Logic in code, flavor in content**: generators emit correct template text; themed/fun wording is authored in-session (no API key at runtime).
- **Difficulty must be measurable, not eyeballed** — calibrate against the grade framework, ideally via each module's `score()` landing in the grade's target band.
- Static site: no backend, no auth, no localhost stack needed — dogfood happens against deployed prod.
