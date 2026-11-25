# Decisions

Newest first: date, what was decided, why, who. Add an entry whenever something is decided about how the kids'
games are made or shipped.

## 2026-11-25: Unity (Jonathan, with Bailey)

- **Unity 6 (6000.3.29f1).** The kids already had Unity 6 in Hub; 6.3 is the current LTS.
- **Bailey has its own Unity account** (`bailey@marshellis.com`, Personal) for builds, instead of a kid's or
  Jonathan's login.
- **Build on Bailey's cloud runner for the fast loop, GitHub Actions as the backstop.** The runner is bigger
  (8 cores, 30 GB) and keeps Unity and its cache warm: ~1 min rebuilds vs ~15 min on GitHub.
- **Kids keep using Unity Hub on their own machines**, sharing code through GitHub Desktop. Bailey edits
  scripts, kids edit scenes, to avoid merge conflicts.
- **`unity-starter` stays as a private template repo** that new Unity games start from.
- **Bailey's GitHub App does org admin work** (creating repos, Actions secrets), not a personal token: it is the
  org's own identity with short-lived keys. Jonathan granted it Administration: write. Everyday pushes and PRs
  still use the token canopy lends each turn.
- **This knowledge base lives in this repo's `docs/`**, where Bailey can update it with a normal PR, and the
  canopy project "Marshellis Games" (`/w/marshellis/projects/games`) links here.
