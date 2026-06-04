# Logic Grid Puzzle Generator — Design Spec

**Date:** 2026-06-04
**Status:** Approved (design), pending implementation plan
**Author:** Jonathan Jackson + Claude

## Summary

Build a small **game generator** whose first game is a **logic grid puzzle**
generator (the "logic grid" / "zebra" / Dell-puzzle-book kind: several
categories of things plus a list of clues; the solver marks each grid cell
**X** (can't match) or **O** (must match) and deduces the one consistent
solution). Generated puzzles are stored as static data and published to
**games.marshellis.com**, where kids can both **play interactively** and
**print a clean worksheet + answer key**.

The build is a **thin vertical slice**: this one game done end-to-end, with a
folder layout that leaves a clean slot for a second game (printable math
worksheets) in a later design pass — but no platform abstractions until that
second game justifies them.

## Goals

- Generate logic grid puzzles that are **guaranteed to have exactly one
  solution, reachable by pure deduction (no guessing)**.
- Make puzzles **engaging / realistic / funny** via themed scenarios and clue
  phrasing.
- Target **any grade level** via a difficulty model (default focus: rising 5th
  and 7th graders, but every knob is configurable).
- Let kids **play in the browser** and **print worksheets with answer keys**.
- **Publish** new puzzles to games.marshellis.com with a simple, secret-free
  flow (git push → Vercel auto-deploy).

## Non-Goals (v1)

- User accounts / login / server-side state.
- Auto-grading dashboards or progress tracking across devices.
- The math-worksheet game (separate design pass later).
- Programmatic Claude-API phrasing at generation time (interface is left open
  for it, but not built in v1).

## Core Design Principle

**Logic lives in code; flavor comes from AI.**

The deterministic core (solver, uniqueness, no-guess solvability, minimal-clue
reduction, difficulty knobs) is owned by tested TypeScript. AI is used **only**
to rephrase already-proven-correct structured clues into fun prose. Because the
answer key is derived from the hidden `solution` (not from the prose), and
solvability is proven from the *structured* clues, the phrasing layer can be as
silly as we like without ever breaking a puzzle.

## Architecture

Two independent npm projects in one repo (no workspace tooling):

```
game-generator/
├─ generator/                 # standalone TS package, run locally only
│  ├─ src/core/               # solver, uniqueness + no-guess checker, difficulty knobs, RNG
│  ├─ src/games/logic-grid/   # clue-fact enumeration, minimal-clue reduction, phrasing interface
│  ├─ src/cli.ts              # `generate` command → writes validated puzzle JSON into the site
│  └─ test/                   # vitest
└─ site/                      # Astro app  ← Vercel builds THIS (root directory = site/)
   ├─ src/content/puzzles/    # the puzzle store: one JSON per puzzle (Zod-validated collection)
   ├─ src/games/logic-grid/   # interactive player island + print layout
   └─ src/pages/             # index, /puzzle/[id], /puzzle/[id]/print
```

- **Generator:** TypeScript, executed via `tsx`, tested with **Vitest**. Pure
  logic; no UI framework. Reads/writes JSON.
- **Site:** **Astro**, static output, deployed to Vercel. Ships near-zero JS
  except one interactive island (the player). First-class print styling.
- **Package manager:** npm.

## Data Model

One JSON file per puzzle, validated by an Astro content-collection (Zod) schema:

```ts
{
  id: string,              // stable slug, e.g. "2026-06-04-pets-snacks-01"
  title: string,
  themeBlurb: string,      // short funny intro shown to the player
  gameType: "logic-grid",
  gradeLabel: string,      // free text, e.g. "5th grade"
  difficulty: string,      // preset id, e.g. "g4-5"
  categories: Array<{
    name: string,          // e.g. "Kid", "Pet", "Color"
    ordered?: boolean,     // true for ordered cats (ages, positions) → enables comparatives
    items: string[]        // e.g. ["Ann","Ben","Cal"]
  }>,
  solution: ...            // canonical hidden assignment across all categories
  clues: Array<{
    id: string,
    structured: ...,       // canonical logic (clue type + operands) — ground truth
    text: string           // funny natural-language phrasing shown to the solver
  }>,
  seed: number,            // reproducibility
  createdAt: string        // ISO timestamp
}
```

The exact shapes of `solution` and `structured` are fixed during the
implementation-plan phase; both are derived/validated by the solver.

## Generator Pipeline (`generate` CLI → one puzzle JSON)

1. **Theme + structure.** Resolve category count & item count from the
   difficulty preset; obtain themed categories/items from either the in-session
   author (Claude) or a curated theme-pack file (offline fallback).
2. **Solution.** Seeded random consistent assignment across all categories.
3. **Clue-fact enumeration.** Code emits all logically-true candidate clues by
   type: `is` / `is-not`, `either-or`, cross-category links, and `comparative`
   (only for categories marked `ordered`).
4. **Minimal-clue reduction.** A deductive solver removes clues greedily while a
   **no-guess solver** confirms the puzzle still has exactly one solution
   reachable by pure deduction. Yields a tight, non-redundant, guess-free set.
5. **Phrasing.** Each structured clue → engaging/funny prose at the target
   reading level, via one of two interchangeable phrasers behind a single
   interface:
   - **(a) in-session (Claude)** — default; no API key. Matches "generate them
     here using generative skills."
   - **(b) template-based** — deterministic; used in tests and offline bulk.
   - *(future)* a programmatic Claude-API phraser drops into the same interface.
6. **Validate + write.** Re-check uniqueness + no-guess on the final puzzle,
   then write validated JSON into `site/src/content/puzzles/`.

## Difficulty / Grade Model

A `gradeLabel` (free text) plus a `difficulty` preset that resolves the knobs:

- **Grid size** — number of categories × items per category.
- **Allowed clue types** — comparatives and either-or raise difficulty.
- **Clue leanness** — how minimal / how much chained deduction is required.
- **Reading level** — sentence length & vocabulary for the phrasing step.

Presets ship for roughly **grades 2–8**; every knob is individually overridable
on the CLI.

## Site UX

- **Index (`/`):** puzzle cards, filterable by grade / difficulty / theme.
- **Play (`/puzzle/[id]`):** interactive grid island — click a cell to cycle
  **blank → X → O**; clue list alongside; **Check** and **Reveal solution**;
  optional deduction **hint**; progress persisted to `localStorage` so a refresh
  doesn't lose work; keyboard friendly.
- **Print (`/puzzle/[id]/print`):** clean B&W worksheet — title, theme intro,
  grid(s), numbered clues, page break, then a separate **answer key**. Uses the
  browser's **Print → PDF** (free, no server).

## Publishing

Secret-free flow:

1. Generate → JSON lands in `site/src/content/puzzles/`.
2. `npm run build` (in `site/`) to verify it compiles & validates.
3. `git commit && git push` → **Vercel auto-deploys**.

**One-time setup** (requires the owner to authorize Vercel once — dashboard or
`npx vercel login`):

- Create a Vercel project from this GitHub repo, **root directory = `site/`**.
- Attach the domain **games.marshellis.com** to the project.
- Add a **Cloudflare CNAME** (`games` → Vercel's target) since marshellis.com's
  DNS is on Cloudflare.

`gh` is already authenticated as the owner; the Vercel CLI is not installed
(use `npx vercel` when needed). The subdomain games.marshellis.com is not yet
live (currently connection-refused) and will be stood up by this setup.

## Testing Strategy

- **TDD the logic core (Vitest).** Property tests assert that, across many seeds
  and grid sizes, every generated puzzle has **exactly one solution** and is
  **solvable with zero guessing**. Unit tests cover the solver, clue
  enumeration, minimal-reduction, and difficulty knobs.
- **Determinism.** The template phraser keeps generator tests deterministic; the
  RNG is seeded.
- **Site QA.** A smoke/QA pass with the browse tool (play a puzzle, check
  reveal, render the print view) before publishing.

## Risks & Mitigations

- **AI rephrasing changes a clue's logical meaning.** Mitigation: the canonical
  `structured` clue and the `solution`-derived answer key are the source of
  truth; prose is presentation only. Phrasing prompts are constrained, and the
  template phraser (used in tests) is provably faithful.
- **No-guess reduction is computationally heavy at large sizes.** Mitigation:
  cap default grid sizes per grade; the solver targets the small grids these
  puzzles use (≤ ~5 categories × ~6 items).
- **Vercel/Cloudflare subdomain wiring.** Mitigation: documented one-time setup;
  owner authorizes Vercel once; everything after is push-to-deploy.

## Future Work

- Game #2: printable math-worksheet generator (separate design pass), slotting
  into `generator/src/games/*` and `site/src/games/*`.
- Programmatic Claude-API phraser for batch generation without a live session.
- Optional richer player features (auto-cross-out helpers, solution
  walkthroughs).
```
