# Runbook

Operating games.marshellis.com. Architecture first: [architecture.md](architecture.md).

## Environment variables (Vercel project `site`, Production)

| Variable | Required | Purpose / notes |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | yes | Upstash Redis (the Vercel integration sets them; `UPSTASH_REDIS_REST_*` also accepted). Not readable through the Vercel API: tooling that needs Redis must run inside the site (see the backup endpoint). |
| `SESSION_SECRET` | yes | Signs login/guest/parent cookies and question tokens. **32+ chars.** Changing it signs everyone out. `/api/health` reports `weak`/`missing`. |
| `GAME_PASS_SECRET` | for online play | Shared with the Fly servers. Must differ from `SESSION_SECRET` (health reports `same-as-session`). |
| `PUBLIC_ARCADE_ORIGIN` | for isolation | `https://play.marshellis.com`. Build-time: change it, then merge any change so the site rebuilds. Unset = games load same-origin. |
| `GUEST_PLAY_MIN` | optional | Guest daily allowance in minutes (default 15; `off` = unlimited). |
| `BACKUP_TOKEN`, `BACKUP_PUBLIC_KEY` | for backups | Bearer token for `/api/admin/backup`; RSA public key the dump is encrypted to. The private key is NOT on the server. |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_FAMILY_MONTHLY`, `STRIPE_PRICE_FAMILY_YEARLY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`, `PRICE_LABEL_MONTHLY`, `PRICE_LABEL_YEARLY` | billing | See [setup-checklist.md](setup-checklist.md). Unset = billing answers 503, everyone is on Free. |
| `REVENUECAT_WEBHOOK_SECRET` | app-store billing | Authorization header secret for the RevenueCat webhook. |
| `STORE_PUBLISHER_EMAILS`, `STORE_ADMIN_EMAILS`, `STORE_INVITE_ONLY` | app store | Who may submit / review third-party games. |
| `NETRALLY_ICE_SERVERS` | optional | JSON `iceServers` (TURN) for the WebRTC games; STUN-only without it. |
| `E2E_MEMORY` | **never in production** | Test mode (in-memory storage). Ignored whenever `VERCEL` is set. |

Fly game servers: `GAME_PASS_SECRET` (same value), optional `GAME_PASS_REQUIRED=1` (refuse guests). GitHub Actions secrets: `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `BACKUP_TOKEN`.

## Deploy and rollback
- **Deploy:** merge to `main` (squash, merge queue). CI: tests -> `vercel build --prod` -> asserts `nodejs22.x` functions -> `vercel deploy --prebuilt`.
  Only one deploy runs at a time; a newer push cancels an older in-flight deploy (the newer one contains the older change).
- **Env-var changes need a new deploy** to take effect (merge a docs change). A prebuilt deployment is not rebuilt on redeploy.
- **Rollback:** revert the PR on `main` (the merge queue deploys the revert), or promote the previous deployment in the Vercel dashboard.
- **Roll back only the isolated origin:** delete `PUBLIC_ARCADE_ORIGIN` and merge any change; games load same-origin again.
- Node: the build needs Node >= 22.23.4 (Astro 7). Locally use the same.

## Is it healthy?
- `GET /api/health` -> `{ok, checks:{storage, sessionSecret, passSecret}, version}`; 503 when storage is down or the session secret is missing.
- `health.yml` probes it plus `/arcade`, `/family`, the leaderboard and the play origin every 30 minutes, and keeps ONE open issue labelled
  `site-health` (auto-closed when healthy).
- `live-smoke.yml` (daily, Chromium/WebKit/Firefox) loads games against production in real browsers: isolation, relay, CSP.

## Backups
Nightly `backup.yml` stores an encrypted dump as a 30-day artifact. Restore steps and key custody: [backup-restore.md](backup-restore.md).
**The private key lives in Bailey's vault (`BACKUP_PRIVATE_KEY`); until that entry exists it is only on Bailey's runner.** A backup run that fails or is "suspiciously small" means the database is empty/lost: investigate first.

## DNS / domains
`marshellis.com` is on Cloudflare; `games.` and `play.` are DNS-only CNAMEs to `cname.vercel-dns.com`, both attached to the Vercel project.
Details and cutover/rollback: [arcade-origin.md](arcade-origin.md).

## Rotating secrets
| Secret | How |
|---|---|
| `SESSION_SECRET` | set a new value, merge a change to redeploy. Everyone (parents, children, guests) is signed out once. |
| `GAME_PASS_SECRET` | set the same new value on Vercel AND every Fly app (`fly secrets set`), then redeploy. Online sessions drop and reconnect with fresh passes. |
| `BACKUP_TOKEN` | new value in Vercel + the GitHub secret; redeploy. |
| Backup key pair | generate a new pair, update `BACKUP_PUBLIC_KEY`, keep the OLD private key for old backups. |

## Incidents
| Symptom | First checks |
|---|---|
| Every login/leaderboard call is 500 | `/api/health`: `storage: failed` -> Redis down or the integration was removed (this happened once). Restore from backup if the DB is empty. |
| Everyone suddenly signed out | `SESSION_SECRET` changed or became shorter/missing: `/api/health`. |
| A game won't load / blank | Browser console on the play page: CSP `frame-ancestors`, `play.` DNS, `PUBLIC_ARCADE_ORIGIN`. Run `live-smoke`. |
| "No play time left" for a child who has time | Household timezone/day rollover, `play/status` in the Network tab; the parent's settings. |
| Online game connects as "Player 7" instead of the child's name | The game could not get a pass (relay timeout / 403 no time) or the server lacks the same `GAME_PASS_SECRET`. |
| Multiplayer room won't form | The game's server `/health`; for p2p games the PeerJS broker and TURN (`NETRALLY_ICE_SERVERS`). |
| Guest says time is up too early | `GUEST_PLAY_MIN`; guests share one allowance per browser per UTC day across all games. |
| Backup run red | `backup.yml` log: 401 = token mismatch, 500 `empty-database` = DB is empty. |

## Known limits
Scores are client-trusted (friendly boards). Clearing cookies or a private window resets a guest's allowance. A kid can make a free standalone profile (unlimited).
Online play is not gated by a pass unless a server sets `GAME_PASS_REQUIRED=1`. The backup endpoint scans the whole database in one request (fine at family
scale; revisit past ~100k keys).
