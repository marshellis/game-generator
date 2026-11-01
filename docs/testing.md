# Testing and simulation

Three layers, cheapest first. All run in CI (`npm test` in `generator/` and `site/`), no network, no real time.

## 1. Unit tests (`site/test/*.test.ts`, `generator/test/*.test.ts`)
Pure handlers and generators. Write one beside every new function.

## 2. The simulation world (`site/test/sim/`)
A deterministic miniature of production: the **real** handlers (`profile/handlers`, `family/router`) over
in-memory storage, a clock the test owns, and browsers with cookie jars that honour Max-Age against that clock.

| piece | what it is |
|---|---|
| `world.ts` | `createWorld()` - storage, secret, clock (`advance`, `setTime`), `browser()`, `tap` to observe every response |
| `actors.ts` | `Parent`, `Kid`, `Cheater`: reusable behaviours (`addChild`, `play(sec)`, `learn()`, `farmPuzzles()`, `upgrade()`) |
| `dom.ts` | `openTab()` - jsdom running the **real** `marshellis.js` SDK with timers and `Date.now` on the world clock; `tab.fire(sec)` simulates elapsed play |

Scenario files, one question each:

- `isolation.sim.test.ts` - a hostile game on the isolated arcade origin trying to escape (relay allowlist, origin guard).
- compat.js tests (in `isolation.sim.test.ts`) - legacy games that fetch the API directly keep working on the isolated origin.
- `lifecycle.sim.test.ts` - the happy path as a story (signup -> play -> learn -> limit -> export -> delete).
- `adversarial.sim.test.ts` - red team. **One test per way to cheat or break in.** A new feature gets its attacker here.
- `longrun.sim.test.ts` - 14 simulated days of mixed honest/idle/cheating kids checked against invariants, plus a
  1500-call API fuzz asserting "no 5xx, no thrown error, no secret ever in a response". Seeded:
  `SIM_SEED=123 npm test -- sim/longrun` replays a failure exactly.

Recipe for a new feature: add the route, then (1) a lifecycle step, (2) an attacker in adversarial, (3) add the
route to the fuzz route table. The fuzz found two real bugs the first day it ran; keep it current.

## 3. Contract ratchets
- `arcade-contract.test.ts` - every arcade game integrates with the SDK/game pass or is on the **shrinking** legacy
  list; no game may call parent/billing routes.
- `generator/test/conformance.test.ts` - every registered game module obeys the `GameModule` contract
  (deterministic, valid, grade-covering, in sync with `games.json`).

## 4. Live smoke (real browser, `site/e2e/live-smoke.mjs`)
Headless Chromium against the deployed site: games load on `play.marshellis.com`, see no cookies, cannot reach the
family API or POST to the site cross-origin, and the relay still serves boards. Runs daily (`live-smoke.yml`) and on
demand: `cd site && npm i --no-save playwright && npx playwright install chromium && node e2e/live-smoke.mjs`.
Read-only (guest). Pass `EXPECT_ISOLATED=0` to run it against a same-origin build.

## 5. Full end-to-end (`site/e2e/`, Playwright)
The REAL site (`astro dev`, in-memory storage via `E2E_MEMORY=1`, never active on Vercel) in real browsers, with the
games on a second origin (127.0.0.1) exactly like production's play. host. `npm run e2e` (add `BROWSER=webkit` for Safari's engine).
- `guest.spec.ts` - guests play every game with no wall; the guest daily limit blocks the game and offers a profile (fast-forwarded
  via the e2e-only `/api/e2e/guest-spend`, which 404s outside `E2E_MEMORY`).
- `arcade-games.spec.ts` - EVERY arcade game: loads on the isolated origin, renders, survives generic input, no uncaught
  errors, no cookies / no site access; and a child with no time left never gets the game. (This found a real
  `dungeon-crawler` crash on the title screen.) Heavy 3D/wasm games get a lighter check (software GL on CI is slow).
- `puzzles.spec.ts` - all six educational games solved through the real UI at g1/g4/g8 (typing, drag, arrow keys,
  clicks): win celebration, completion recorded, mastery updated, play time earned; a wrong board earns nothing.
- `learning-flow.spec.ts` - parent onboarding in the UI, password-gated delete, the kid loop (who's playing -> brain
  break -> wrong answers earn nothing -> right answers earn time -> game loads), scores via SDK and via compat, and a
  REAL 60-second hard limit that the host page enforces on a game that knows nothing about time.
It cannot judge game RULES or fun - those are the kids' code - so "works" means: starts, doesn't crash, renders,
responds to input, and obeys the platform.

## Known limits (what the sim cannot prove)
- Wall-clock behaviour of a real browser (throttled background tabs). The host page meters on a 15s interval; the
  sim proves the accounting, not Chrome's timer throttling.
- Real Upstash/Stripe/Vercel behaviour. Storage and Stripe are faked; run `vercel-diagnose` for the live system.
- Client-reported scores are still trusted (leaderboards are friendly, not tamper-proof).
