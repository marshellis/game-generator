# Architecture

games.marshellis.com is a kids' games site with a family platform on top: parents set time limits and a learning mix,
children earn play time by answering questions and solving puzzles, and every game - including third-party and multiplayer
ones - runs under those rules.

## 1. The pieces

```
                         parent / child browser
                                  |
        https://games.marshellis.com  (Vercel: Astro 7, static + serverless)
        |  pages: puzzles, /arcade, /family (parent), /store, /profile
        |  API:   /api/auth/*  /api/scores  /api/leaderboard  /api/me*  /api/family/*  /api/health  /api/admin/backup
        |                                   |
        |  wrapper page /arcade/<slug>/play |            Upstash Redis (Vercel Marketplace)
        |  = the HOST: owns clock, gate,    +----------> accounts, households, profiles, learning data, scores
        |    picker, relay                              (nightly encrypted backup -> GitHub artifact)
        |        ^   postMessage allowlist
        |        v
        https://play.marshellis.com  (same deployment, different origin: NO cookies, NO site access)
        |  the games themselves: /arcade/<slug>/index.html   (+ _sdk/marshellis.js, compat.js, rounds.js)
        |
        +--> realtime servers on Fly.io  (battle-royale-server, galaga-server, hide-and-seek-server, nexus-server)
        |        verify a signed GAME PASS offline; drop the player when it expires
        +--> peer-to-peer (WebRTC) games via a public PeerJS broker (snowball-arena, net-rally, ragdoll-siege)
```

Two repos' worth of code live here: `generator/` (TypeScript puzzle generators, run by a human/agent, writes JSON into the site)
and `site/` (the Astro app). Game servers live in their own repos under the `marshellis` org.

## 2. Trust boundaries (the rules that matter)

1. **Games are untrusted code** (kids, AI, outside publishers). They run on `play.marshellis.com`, a different origin from the
   site, so they have no cookies and cannot call the family API. They talk to the platform only through the wrapper page, which relays
   an allowlist (`RELAY` + `relayAllowed` in `_sdk/marshellis.js`): identity, scores/board for *their own slug*, the play clock,
   learning questions, and a game pass for a well-formed room. Parent, billing, profile-management and store routes are never relayed.
2. **The wrapper page enforces limits, not the game.** It meters play time while a game is on screen, shows the time-up screen and brain
   breaks over the frame and unloads the game at the limit. A game that ignores the SDK entirely is still limited. (Round-based breaks
   need the game to call `MGRounds.end()`.)
3. **The server is the source of truth for time.** The client reports seconds; the server credits at most the wall-clock gap
   (`wallet.ts`). Earned time comes only from checked answers (HMAC-signed question tokens) and capped puzzle completions.
4. **Destructive parent actions need the password** (delete a child, cancel billing) even with the 30-minute parent cookie; every
   state-changing request with a foreign `Origin` is refused (`src/lib/origin.ts`).
5. **Secrets are separate on purpose:** `SESSION_SECRET` signs logins/cookies; `GAME_PASS_SECRET` is shared with game servers and can only
   mint/verify passes, so a compromised game server cannot forge site logins.
6. **Fail closed:** no `SESSION_SECRET` -> nothing is signed, nobody is a guest or a child.

## 3. Identities and time

| Who | How identified | Time rules |
|---|---|---|
| Parent | `mg_parent` cookie (30 min) after password; `mg_household` marks a linked device (1 year) | n/a |
| Managed child | `mg_session` (set by "Who's playing?" via the household cookie, optionally a PIN) | the parent's settings: free minutes + earned minutes, daily cap, hard/soft, brain-break cadence, subjects |
| Standalone account | legacy username + PIN (`/api/auth/*`) | none (unlimited) |
| Guest | signed `mg_guest` cookie, minted on first `play/status` | flat daily allowance, `GUEST_PLAY_MIN` (default 15), cannot earn more; offered a free profile |

Day boundaries: a child's day is the household timezone's calendar day; a guest's day is UTC.

## 4. The learning loop

