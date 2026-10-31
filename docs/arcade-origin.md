# Isolated arcade origin (play.marshellis.com)

**Why:** today a game runs on the same origin as `/family`, so its JS could call parent/billing APIs with the
browser's cookies. On `play.marshellis.com` a game has no cookies and cannot call the site at all. The wrapper
page (`/arcade/<slug>/play`) relays only an allowlist (`RELAY` in `_sdk/marshellis.js`): identity, score, its own
leaderboard, the play clock and learning questions. Parent, billing, profile and store routes are never relayed.

**Defence in depth (already live):** `originAllowed()` rejects foreign `Origin` on every write; destructive parent
actions need the password; the wrapper owns the clock.

**Status: LIVE since 2026-10-31.** `play.marshellis.com` is a Cloudflare CNAME (DNS-only) to Vercel, added to the `site` project, and
`PUBLIC_ARCADE_ORIGIN=https://play.marshellis.com` is set for production. Unset it and redeploy to roll back; it is off in
any build where it is unset (previews, local).

## Cutover (needs DNS + one env var)
1. Add the domain to the Vercel project: `bin/bailey-vercel api POST /v10/projects/<site>/domains '{"name":"play.marshellis.com"}'`.
2. DNS (Cloudflare, `bin/bailey-cloudflare dns set play.marshellis.com CNAME cname.vercel-dns.com --proxied false`).
3. `printf %s https://play.marshellis.com | bin/bailey-vercel setenv PUBLIC_ARCADE_ORIGIN --target production`, then redeploy.
4. Verify: `curl -sI https://play.marshellis.com/arcade/flappy/index.html` has `frame-ancestors https://games.marshellis.com`;
   `/family` on that host redirects to games.marshellis.com; play a game as a kid (score, board, time limit).
5. Rollback: delete the env var and redeploy; games load same-origin again.

## Known gaps
- Games that save to `localStorage` keep working (they get their own origin's storage; existing saves on games.marshellis.com
  do not move, so kids' local progress in a game restarts once at cutover).
- Games that call the platform API directly load `_sdk/compat.js` (a fetch shim that relays through the host). The contract
  test fails any game that calls `/api/...` without compat.js or the SDK. New games should use `marshellis.js`.
