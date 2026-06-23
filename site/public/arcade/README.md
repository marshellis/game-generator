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

## Optional: a global leaderboard

Most games just keep a personal best in `localStorage`. A game can instead post to a
shared, account-backed leaderboard (the same username + PIN profiles the puzzle games
use). Because the wrapper iframe is same-origin, relative `fetch` calls carry the
player's session cookie automatically.

1. Add your slug to `SCORE_GAMES` in `site/src/lib/profile/scores.ts` (the allowlist —
   only listed games may post scores).
2. From your `index.html`:
   - `GET /api/me` → `{ username, avatar }` if logged in, else `401` (play as guest).
   - `POST /api/scores` with `{ "game": "<slug>", "score": <int> }` → `{ best, improved }`
     (auth required; the server keeps each player's highest).
   - `GET /api/leaderboard?game=<slug>&limit=10` → `{ top: [{ rank, username, score }] }`
     (public — no login needed to read it).

Guests still work: fall back to `localStorage` and invite them to log in. See `flappy/`
for a complete worked example. (`flappy` is the one exception to "don't reach out to
shared code" — calling the site's own API is the sanctioned way to use the leaderboard.)