`wrapper page` -> `gate()` before the game loads -> if the child has no time left (soft limit) a **brain break** (`learn/next` ->
`learn/answer`) earns minutes at the parent's ratio -> the game loads -> the clock ticks while it is on screen (`play/tick`, every 15 s,
only while the tab is visible) -> `MGRounds.end()` counts rounds ("break every N rounds") -> at the limit the host raises the gate over
the frame. Puzzle pages feed the same wallet through `learn/report` (capped per day) and update per-skill mastery.
Question content is `family/questions.ts`; the skill map is `family/skills.ts`; mastery/selection is `family/mastery.ts`.

## 4b. Multiplayer

Realtime servers verify a signed pass offline (`docs/game-pass.md`): the pass names the player (the browser's name is ignored) and
carries the parent's time limit as its expiry. At expiry the server closes with code 4003; a connected child who earns more time renews
the pass in-band. Servers accept guests (anonymous "Player N") unless `GAME_PASS_REQUIRED=1`.
Peer-to-peer games find each other by a party code claimed as a PeerJS id; after that traffic is browser-to-browser.

## 5. Storage (Redis keys)

| Key | Holds |
|---|---|
| `user:<name>` | legacy/child account record (PIN hash, avatar) |
| `profile:<name>` | managed-child profile (household, birth year, settings) |
| `parent:<email>` -> id, `parentid:<id>` | parent account |
| `hh:<id>` | household (timezone, profiles) |
| `ent:<householdId>` | subscription entitlement |
| `data:<child>:day:<date>`, `:mastery`, `:ans:*`, `:done:*`, `:lock` | per-child wallet day, mastery, answer/replay guards, write lock |
| `guest:<id>:day:<date>` | a guest's spent time (written only for requests that already carry the cookie) |
| `completions:<user>` (hash), `leaderboard:<game>` (zset) | puzzle completions, scores |
| `lockout:*`, `plock:*`, `slock:*` | brute-force counters (PIN, parent password, profile switch) |
| `stripe-ev:*`, `store:*`, `health:ping` | webhook replay guard, app-store submissions, health probe |

`family/kv.ts` is the interface; production is Upstash, tests/e2e use the in-memory twin (`E2E_MEMORY=1`, never on Vercel).
Read-modify-write on one child's data is serialised by a short `nx` lock (`play.ts: locked`) because Redis here has no compare-and-set.

## 6. Generated puzzle games

`generator/src/games/<game>/` implements the `GameModule` contract (`framework.ts`): `generate` (deterministic per seed),
`validate` (independent re-check from the output alone), `difficultyFor(grade)`, plus `emoji`/`skill`. `registry.ts` lists modules;
`npm run manifest` derives `site/src/data/games.json` for the site; `generateCatalog` refuses to write an item that fails `validate`.
The site renders each game (component + client island + play/print/answer routes) from JSON content collections (`src/content.config.ts`).

## 7. Code map

| Area | Where |
|---|---|
| Family platform (pure handlers over `KV`) | `site/src/lib/family/*`, routed by `router.ts`, served by `src/pages/api/family/[...path].ts` |
| Accounts/scores (legacy) | `site/src/lib/profile/*`, `src/pages/api/{auth,scores,leaderboard,me,completions}` |
| Browser platform code | `site/public/arcade/_sdk/{marshellis,compat,rounds,host-bridge}.js` |
| Arcade discovery + wrapper | `site/src/lib/arcade.ts`, `src/pages/arcade/[slug]/play.astro` |
| Ops endpoints | `src/pages/api/health.ts`, `src/pages/api/admin/backup.ts`, `src/lib/{health,backup.mjs,origin,e2e}.ts` |
| Tests | `site/test` (unit + `sim/`), `site/e2e` (Playwright, incl. `multiplayer/`), `generator/test` |
| CI | `.github/workflows/`: `deploy.yml` (test + build + deploy), `e2e.yml`, `e2e-multiplayer.yml`, `live-smoke.yml`, `health.yml`, `backup.yml` |
