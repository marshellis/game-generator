# Arcade — static-game upload pathway

**Date:** 2026-06-22
**Status:** Approved

## Problem

The site's six games are all *generator-driven puzzle content*: a TypeScript module
emits grade-calibrated JSON into a content collection, a render component + client island
draw it, and the home page lists it via a hand-authored card. That pipeline is the wrong
shape for a *static game* — a self-contained interactive HTML/JS game (canvas, Phaser,
plain JS, whatever an AI generates).

We want a second, parallel pathway so another contributor's AI can ship static games by
dropping in **one folder** and opening a PR — with no edits to routes, the home page, or
any shared code.

## Decisions (from brainstorming)

- **Game format:** self-contained folder (`index.html` + assets + manifest).
- **Upload mechanism:** git PR, auto-merged on green CI (matches this repo's existing flow).
- **Placement:** a separate **Arcade** section, distinct from the grade-calibrated puzzle games.
- **Not grade-calibrated, not daily:** no g1–g8 difficulty, no day-of-week badge. `createdAt`
  is kept only to drive a "NEW" badge.

## Architecture

### 1. Folder contract

Everything for one game lives under `site/public/arcade/<slug>/`:

```
site/public/arcade/space-blaster/
  index.html        # the game — self-contained, relative asset paths
  game.json         # manifest
  assets/…          # optional: images, audio, JS, CSS the game needs
```

`<slug>` is kebab-case, unique, and becomes the URL: `/arcade/space-blaster`.
Files served statically from `public/` — the game runs exactly as authored.

### 2. Manifest (`game.json`)

```jsonc
{
  "title": "Space Blaster",          // required, string
  "description": "Dodge asteroids…",  // required, string
  "emoji": "🚀",                      // required, single emoji for the card
  "author": "Theo",                   // required, string
  "createdAt": "2026-06-22",          // required, YYYY-MM-DD
  "tags": ["arcade", "shooter"]       // optional, string[]
}
```

### 3. Discovery — `site/src/lib/arcade.ts`

A build-time helper that reads `public/arcade/*/game.json` via `node:fs`, parses + validates
each manifest, attaches its `slug` (the folder name), and returns a typed list sorted by
`createdAt` descending. Folders beginning with `_` (e.g. `_template`) are skipped. Used by
both the index page and the play route, so discovery logic lives in exactly one place.

### 4. Routes (prerendered / static)

- `site/src/pages/arcade/index.astro` — the **Arcade** landing: a card grid (same visual
  language as the home page), one card per discovered game (emoji, title, description,
  author, a "NEW" badge when `createdAt` is within the last 14 days).
- `site/src/pages/arcade/[slug].astro` — wrapper play page. `getStaticPaths` enumerates the
  discovered games. Renders the shared `GameHeader`, a back-to-Arcade link, a "fullscreen"
  link to the raw game, and the game itself inside a **sandboxed `<iframe>`** pointing at
  `/arcade/<slug>/index.html`.

The iframe is the isolation boundary: AI-generated game code runs in its own document and
cannot break the site chrome. Sandbox: `allow-scripts allow-same-origin` (same-origin kept
so games can use `localStorage` for high scores — acceptable since these are the kids' own
games on their own origin).

### 5. Home page

One new card — "🕹️ Arcade" — linking to `/arcade`, with the game count as its badge.
The six puzzle-game cards are untouched.

### 6. The pathway (the deliverable for the contributor's AI)

- `site/public/arcade/_template/` — a working starter game (`index.html` + `game.json`)
  to copy and edit. Skipped by discovery (leading `_`).
- `site/public/arcade/README.md` — the contract, written for an AI agent: folder layout,
  manifest fields, and "open a PR; green CI auto-merges and deploys."
- A Vitest test (`site/src/lib/arcade.test.ts`) that **validates every manifest** (required
  fields, types, valid `createdAt`, unique slugs) **and asserts each game folder contains an
  `index.html`.** A malformed game fails CI instead of shipping broken — this is the gate
  that keeps the AI's output honest.

## Components & boundaries

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `arcade.ts` | discover + validate manifests → typed list | `node:fs`, `path` |
| `arcade/index.astro` | render the Arcade card grid | `arcade.ts`, `Base` layout |
| `arcade/[slug].astro` | wrapper play page (iframe) | `arcade.ts`, `GameHeader` |
| `arcade.test.ts` | CI gate on manifest + folder validity | `arcade.ts` |
| `public/arcade/_template/` + `README.md` | the authoring contract | — |

## Testing

- `arcade.test.ts`: valid manifests pass; missing required field fails; bad `createdAt`
  fails; duplicate slug fails; folder missing `index.html` fails; `_`-prefixed folders are
  ignored. The `_template` game must itself be valid (it's the worked example).
- `site && npm run build` succeeds with the template present.

## Out of scope

- Runtime upload UI / blob storage (kept fully static).
- Grade calibration, printables, answer keys (puzzle-game concepts; arcade games are just games).
- Completion/profile tracking integration (can come later if wanted).
