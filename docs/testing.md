# Testing and simulation

Six layers, cheapest first. Layers 1-3 run in every PR's required check (`npm test` in `generator/` and `site/`, plus the production build); 4-6
are Playwright/real-browser suites that run on PRs touching the site, nightly, or on demand. Nothing needs real money, real children's data or
production credentials.

| # | Layer | Where | Runs | Proves |
|---|---|---|---|---|
| 1 | Unit | `site/test/*.test.ts`, `generator/test/*.test.ts` | every PR | pure handlers and generators |
| 2 | Simulation world | `site/test/sim/` | every PR | the whole server side + the real SDK, deterministic, with a hostile red team |
| 3 | Contract ratchets | `arcade-contract.test.ts`, `generator/test/conformance.test.ts`, `games-manifest.test.ts` | every PR | new games meet the platform's contract; registry, skills and content config can't drift |
| 4 | Real-browser e2e | `site/e2e/*.spec.ts` (`npm run e2e`) | PRs touching the site, nightly (Chromium + WebKit) | the real site in real browsers: every game, every puzzle, the learning loop, guests |
| 5 | Multiplayer e2e | `site/e2e/multiplayer/` (`npm run e2e:mp`) | PRs touching games/platform, nightly | the REAL game servers + kids on separate devices + scripted players |
| 6 | Live smoke | `site/e2e/live-smoke.mjs` | daily, on demand | the deployed site: isolation, relay, CSP, in Chromium/WebKit/Firefox (read-only, guest) |

Plus ops monitors that are tests of production: `health.yml` (every 30 min) and the nightly `backup.yml`.

## 1. Unit tests
Write one beside every new function. `cd site && npm test`, `cd generator && npm test` (the generator also runs `npm run typecheck`).

## 2. The simulation world (`site/test/sim/`)
A deterministic miniature of production: the **real** handlers over in-memory storage, a clock the test owns, and browsers with cookie jars
that honour Max-Age and send `Origin` like a real browser.

| piece | what it is |
|---|---|
| `world.ts` | `createWorld()` - storage, secret, clock (`advance`, `setTime`), `browser(origin?)`, `tap` to observe every response |
| `actors.ts` | `Parent`, `Kid`, `Cheater`: reusable behaviours (`addChild`, `play(sec)`, `learn()`, `farmPuzzles()`, `upgrade()`) |
| `dom.ts` | `openTab()` - jsdom running the **real** `marshellis.js`/`compat.js` with timers and `Date.now` on the world clock; cross-origin iframe tabs with a faithful `postMessage` bridge; `tab.fire(sec)` simulates elapsed play |

Scenario files, one question each:

- `lifecycle.sim.test.ts` - the happy path as a story (signup -> play -> learn -> limit -> export -> delete).
- `adversarial.sim.test.ts` - red team: **one test per way to cheat or break in** (forged sessions, replayed parent cookies, tick bursts,
  puzzle farming, answer replay, webhooks, guests, concurrency, unauthenticated DB growth). A new feature gets its attacker here.
- `isolation.sim.test.ts` - a hostile game on the isolated origin (relay allowlist, origin guard), legacy games through `compat.js`, SDK robustness.
- `longrun.sim.test.ts` - 14 simulated days of mixed honest/idle/cheating kids against invariants, plus a 1500-call API fuzz ("no 5xx, no
  throw, no secret in any response"). Seeded: `SIM_SEED=123 npm test -- sim/longrun` replays a failure exactly.

Recipe for a new feature: (1) a lifecycle step, (2) an attacker in `adversarial`, (3) its routes in the fuzz table. Mutation-check important
tests (weaken the code, see the test fail) - the isolation suite was checked this way.

## 3. Contract ratchets
- `arcade-contract.test.ts` - every game integrates with the platform or is on the **shrinking** legacy list; every game wires the learning loop
  (`rounds.js` + `MGRounds.end()`) or is a documented exception; no game may touch parent/billing routes; no stray >10 MB files.
- `generator/test/conformance.test.ts` - every registered game: deterministic, JSON-safe, passes its independent `validate()` (and the validator rejects a
  corrupted item), unique ids, grade coverage, difficulty rises with grade, all ~300 committed items re-validated, manifest in sync.
- `games-manifest.test.ts` - registry <-> skills <-> content config agree.

## 4. Real-browser e2e (`site/e2e/`)
The REAL site (`astro dev`, in-memory storage via `E2E_MEMORY=1` - never active on Vercel) in real browsers, games on a second origin
(`127.0.0.1`) exactly like production's `play.` host. `npm run e2e` (`BROWSER=webkit` for Safari's engine; first time `npx playwright install chromium`).
**Run one Playwright process at a time** (a shared dev server and shared `test-results/`).

- `arcade-games.spec.ts` - EVERY arcade game: loads on the isolated origin, renders, survives generic input, no uncaught errors, no cookies, no site
  access; a child with no time left never gets the game. Heavy 3D/wasm games get a lighter check (software GL is slow). (Found a real dungeon-crawler crash.)
- `rounds.spec.ts` - the learning loop reaches every game: a finished round produces a round tick and a brain break drawn over the game.
- `puzzles.spec.ts` - all six educational games solved through the real UI at g1/g4/g8: win, completion, mastery, earned time; a wrong board earns nothing.
- `learning-flow.spec.ts` - parent onboarding in the UI, password-gated delete, the kid loop, scores via SDK and compat, game pass, a REAL 60 s hard limit.
- `guest.spec.ts` - guests play every game with no wall; the guest limit blocks and offers a profile (fast-forwarded via the e2e-only
  `/api/e2e/guest-spend`, which 404s outside `E2E_MEMORY`).

## 5. Multiplayer e2e (`site/e2e/multiplayer/`)
See its [README](../site/e2e/multiplayer/README.md): real servers cloned from the org, production hosts redirected to them, real browsers **and** scripted virtual
players with real passes. Covers hide-and-seek, battle-royale, galaga, nexus (private server), snowball-arena, net-rally, ragdoll-siege: lobbies, host rules, host
migration, rate limits, server-enforced time limits, identity over p2p, and earn-time -> renew-pass.

## 6. Live smoke
`cd site && npm i --no-save playwright && npx playwright install chromium && node e2e/live-smoke.mjs [url]` (`BROWSER=webkit|firefox`, `EXPECT_ISOLATED=0` for a
same-origin build). Read-only.

## What none of this can prove
- **Game rules and fun** - the games are the kids' code. "Works" means: starts, renders, responds, doesn't crash, obeys the platform.
- Real touchscreens and throttled background tabs (WebKit/Chromium in CI are engines, not devices): play-test on a real phone.
- Real Upstash/Stripe/Vercel behaviour (faked in tests; `health.yml` and live smoke watch production).
- Tamper-proof scores (client-trusted by design) and anything about a pass-less guest on a realtime server (see the runbook's known limits).
