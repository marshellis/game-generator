# Arcade — how to add a static game

This folder holds **static games**: self-contained interactive HTML/JS games that
appear in the site's **Arcade** section (`/arcade`). Unlike the puzzle games, they
are *not* grade-calibrated and *not* daily — they're just games. To add one, drop in
one folder and open a PR. Green CI auto-merges and deploys (see the repo's `CLAUDE.md`).

## The contract

Create one folder here named with your game's **slug** (kebab-case, e.g.
`space-blaster`). The slug becomes the URL: `/arcade/space-blaster`. It must contain:

```
site/public/arcade/<slug>/
  index.html     # your game — opens and runs on its own, no build step
  game.json      # the manifest (see below)
  …              # any assets your game needs (images, audio, JS, CSS)
```

Rules:

- **`index.html` must run by itself.** It is served as a plain static file and loaded
  inside a sandboxed iframe. Use **relative** asset paths (`./sprite.png`, not `/sprite.png`).
- **Everything the game needs lives inside the folder.** Don't reach out to shared site
  code or external CDNs you don't control.
- **`localStorage` is available** (the iframe is same-origin), so you can save high
  scores / progress. Namespace your keys with the slug to avoid clashes.
- Folders starting with `_` (like `_template`) are ignored by the site — that's where
  the worked example lives.

## `game.json`

```jsonc
{
  "title": "Space Blaster",            // required — shown on the card and play page
  "description": "Dodge the asteroids", // required — one-line blurb for the card
  "emoji": "🚀",                        // required — one emoji for the card
  "author": "Theo",                     // required — who made it
  "createdAt": "2026-06-22",            // required — YYYY-MM-DD; drives the "NEW" badge
  "tags": ["arcade", "shooter"]         // optional — array of strings
}
```

## Get started

1. Copy `_template/` to `<your-slug>/`.
2. Replace `index.html` with your game and edit `game.json`.
3. From `site/`, run `npm test` — the arcade test validates every manifest and that each
   folder has an `index.html`. Then `npm run build` to confirm the site builds.
4. Open a PR. Once CI is green it auto-merges and deploys to games.marshellis.com.

The `_template/` game ("Click the Dot") is a complete, working example — read it first.
