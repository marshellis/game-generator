# Setup checklist - turning the family platform on

Everything ships dark: with none of these set, the site, the games and the servers behave exactly as
before (everyone is "free", no passes, no billing). Set them in this order; each step is independent.

## 0. Site storage must work first
`/api/leaderboard?game=flappy` must return JSON, not 500. It needs Vercel env `KV_REST_API_URL` and
`KV_REST_API_TOKEN` (the Upstash for Redis integration) and a running database.
Also required: `SESSION_SECRET` (any long random string; changing it signs everyone out).

## 1. Game pass (verified names + parent time limits in online games)
Make one random secret (32+ chars) and set the SAME value in four places. Never reuse `SESSION_SECRET`.

| Where | How |
|---|---|
| Vercel project `site` | `GAME_PASS_SECRET` (Production) |
| Fly `galaga-server` | `fly secrets set GAME_PASS_SECRET=... -a galaga-server` |
| Fly Battle Royale app | `fly secrets set GAME_PASS_SECRET=... -a <app in battle-royale-server/fly.toml>` |
| Fly Hide & Seek app | `fly secrets set GAME_PASS_SECRET=... -a <app in hide-and-seek-server/fly.toml>` |

Optional: `GAME_PASS_REQUIRED=1` on a Fly app refuses guests (default: guests get a `Guest-1234` name).

## 2. Subscriptions via the website (Stripe)
1. Create a Stripe account; make a product "Family" with a monthly and a yearly recurring price.
2. Vercel env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_FAMILY_MONTHLY`, `STRIPE_PRICE_FAMILY_YEARLY`,
   `SITE_URL=https://games.marshellis.com`, optional display labels `PRICE_LABEL_MONTHLY` / `PRICE_LABEL_YEARLY`.
3. Stripe -> Developers -> Webhooks -> add endpoint `https://games.marshellis.com/api/family/billing/webhook/stripe`
   with events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`;
   copy its signing secret to Vercel `STRIPE_WEBHOOK_SECRET`.
4. Test with Stripe test mode first (a test card, then cancel from /family and watch the date message).

## 3. Subscriptions on iPhone / Android (RevenueCat)
Needs wrapper apps in the stores first (the games are web today). Then: RevenueCat project -> set the app user id to the
household id (`/api/family/household` returns it), webhook `https://games.marshellis.com/api/family/billing/webhook/revenuecat`
with Authorization header `Bearer <secret>`; put the same secret in Vercel `REVENUECAT_WEBHOOK_SECRET`.

## 4. App store (outside publishers) - invite only
Vercel env: `STORE_PUBLISHER_EMAILS` (comma list of parent emails allowed to submit; publishing also needs the Family plan),
`STORE_ADMIN_EMAILS` (who reviews at `GET/POST /api/family/store/queue|review`). Leave `STORE_INVITE_ONLY` unset (= on).

## 5. Before any of this is public
- A lawyer who handles children's privacy reviews `docs/legal/` and the consent box on `/family`.
- Link `/family` from the home page once the policies are final (it is deliberately unlinked and noindex today).
- Decide free vs paid in `site/src/lib/family/plans.ts` (Ellis and Marshall's research).
