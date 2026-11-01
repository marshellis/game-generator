# Adding a game

The generator side is contract-driven: a game is a `GameModule` (`generator/src/games/framework.ts`). The site
side is still per-game UI. Everything that can drift is checked by tests, so a missed step fails CI, not a kid.

1. **Scaffold** - `cd generator && npm run new-game -- <id> "<Title>" <emoji> <skill-id>`
   Creates `src/games/<id>/{types,generate,validate,module}.ts` and registers it.
2. **Make `generate` real** - build a puzzle from `makeRng(seed)` and the grade's knobs (`difficultyFor`, calibrated to
   `docs/grade-appropriateness.md`). Same inputs must give byte-identical output.
3. **Make `validate` real** - an INDEPENDENT checker that proves the item from its output alone (a solver, a path walk,
   re-reading every word). It is the only thing standing between a generator bug and a child's worksheet. The
   conformance suite checks it accepts good items AND rejects a corrupted one.
4. **Manifest** - `npm run manifest` rewrites `site/src/data/games.json` (drift is a test failure).
5. **Learning map** - add a skill in `site/src/lib/family/skills.ts` with `game: "<id>"`.
6. **Site** - a zod collection in `site/src/content.config.ts (a `glob` loader per collection)`, a render component, a client island, routes
   (`play` / `print` / `answer`) and a home card, modelled on KenKen.
7. **Generate + review** - `npm run generate -- --game <id> --difficulty g3 --seed 1`, then `npm run generate:all`
   (it refuses to write an item that fails `validate`).

Gate: `cd generator && npm test` (conformance runs every game x grade x 8 seeds) and `cd site && npm test && npm run build`.

For **arcade** (static) games see `site/public/arcade/README.md`; they are held to `arcade-contract.test.ts`.
