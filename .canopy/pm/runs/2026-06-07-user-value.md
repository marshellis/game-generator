## 2026-06-07 — user-value (kid delight / "impressive to friends' kids")

User framing: "just making the site impressive to my friends with kids my kids ages."
The reward *plumbing* already existed (confetti + win splash, completion tracking,
/profile, solved badges, home count) but nothing was **collectible** — solving was
counted, never rewarded. That was the gap.

### Do it
1. **Trophy case — earnable badges + daily streaks** — Effort: M — Status: MERGED (#30)
   - Branch: feat/trophy-case (force-push blocked → re-pushed as feat/trophy-case-v2, but #30 merged first)
   - New pure module `site/src/lib/profile/badges.ts` (13 unit tests). Milestones,
     per-game mastery (5 solves), all-6-games Sampler, 🔥 daily streak — all derived
     from existing completions (game/grade/ts). No backend changes.
   - "🏆 New badge!" toast on solve (client-only, optimistic, de-duped via a
     localStorage seen-set so pre-existing badges never toast).
   - Verified live on prod: seeded a throwaway profile via the completions API,
     /profile renders the full shelf correctly (earned gold + praise, locked greyed
     + "Solve N to earn" hints, mastery bars, "⭐ Mastered"). No console errors beyond
     the expected auth-flow 401/409.
2. **Make /profile a kid-proud showcase** — Effort: M — Status: MERGED (#30, same PR)
   - Replaced the wall of raw puzzle-id slugs with a stat strip + trophy shelf +
     per-game cards (icon, count, X/5-to-master bar). Folded into proposal 1's PR.
   - The header confirm()/alert() menu was ALSO independently fixed by peer PR #29
     mid-sprint — kept #29's dropdown wholesale, dropped my duplicate.

3. **Pick-your-avatar** — Effort: S–M — Status: MERGED (#37, same day)
   - Branch: feat/avatars (built on fresh main after #30, as planned — kept the
     auth/store backend change off the pure-client trophy-case PR).
   - New pure `profile/avatars.ts` (5 unit tests): allowlist of 16 animals + 6 colors,
     sanitizeAvatar/sanitizeColor collapse off-list input to default (never store raw).
   - Backend: avatar+avatarColor on UserRecord; signup persists+echoes; login+me return
     it; me() now reads the store (async) and defaults legacy records. Handler tests
     extended. Client: signup modal "Pick your character" picker (16 emoji + 6 colors +
     live preview, random default); chip + profile header render the avatar circle.
   - Verified on prod: fresh signup with a picked panda+green persisted through
     /api/me; a legacy pre-avatar user defaulted cleanly to fox+yellow in the chip.
   - Dropped the "avatar on solved badges" sub-idea — visual clutter, low value.

### Backlog
(empty — all three user-value proposals shipped 2026-06-07)

### Meta-observations
- **Concurrency was real this time.** TWO peer PRs landed mid-sprint: #29 (menu/modal
  refactor — same file, profile-client.ts) and #31 (maze drag fix — unrelated file).
  Both merged to main while I was building.
- **Force-push to feature branches is blocked** by a server pre-receive hook
  ("protected branch hook declined"). You CANNOT rebase-and-force an existing PR
  branch. Workaround: push a NEW branch + new PR (or merge main in, non-rewriting).
- **The merge queue merged my PR (#30) while I was mid-rebase**, off a base that
  predated #31 — and it was FINE. A squash-merge applies the PR's *diff* onto current
  main; my diff never touched maze/player.ts, so #31's fix survived untouched. The
  branch having a stale copy of a file it doesn't modify is a non-issue. (I briefly
  panicked this was a maze regression — it wasn't.)
- **Integrating with a peer's concurrent refactor of the same file:** taking their
  version wholesale (`git checkout origin/main -- <file>`) and re-applying my additive
  diff via Edit was far cleaner than resolving a line-level rebase conflict where both
  sides rewrote the same functions.
- TDD on the pure badge module paid off — caught nothing dramatic but made the
  derivation logic the trustworthy core; all UI is thin assembly over it.
