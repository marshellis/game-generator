# Marshellis Game Generator

A small generator for kids' logic puzzles, published to https://games.marshellis.com.

The first game is **logic grid puzzles** ("zebra" / Dell-puzzle-book style): several
categories of things plus a list of clues; the solver marks each grid cell **X** (can't
match) or **O** (must match) and deduces the one consistent solution. Every generated
puzzle is guaranteed to have **exactly one solution, reachable by pure deduction (no
guessing)**.

## Layout

- `generator/` — standalone TypeScript package (run locally). Pure logic: a
  constraint-propagation solver, candidate-clue enumeration, minimal no-guess clue
  reduction, grade 1–8 difficulty presets, theme packs, and a CLI. Heavily unit-tested.
- `site/` — the Astro static site (this is what Vercel builds). Reads puzzle JSON from
  `site/src/content/puzzles/`, renders an index, an interactive player, and a printable
  worksheet + answer key.

## Generate a puzzle

```bash
cd generator
npm install
npm run generate -- --difficulty g5 --seed 42 --date 2026-06-04
# flags:
#   --difficulty g1..g8   grade preset (grid size, clue types, reading level)
#   --seed <n>            reproducibility
#   --date <YYYY-MM-DD>   used in the puzzle id
#   --categories <n>      override grid width
#   --items <n>           override grid height
#   --grade "<label>"     override the displayed grade label
```

This writes a JSON puzzle into `site/src/content/puzzles/`.

## Generate a math worksheet (game 2)

The second game is **printable daily math packets**: one page per grade holding a
mixed set of 3–4 quick number-puzzle blocks (find-the-sum clusters, make-ten,
number bonds, missing-number, order-of-operations, place value, rounding,
comparison, patterns, ten-frames, story problems, fractions). Every item carries
its own correct answer, so the printed answer key is guaranteed right by
construction — the math analog of the logic grid's single-solution guarantee.

```bash
cd generator
npm run generate -- --game math-packet --difficulty g3 --seed 31 --date 2026-06-04
# --difficulty g1..g8 selects grade (number ranges + which puzzle types appear)
```

This writes a JSON packet into `site/src/content/packets/`. Each grade's eligible
puzzle types and number ranges live in `generator/src/games/math-packet/grades.ts`
and `activities.ts`. The site renders an interactive (tap/type/check) player and a
printable worksheet + answer key, both mobile-friendly.

## Better phrasing (optional)

The CLI uses deterministic template phrasing (e.g. "Ann goes with Dog."). For engaging,
realistic, or funny clues, open the generated JSON and ask Claude in-session to rewrite
each clue's `text` field. **Keep `structured` unchanged** — it is the source of truth for
the logic and the answer key, so rephrasing `text` can never make a puzzle unsolvable.

## Preview locally

```bash
cd site
npm install
npm run dev      # interactive play at http://localhost:4321
npm run build    # verify it compiles + validates before publishing
```

## Publish

```bash
git add site/src/content/puzzles/ && git commit -m "content: new puzzle" && git push
```

Vercel auto-deploys `main` to games.marshellis.com.

## Test

```bash
cd generator && npm test
cd site && npm test
```
