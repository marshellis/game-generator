# Marshellis family platform — design (v1, for build)

Status: decisions from Jonathan (email "User accounts", 2026-10-30) are fixed below. Everything
that "has multiple good answers" is a **setting with a default**, not a hard-coded choice, so the
family can learn and change it without a rewrite.

## Goals
One Marshellis account used by every game; parents control how much learning is mixed with play;
one household subscription that works on any device; later, outside publishers. Minimal data on kids.

## Fixed decisions (from Jonathan)
1. **Parent account first.** A parent creates the household; kids are *profiles* under it.
2. **Phone-handoff is the main mode.** A kid is a profile picked on the parent's signed-in device
   (tap avatar, optional PIN). Tablets later: a device is linked to a household by a parent.
3. **Minimal kid data:** display name (any nickname), avatar, birth year (age band only), learning
   progress. No email, no real name, no photo, no location, no third-party analytics or ads.
4. **Parents set the ratio and amount of learning.** All existing marshellis content games are the
   starting learning content, updated to report through the framework.
5. **One household subscription** across Android, iOS and web, plus a **direct subscription**
   bought on the marshellis site, with a **manage/cancel page as easy as sign-up**:
   one-click cancel, no dark patterns, clear renewal date and price, refund policy stated.
6. **Free vs paid** is undecided: Ellis and Marshall research it. Build it as configuration.

## Configurable by design (defaults in brackets)
| Setting | Scope | Options [default] |
|---|---|---|
| Learning ratio | per child | minutes of learning per minute of play [1:2], or rounds-based [every 3rd round] |
| Daily play allowance | per child | minutes [60], weekdays vs weekends |
| Enforcement | per child | hard stop / soft "do a puzzle to continue" [soft] |
| Subjects & difficulty | per child | on/off per subject; grade offset [-1..+1, default 0 = from birth year] |
| Mix style | per child | Off / Light / Balanced / Heavy [Balanced] (presets over the ratio) |
| Profile lock | per child | none / PIN [none] |
| Entitlements | household plan | feature flags table, edited as data (free vs paid is just rows) |
| Skill map & mastery rule | platform | data files + a swappable `selectNext` strategy |

All settings live in one `household_settings` document with a `version`, validated by a schema,
and have a parent-facing screen. Platform-wide ones are a config file, not code.

## Architecture
- **Identity service** (extends existing games.marshellis.com accounts, Upstash Redis + Astro API):
  `household` -> `parents[]`, `profiles[]`, `devices[]`. Existing username+PIN accounts migrate
  into a household as child profiles (a parent claims them).
- **Game SDK** (one small shared script, replaces the 6 copied sign-in forms):
  `who()` -> {profile, ageBand} | guest; `report({skill, correct, ms})`; `mayPlay()` ->
  {ok, reason, learnNext?}; `requestLearning()` -> an educational activity to complete.
  Games never see ratios, plans or settings.
- **Learning engine:** skill map (JSON, prerequisites + grade band), per-profile mastery estimate
  (start: simple streak/accuracy rule, strategy interface so Bayesian tracing can replace it),
  `selectNext(profile, settings)`. Existing puzzle generators become content providers.
- **Wallet:** server-side balance of play minutes per profile; the SDK heartbeats; the server is
  the source of truth (client can't mint minutes).
- **Billing:** one *entitlement* per household, fed by multiple sources: Stripe (web), Apple,
  Google Play (via a receipt-aggregation layer such as RevenueCat; decision below). Apps and web
  only read the entitlement. Cancel/manage page is first-class and tested.
- **Store (later):** publisher accounts, sandboxed iframes talking only to the SDK, manifest
  review queue, age rating, invite-only first. Existing arcade manifest (`game.json`) extends.

## Privacy & compliance (COPPA, amended rule in force since 2026-04-22)
Verifiable parental consent at household creation (card-check via Stripe or a signed consent
step), written data-security policy, data minimisation as above, parent can view/export/delete
all child data, retention limits. **A lawyer reviews before taking money or opening to outsiders.**

## Build order (each step ships alone, all games keep working)
1. SDK + shared sign-in; replace copied forms (8 arcade games, puzzles).
2. Households, parent account, child profiles, phone-handoff picker, parent settings screen.
3. Game pass for online games (Galaga, Battle Royale, Hide & Seek) - signed short-lived token.
4. Skill map + `selectNext` + report API; convert existing puzzle games to report skills.
5. Wallet + `mayPlay` + mix settings; wire into arcade games.
6. Entitlements table + web Stripe + manage/cancel page; then Apple/Google via aggregator.
7. Free-vs-paid rows filled from Ellis and Marshall's research.
8. Store: publisher accounts + review queue (invite-only).

## Open items (need a person)
- Ellis/Marshall: free-vs-paid research (what is free, what is paid, price).
- Native apps: today games are web. iOS/Android subscription needs wrapper apps or PWA + store
  listings; decide when step 6 starts. (Web-only first is the default.)
- Billing aggregator vs direct Apple/Google integration (default: aggregator).
- Legal review of consent flow.
