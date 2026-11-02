# Arcade - how to add a game

This folder holds **arcade games**: self-contained HTML/JS games shown in the site's Arcade (`/arcade`). Unlike the generated puzzle
games they are not grade-calibrated and not daily. To add one: drop in one folder and open a PR. Green CI merges and deploys.
How the platform around them works: [`docs/architecture.md`](../../../docs/architecture.md).

## The contract

One folder named with the game's **slug** (kebab-case) containing `index.html`, `game.json`, and any assets:

```
site/public/arcade/<slug>/
  index.html     # runs on its own, no build step (a built bundle is fine; commit the build, keep the source in its own repo)
  game.json      # manifest, below
```

- Use **relative** asset paths (`./sprite.png`). Everything the game needs lives in its folder (plus the platform scripts under `/arcade/_sdk/`).
- Folders starting with `_` (`_sdk`, `_template`) are not games. `_template/` is a complete working example - copy it.
- **Where it runs:** on the isolated origin (`play.marshellis.com`), inside a sandboxed iframe on the wrapper page. The game has **no
  cookies and cannot call the site's API directly**; the wrapper relays an allowlist. `localStorage` works (per origin).
- **Nothing in your game controls time limits.** The wrapper page meters play time, shows the time-up screen and brain breaks over the
  game and unloads it at the limit - for every game, whether or not it cooperates.

## `game.json`

```jsonc
{ "title": "Space Blaster", "description": "Dodge the asteroids", "emoji": "🚀", "author": "Theo",
  "createdAt": "2026-06-22",            // YYYY-MM-DD, drives the NEW badge
  "tags": ["arcade", "shooter"] }       // optional
```

## Required: join the learning loop (2 script tags + 1 call)

Parents can ask for "a brain break every N rounds". For that a game must say when a round ends. In `<head>` (put `compat.js` first if
the game calls `/api/...` itself):

```html
<script src="/arcade/_sdk/marshellis.js"></script>
<script src="/arcade/_sdk/rounds.js" data-game="my-slug"></script>
```
and wherever a round / match / life ends (game over, win, death): `window.MGRounds && MGRounds.end();`
(counts the round; the brain break is drawn over your game by the wrapper; safe to call repeatedly - calls within 2.5s are one round).
`arcade-contract.test.ts` fails a game that skips it; `e2e/rounds.spec.ts` proves it reaches a real child's brain break.
Engine exports (Godot/Unity) must call it from the engine's JS bridge (`reverse-zelda` is the one documented exception today).

## Optional: accounts, scores, passes

**Use the shared SDK - never write your own sign-in or call `/api/auth/*` yourself.** `flappy/` is the worked example.

```html
<div id="mg-picker"></div><div id="mg-chip"></div><div id="mg-account"></div><div id="mg-board"></div>
<script src="/arcade/_sdk/marshellis.js"></script>
<script>
  const mg = Marshellis.init({ game: "my-slug", chip: "#mg-chip", account: "#mg-account", board: "#mg-board" });
  // before each round:  if (!(await mg.gate())) return;     // parent limits + learning breaks (delegated to the wrapper)
  // round starts:       mg.startPlaying();
  // round ends:         mg.roundEnded(); mg.submitScore(score);   // submitScore is a no-op for guests
  // who is playing:     mg.who()  -> { username, avatar } or null (guest)
  // online games:       const p = await mg.getPass("my-room")      // { pass } | { noTime: true } | null (guest) - docs/game-pass.md
</script>
```
(Using `mg.roundEnded()` directly replaces `MGRounds.end()`; use one.) Guests see "Playing as Guest [Join leaderboard]": sign-up is one tap away,
never in the way. **Guests are metered too** (default 15 min/day, then a free profile is offered), so do not build a login wall and do not treat a
guest as "unlimited". The "Who's playing?" picker lives on the wrapper page, not in your game (a game cannot switch profiles).

To post scores add the slug to `SCORE_GAMES` in `site/src/lib/profile/scores.ts` (a game may only touch boards named `<slug>` or
`<slug>-<name>`). Lowest-wins boards (race times): also `LOWER_IS_BETTER`, integer values > 0. Scores are client-trusted (friendly boards).

### Games that call the API themselves (legacy)
Load `<script src="/arcade/_sdk/compat.js"></script>` **first** in `<head>`. It relays same-origin `/api/...` fetches (`/api/me`, `/api/scores`,
`/api/auth/*`, `/api/family/pass`, ...) through the wrapper's allowlist so the game keeps working on the isolated origin. Anything not on the
allowlist gets a 403. New games should use the SDK instead. Games from outside publishers use the sandbox bridge (`_sdk/host-bridge.js`).

## Multiplayer
Realtime servers verify a signed game pass: [`docs/game-pass.md`](../../../docs/game-pass.md) and the copy-paste server kit in
[`docs/room-kit/`](../../../docs/room-kit/README.md). Peer-to-peer (WebRTC) games need `NETRALLY_ICE_SERVERS` for strict NATs.
Test it: [`site/e2e/multiplayer/README.md`](../../e2e/multiplayer/README.md).

## Big engines (Godot, Unity, ...)
A web export ships the engine: Godot's is a ~39 MB `index.wasm`. Fine for ONE game (`reverse-zelda`); do not commit the same engine into several
folders - host one shared copy or use Git LFS. `arcade-contract.test.ts` fails any other file over 10 MB. Keep the game's source in its own repo and
commit only the export.

## Checks before you open the PR
`cd site && npm test && npm run build`. `arcade-contract.test.ts` and `arcade.test.ts` validate the manifest, the learning-loop wiring, that no game
touches parent/billing routes, and the file-size guard. `npm run e2e` (Playwright) loads every game for real.
