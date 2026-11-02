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

## Two kinds of player
- **Real browsers** (`joinAsKid`): the actual game page on the isolated origin, own family, signed-in child, driven through the game's
  own UI/state. Best for "does the client work".
- **Virtual players** (`virtualKid`, `colyseusJoin`, `rawSocket`): scripted clients that join the real server with a REAL pass minted by the
  local site. Cheap enough to fill a lobby (7-8 players), and they see the server's truth. Best for "does the server behave" (limits,
  host migration, relay rules, rate limits).
Mix them: one real kid plus three scripted friends is a full room.

## Covered
| game | type | what is proven |
|---|---|---|
| hide-and-seek | raw WS, host-authoritative | 2 real browsers meet with real passes; leaving is seen; server drops a child at pass expiry; **protocol suite** with scripted players: 7-player cap, nicknames from passes, countdown, only the host drives, host migration + abort, no unsigned nickname, `timeup`/4003 |
| battle-royale | Colyseus party + match | party by code, real nicknames, leader starts the match and both land in one room, leaving, no-time kid never connects |
| galaga | Colyseus + Phaser canvas | a real kid creates a room, scripted friends fill it (4 players), names verified, host starts, leave mid-game, server-enforced expiry (4003) |
| snowball-arena | WebRTC p2p via PeerJS broker | party code claimed on the (local) broker, first to use it hosts, a 1v1 starts over a direct browser-to-browser channel, a different code is a different arena, no-time kid never reaches the broker |
| net-rally | WebRTC p2p co-op | host shows a code, friend types it, the rally runs and each side's end screen names the OTHER kid (identity crossed the p2p channel), a wrong code is refused |
| ragdoll-siege | WebRTC p2p, host-authoritative | host a room, friend joins by code, both lobbies close into the same world |
| nexus (private server) | raw WS hub + racing | hub presence, racing lobby/countdown/results with server-measured times, rate limit + payload cap, **earn time -> renew pass -> stay connected** |

## Findings recorded here
- Online play is **not** gated by the pass: no/invalid/forged pass joins as a guest "Player N" (unless the server sets `GAME_PASS_REQUIRED=1`). A
  forged pass can never claim someone's nickname. Server-side limits therefore only bind players who present a pass; the wrapper page still
  meters (and unloads) any game it is showing.
- Glass Bridge's online mode needs a `glass-bridge` room on galaga-server that only exists in an UNMERGED PR (marshellis/galaga #2).
- Galaga's join screen (typing a code into the Phaser canvas) is unreliable under software rendering: use `colyseusJoin` for the second player.

## WebRTC games
`peer-broker.cjs` is a local PeerJS signalling broker (what `0.peerjs.com` is in production); `0.peerjs.com` is redirected to it. After the
handshake the two browsers talk directly (loopback WebRTC; the Chromium flags in `playwright.config.ts` allow it and make the
unreachable public STUN/TURN servers fail fast). Connection setup takes 10-40s here, so waits are generous.

## Not yet
glass-bridge (its server room only exists in an unmerged galaga PR), and gameplay itself (moving, shooting, scoring) for any game:
these suites prove the networking, lobbies, identity and limits, not that the games are fun or fair.
