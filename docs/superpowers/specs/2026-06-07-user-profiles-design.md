# User Profiles: Lightweight Username + PIN — Design

**Date:** 2026-06-07
**Status:** Approved (design); plan pending

## Goal

Add lightweight accounts (username + PIN, no other personal info) so a player can
**see which puzzles they've completed**, with the data model laid out so **gamification**
(points, streaks, badges, leaderboards) can be built on top later without a rewrite.

Cross-device accounts were explicitly chosen over local-only storage, so this introduces
a real backend.

## Non-goals

- Email, real names, or any PII beyond a chosen username.
- Password/PIN recovery (see "No recovery" below).
- Points/streaks/badges themselves — only the data foundation for them.
- Changing how puzzles are generated or played.

## The big shift: static → static + thin serverless API

The site is currently **100% static** (Astro static output, deployed to Vercel as
`--prebuilt`). This design keeps that for everything except a small API surface.

- Add the `@astrojs/vercel` adapter and switch to `output: 'hybrid'` (Astro 4 semantics:
  prerendered by default, opt out per-route).
- Every game/content page **stays prerendered and CDN-cached**. Only `/api/*` routes set
  `export const prerender = false` and run as serverless functions.
- **Personalization is client-side hydration.** The static HTML is identical for every
  visitor; a shared client script calls the API and fills in personal bits (header chip,
  solved badges, counts). This preserves cacheability and matches the existing
  vanilla-TypeScript island pattern. No personal data is server-rendered.

## Backend

### Datastore — Upstash Redis (Vercel KV)

Accessed via `@upstash/redis` (REST client; safe in serverless). All access goes through a
small `Store` interface so tests can inject a fake (no live Redis in CI).

Keys:

- `user:<username>` → hash `{ pinHash, createdAt }`
- `completions:<username>` → hash, field `"<game>:<puzzleId>"` → JSON `{ grade, ts }`
  - One `HGETALL` returns a user's entire completion history.
  - Counts, per-game totals, recency, and streaks are all **derived** from this — no
    denormalized counters in v1 (YAGNI; add them only if read cost becomes a problem).
  - This hash is the **gamification foundation**: timestamps enable streaks; grade enables
    per-grade progress; the game/puzzle key enables per-game and per-puzzle stats.
- `lockout:<username>` → integer attempt counter with a short TTL (basic brute-force
  slowdown; a 4-digit PIN is low-entropy).

### Auth

- **PIN hashing:** `node:crypto` `scrypt` with a per-user random salt (no new dependency).
  Stored as `scrypt$<salt>$<hash>`.
- **Session:** signed, **httpOnly, Secure, SameSite=Lax** cookie. Value is
  `username|issuedAt` plus an HMAC-SHA256 signature using `SESSION_SECRET`. Stateless
  verification (no server session store). Reasonable expiry (e.g. 90 days), sliding not
  required for v1.
- **Username rules:** normalized to lowercase; validated charset (e.g.
  `[a-z0-9_-]`), length 3–20. Display can preserve original case if we store it; v1 keeps
  it simple and shows the normalized username.
- **PIN rules:** numeric, 4–8 digits (default 4). Validated server-side on signup/login;
  invalid format → 400.
- **No recovery:** a forgotten PIN means starting a new profile. The old username stays
  claimed (cannot be re-registered) — accepted tradeoff for a lightweight, email-free site.

### API routes (`/api/*`, `prerender = false`)

- `POST /api/auth/signup` — `{ username, pin }`. 201 + sets cookie if free; 409 if taken;
  400 on invalid input.
- `POST /api/auth/login` — `{ username, pin }`. 200 + cookie if valid; 401 + lockout
  increment on bad PIN; 429 if locked out.
- `POST /api/auth/logout` — clears cookie. 204.
- `GET /api/me` — `{ username }` if signed in; 401 otherwise.
- `GET /api/me/completions` — `{ completions: [{ game, puzzleId, grade, ts }] }`; 401 if
  signed out.
- `POST /api/completions` — `{ game, puzzleId, grade }`; records (idempotent on key);
  requires auth (401 otherwise). Validates `game` against the known game list and rejects
  unknown values.

## Client integration

A single shared module — `site/src/lib/profile-client.ts` — is loaded on every page (via
the shared `Base` layout or `GameHeader`). Responsibilities:

1. **Header chip.** On load, `GET /api/me`. Logged out → a "Sign in" chip. Logged in →
   username + "Log out". Rendered into a placeholder in `GameHeader`/`Base`. Inline-styled
   (like `win.ts`) so Tailwind purging can never strip its classes.
2. **Login/signup modal.** Opened from the chip. Two fields (username, PIN) and a
   signup/login toggle. Posts to the auth routes, then refreshes the chip and any
   on-page personalization.
3. **Auto-record on solve.** Each play page emits
   `<script type="application/json" id="puzzle-meta">{ "game", "puzzleId", "grade" }</script>`.
   The shared module reads it and, when the existing `celebrate()` win event fires, `POST`s
   to `/api/completions`. Recording is centralized here; game island TypeScript is left
   essentially untouched. (Mechanism: `celebrate()` dispatches a `puzzle:solved`
   DOM event — or calls a hook — that the profile module listens for. Exact wiring decided
   in the plan; the constraint is "no per-game logic duplication".)
4. **Solved badges.** Grade-list cards carry `data-game` / `data-puzzle-id`. After fetching
   completions, the module marks solved cards with a ✓.
5. **Home dashboard count.** A placeholder element on the home page is filled with
   "X puzzles solved" (0/hidden when logged out).

A dedicated **`/profile` page** (static shell) fetches `GET /api/me/completions`
client-side and renders solved puzzles grouped by game with totals — the primary
"see what you've completed" surface. Redirects logged-out visitors to open the sign-in
modal.

## Error handling & edge cases

- **Logged-out solve:** no record; optional gentle "Sign in to save your progress" nudge in
  the win splash. Never blocks or delays play.
- **API/Redis failure:** all personalization calls are wrapped; on error the UI silently
  falls back to the logged-out/empty state. **Gameplay never depends on the API** and is
  never broken by its failure.
- **Duplicate signup:** 409, surfaced in the modal as "username taken".
- **Bad PIN:** 401 + lockout increment; after N failures within the TTL window, 429 with a
  "try again later" message.
- **Idempotent completion:** re-solving a puzzle overwrites the same hash field (keeps the
  latest ts); no duplicates.

## Testing

Site Vitest, with a **fake `Store`** injected (no live Redis; CI needs no secrets):

- Cookie sign/verify (valid, tampered, expired).
- scrypt hash/verify (correct PIN passes, wrong fails).
- Redis key helpers and completion aggregation/grouping (counts, per-game grouping).
- Each API handler: signup (free/taken/invalid), login (ok/bad-pin/lockout), me,
  completions read/write, auth required.
- Input validation: username rules, unknown `game` rejected.

The generator test suite is unaffected.

## Deploy prerequisites (one-time, owner)

In the Vercel project:

- Add the Upstash (Vercel KV / Redis) integration.
- Set env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SESSION_SECRET`.

The existing `vercel build --prebuilt` / deploy flow picks up the adapter automatically.
The CI `test` job continues to run without any of these secrets (fake store in tests).

## Accepted tradeoffs (stated plainly)

- **PIN security is inherently weak** — 4 digits, no email, no recovery. The lockout counter
  slows brute force but the system protects *kids' puzzle progress*, not anything sensitive.
- **This adds real infrastructure** (serverless functions + Redis) to a previously
  zero-backend static site — the cost of the cross-device accounts chosen over local-only.
