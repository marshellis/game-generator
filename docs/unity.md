# Unity games

How the kids' Unity games are set up, built, and (soon) put on the site. Decisions and their reasons are in
[decisions.md](decisions.md).

## Accounts and licenses

- **Unity account:** `bailey@marshellis.com`, Unity Personal (free), created 2026-11-25. Login is in Bailey's
  canopy vault as `UNITY_EMAIL` / `UNITY_PASSWORD`. It's for builds only; the kids use their own logins in
  their own Unity Hub.
- **On Bailey's cloud runner:** a Personal seat activated on that machine (`bin/bailey-unity activate` in the
  Bailey repo). A `.ulf` made in Unity Hub on a Mac only works on that Mac ("Machine bindings don't match"), so
  the vault's `UNITY_LICENSE` is not used for builds.
- **On GitHub Actions:** GameCI activates a Personal seat from `UNITY_EMAIL` + `UNITY_PASSWORD` for each build and
  returns it afterwards.

## Version

Everyone uses **Unity 6000.3.29f1** (Unity 6.3 LTS), pinned in each project's
`ProjectSettings/ProjectVersion.txt`. Unity Hub offers to install it when a kid opens the project. Changing
version means every machine changes together.

## Repos

- [`marshellis/unity-starter`](https://github.com/marshellis/unity-starter): private **template**. A small
  coin-collector game with the WebGL build, GitHub Actions workflow, a kid-facing README and a CLAUDE.md for
  agents. Start new games from it ("Use this template").
- [`marshellis/breachline`](https://github.com/marshellis/breachline): Ellis's tactical 5v5 FPS (2026-11-25).

## How the kids work with Bailey

1. Clone the game's repo in GitHub Desktop and open the folder in Unity Hub.
2. Kids do the editor work: scenes, levels, art, sounds, prefabs.
3. They ask Bailey in canopy chat for code changes. Bailey edits C# in `Assets/Scripts`, builds on its runner
   to check it compiles and plays, then pushes.
4. Kids **Pull** to get Bailey's changes (Unity reloads) and **Push** their own when done.

Bailey edits scripts, kids edit scenes and prefabs. Unity scene files are YAML and merge badly when two people
change the same one.

## Building

**On Bailey's cloud runner (the fast loop):** `bin/bailey-unity build <project dir>` produces WebGL in
`<project>/build/WebGL/WebGL`, ~3 min the first time and ~1 min after. Installed 2026-11-25 without root: the
editor and WebGL module in `~/unity/6000.3.29f1/` (~14 GB, from Unity's direct-download tarballs) and GTK3 plus
a few libraries unpacked from Ubuntu `.deb`s into `~/unity/syslibs/`. `bin/bailey-unity status` shows what's
installed and whether the seat is active.

**On GitHub Actions (the backstop):** `.github/workflows/build.yml` builds every push to `main` with GameCI
(`game-ci/unity-builder@v6`, image version 4). The playable build is the `WebGL` artifact on the run. ~15 min
cold. Learned on the first builds:
- GitHub's runner runs out of disk pulling the Unity image, so the workflow frees disk first.
- **Private repos can't read org-level secrets on GitHub's free plan.** Set the login per repo:
  `bin/bailey-gh-secret --repo <repo> UNITY_EMAIL UNITY_PASSWORD`.
- With a custom build method GameCI only passes a build whose log says `Build succeeded!`, so
  `Assets/Editor/Builder.cs` prints it.

## WebGL gotchas

- Anything created only from code at runtime can be stripped from a WebGL build. The starter's first build had a
  bright-pink floor (Standard shader stripped) and "Could not produce class" errors. Put objects in the scene or
  a prefab, with real material assets.
- Builds use gzip with decompression fallback, so they work on any static host without special headers.

## Putting a Unity game on the site

No Unity game is on the site yet (`reverse-zelda` is Godot). The steps are the arcade contract
([`site/public/arcade/README.md`](../site/public/arcade/README.md)): commit the WebGL export to
`site/public/arcade/<slug>/` with a `game.json`, open a PR, green CI deploys. Deploying is public, so it needs
Jonathan's OK. Before the first Unity game, the starter needs:
- a Unity **WebGL template** (`Assets/WebGLTemplates/Marshellis/index.html`) with the two required SDK
  `<script>` tags, so every build is arcade-ready;
- a small **`.jslib` bridge** so C# can call `MGRounds.end()` when a round ends (required: it drives
  parent-set brain breaks);
- a check that no file is over **10 MB** (the contract's limit; an FPS may need compression or LFS).

## Runner disk

The cloud runner is shared with another account. After the Unity install it had ~11 GB free (93% used). Grow
the disk before adding another Unity version or many big projects.
