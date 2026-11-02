# Documentation index

Start here. Each doc owns one topic; this page says which.

| I want to... | Read |
|---|---|
| Understand how the whole thing fits together (origins, trust boundaries, data, request flows) | [architecture.md](architecture.md) |
| Operate it: env vars, deploy/rollback, health, backups, DNS, secrets, "what do I do when X breaks" | [runbook.md](runbook.md) |
| Add a generated puzzle game (generator + site) | [adding-a-game.md](adding-a-game.md) |
| Add an arcade (static / multiplayer) game | [../site/public/arcade/README.md](../site/public/arcade/README.md) |
| Turn the family platform features on (Stripe, passes, store) | [setup-checklist.md](setup-checklist.md) |
| Verify a player in a multiplayer server (game pass, renew, time-up) | [game-pass.md](game-pass.md), [room-kit/](room-kit/README.md) |
| Run, read or extend the tests and simulations | [testing.md](testing.md), [../site/e2e/multiplayer/README.md](../site/e2e/multiplayer/README.md) |
| Back up / restore the database | [backup-restore.md](backup-restore.md) |
| Understand the isolated game origin (`play.`) | [arcade-origin.md](arcade-origin.md) |
| Calibrate puzzle difficulty by grade | [grade-appropriateness.md](grade-appropriateness.md) |
| Legal drafts (NOT live - need a lawyer) | [legal/](legal/README.md) |
| History: design specs and plans | [superpowers/](superpowers/specs/) (point-in-time; the code and the docs above win if they disagree) |

Also: `../CLAUDE.md` (guidance for AI agents working here), `../AGENTS.md` (concurrent-merge norms).
