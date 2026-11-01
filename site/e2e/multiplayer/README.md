# Multiplayer e2e

Runs the REAL game servers (cloned from the marshellis org) next to the local site and drives several kids on separate
"devices" (browser contexts). Production game hosts (`*.fly.dev`) are redirected to the local copies, HTTP and WebSocket.

```
npm run e2e:mp:setup     # once: clones + builds the servers into site/.mp-servers (nexus-server is private: set GH_TOKEN to include it)
npm run e2e:mp           # starts the site + servers, runs e2e/multiplayer/*.spec.ts
```
`MP_SERVERS_DIR` points elsewhere. The servers get the SAME game-pass secret as the local site, so the whole chain is real:
the site issues a pass, the game presents it, the server verifies it (and drops the connection when the pass - i.e. the
parent's time limit - runs out).

Adding a game: find what the game exposes (a global like `Net.lobby`, or the socket traffic in `kid.net.sockets`), then follow
`hide-and-seek.spec.ts`. Use `polling: 500` in `waitForFunction` (3D games starve requestAnimationFrame polling) and a
small window (joinAsKid does this) so software-rendered games don't starve each other.

Covered: hide-and-seek (meet in one lobby with real passes, leave is seen, the server enforces the time limit).
Not yet: battle-royale, galaga, glass-bridge (Colyseus); nexus (private server; connects deeper in the hub); snowball-arena,
net-rally, ragdoll-siege (WebRTC via a PeerJS broker: needs a local broker).
