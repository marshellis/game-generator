# Snowball Arena — live PvP server

Authoritative real-time server for the `snowball-arena` arcade game. The static
client (`site/public/arcade/snowball-arena/`) plays vs. a bot on its own; point it
at this server to get live 1v1 matches against other players.

It runs on [PartyKit](https://partykit.io) (Cloudflare-backed WebSockets) — a
persistent connection layer that the static Vercel site can't host itself. The
server owns the simulation; clients only send inputs and render snapshots, so
players can't cheat by editing the client.

## Run locally

```bash
cd realtime
npm install
npm run dev          # serves ws://localhost:1999
```

Then open the game pointed at it:

```
http://localhost:4321/arcade/snowball-arena?server=ws://localhost:1999
```

Open the same URL in two browser windows to play yourself against yourself. Each
PartyKit "room" is one match — players in the same room id fight each other. (The
client currently joins the default room; add a `?room=<id>` join flow for private
matches / friend invites.)

## Deploy (global)

```bash
npm run deploy       # -> wss://snowball-arena.<your-partykit-username>.partykit.dev
```

Requires a free PartyKit account (`npx partykit login`). After deploying, set the
URL in the client so everyone gets live PvP by default:

- edit `SERVER_URL` in `site/public/arcade/snowball-arena/net.js`, **or**
- always launch with `?server=wss://...`.

## Protocol

Client → server:

- `{ "t": "join", "name": "Ace" }`
- `{ "t": "input", "seq": 12, "input": { "left", "right", "jump", "duck", "aimAngle", "throw" } }`

Server → client:

- `{ "t": "welcome", "id": 0, "arena": { W, H, bunkers } }`
- `{ "t": "state", "players": [...], "balls": [...], "score": [a, b] }` (~30 Hz)
- `{ "t": "kill", "attacker": 0, "victim": 1 }`
- `{ "t": "win", "winner": 0 }`
- `{ "t": "left", "id": "<conn>" }`

The physics constants in `src/server.ts` mirror the client sim in
`site/public/arcade/snowball-arena/game.js` — **keep them in sync** when tuning.

## Roadmap

- Matchmaking / lobby (auto-pair waiting players into rooms).
- Friend invites via shareable `?room=<id>` links.
- Free-for-all 2–8 players (server already keys players by slot; lift the 1v1 cap
  in `freeSlot()` and widen the client HUD).
- Client-side interpolation/prediction for smoothness under latency (today the
  client snaps to each snapshot).
