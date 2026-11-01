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

## Accounts, leaderboard, parent controls: use the shared SDK

Every game connects to the Marshellis account through **one shared script** - do not write your own
sign-in form or call `/api/auth/*` yourself. `flappy/` is the complete worked example.

```html
<div id="mg-picker"></div><div id="mg-chip"></div><div id="mg-account"></div><div id="mg-board"></div>
<script src="/arcade/_sdk/marshellis.js"></script>
<script>
  const mg = Marshellis.init({ game: "my-slug", chip: "#mg-chip", account: "#mg-account", board: "#mg-board", picker: "#mg-picker" });
  // before each round:   if (!(await mg.gate())) return;   // parent time limits + learning breaks
  // when the round starts: mg.startPlaying();
  // when it ends:          mg.roundEnded(); mg.submitScore(score);   // score is ignored for guests
  // who is playing:        mg.who()  -> { username, avatar } or null (guest)
</script>
```

Games never see the parent's settings, ratios or subscription - they only ask `gate()`. Guests are never
gated and keep their best on the device. To post scores add your slug to `SCORE_GAMES` in
`site/src/lib/profile/scores.ts`. Design: `docs/superpowers/specs/2026-10-30-family-platform-design.md`.
Online games: see `docs/game-pass.md`. Games from outside publishers use the sandbox bridge instead
(`site/public/arcade/_sdk/host-bridge.js`).


## Big engines (Godot, Unity, etc.)
A web export of a game engine ships the engine itself: a Godot export is a ~39 MB `index.wasm` plus a tiny `.pck` with the
game. That is fine for ONE game (see `reverse-zelda`; Vercel compresses it and browsers cache it). Do **not** commit the same
engine build into several game folders. If a second engine-based game arrives: host one shared copy of the engine (a shared
folder or storage bucket) and point each game at it, or use Git LFS. The `arcade-contract` test fails any other file over 10 MB.
Keep the game's source in its own repo and commit only the exported build here.
