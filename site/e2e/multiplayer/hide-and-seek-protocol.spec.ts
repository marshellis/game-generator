// Raw-WebSocket game type, driven by scripted players with real passes: lobby limits, host migration, the host-authoritative relay,
// the countdown, and what a guest (no pass) gets. Each test uses its own room name so tests never see each other's players.
import { test, expect, virtualKid, rawSocket } from "./harness";

const URL = (room: string, pass?: string) => `ws://127.0.0.1:8083/?room=${room}${pass ? `&pass=${encodeURIComponent(pass)}` : ""}`;
let n = 0;
const roomName = () => `t${Date.now().toString(36).slice(-5)}${n++}`;
const lastOf = (s: { messages: any[] }, type: string) => [...s.messages].reverse().find((m) => m.type === type);
const waitFor = async <T,>(fn: () => T | undefined, ms = 20_000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 100)); } };

test("hide-and-seek server: a lobby holds 7 players, the 8th is turned away, everyone is listed by their pass nickname", async ({ browser }) => {
  const room = roomName();
  const kids = await Promise.all(Array.from({ length: 8 }, () => virtualKid(browser)));
  const socks: Awaited<ReturnType<typeof rawSocket>>[] = [];
  for (const k of kids.slice(0, 7)) socks.push(await rawSocket(URL(room, await k.pass("hide-and-seek"))));
  const lobby = await waitFor(() => { const l = lastOf(socks[0]!, "lobby"); return l?.players?.length === 7 ? l : undefined; });
  expect(lobby.players.map((p: any) => p.name).sort()).toEqual(kids.slice(0, 7).map((k) => k.fam.child).sort());
  expect(lobby.hostId).toBe(lastOf(socks[0]!, "welcome").id);          // first in = host

  const eighth = await rawSocket(URL(room, await kids[7]!.pass("hide-and-seek")));
  expect(await eighth.closed).toBeDefined();
  expect(eighth.messages.some((m) => m.type === "full")).toBe(true);
  for (const s of socks) s.ws.close();
  await Promise.all(kids.map((k) => k.context.close()));
});

test("hide-and-seek server: no pass, a tampered pass or a forged pass all join as an anonymous 'Player N' - nobody can claim someone else's nickname", async ({ browser }) => {
  // (By design the server accepts guests unless GAME_PASS_REQUIRED=1. What it must never do is believe an unsigned name.)
  const kid = await virtualKid(browser);
  const good = await kid.pass("hide-and-seek");
  const tampered = good.split(".")[0] + "." + "A".repeat(good.split(".")[1]!.length);
  const forged = Buffer.from(JSON.stringify({ u: "evil", a: "x", c: "x", room: "hide-and-seek", exp: 9999999999, lb: true })).toString("base64url") + ".AAAA";
  for (const [label, pass] of [["no pass", undefined], ["tampered", tampered], ["forged", forged]] as const) {
    const room = roomName();
    const s = await rawSocket(URL(room, pass));
    const lobby = await waitFor(() => lastOf(s, "lobby"));
    expect(lobby.players[0].name, label).toMatch(/^Player \d+$/);
    expect(JSON.stringify(s.messages), label).not.toContain("evil");
    s.ws.close();
  }
  // and the real pass does carry the real nickname
  const s = await rawSocket(URL(roomName(), good));
  expect((await waitFor(() => lastOf(s, "lobby"))).players[0].name).toBe(kid.fam.child);
  s.ws.close();
  await kid.context.close();
});

test("hide-and-seek server: the countdown starts the game for everyone, and only the HOST can drive it", async ({ browser }) => {
  test.setTimeout(120_000);
  const room = roomName();
  const kids = await Promise.all([0, 1, 2].map(() => virtualKid(browser)));
  const [host, p2, p3] = await Promise.all(kids.map(async (k) => rawSocket(URL(room, await k.pass("hide-and-seek")))));
  await waitFor(() => (lastOf(host!, "lobby")?.players?.length === 3 ? true : undefined));
  host!.send({ type: "ready" });                                       // someone clicks Play: a countdown begins for everyone
  const counting = await waitFor(() => { const l = lastOf(p2!, "lobby"); return l?.startsIn > 0 ? l : undefined; });
  expect(counting.startsIn).toBeLessThanOrEqual(10_000);
  const start = await waitFor(() => lastOf(p3!, "start"), 30_000);
  expect(start.humans.map((h: any) => h.name).sort()).toEqual(kids.map((k) => k.fam.child).sort());

  // host -> everyone: snapshots arrive; a non-host cannot impersonate the host
  host!.send({ type: "snap", marker: "from-host" });
  p2!.send({ type: "snap", marker: "from-p2-imposter" });
  await waitFor(() => p3!.messages.find((m) => m.marker === "from-host"));
  await new Promise((r) => setTimeout(r, 500));
  expect(p3!.messages.some((m) => m.marker === "from-p2-imposter")).toBe(false);
  // player -> host only: p2's state reaches the host, not p3
  p2!.send({ type: "state", marker: "p2-state" });
  const got = await waitFor(() => host!.messages.find((m) => m.marker === "p2-state"));
  expect(got.id).toBe(lastOf(p2!, "welcome").id);                      // the server stamps who it is from
  expect(p3!.messages.some((m) => m.marker === "p2-state")).toBe(false);

  host!.send({ type: "end", seekersWin: true });                       // round over: everyone is back in the lobby
  await waitFor(() => { const l = lastOf(p2!, "lobby"); return l?.phase === "lobby" && p2!.messages.some((m) => m.type === "end") ? l : undefined; });
  for (const s of [host!, p2!, p3!]) s.ws.close();
  await Promise.all(kids.map((k) => k.context.close()));
});

test("hide-and-seek server: when the host leaves the next player becomes host, and a game in progress is cancelled", async ({ browser }) => {
  test.setTimeout(120_000);
  const room = roomName();
  const kids = await Promise.all([0, 1].map(() => virtualKid(browser)));
  const [host, p2] = await Promise.all(kids.map(async (k) => rawSocket(URL(room, await k.pass("hide-and-seek")))));
  await waitFor(() => (lastOf(host!, "lobby")?.players?.length === 2 ? true : undefined));
  const p2id = lastOf(p2!, "welcome").id;
  host!.send({ type: "ready" });
  await waitFor(() => lastOf(p2!, "start"), 30_000);
  host!.ws.close();                                                    // the host drops mid-game
  expect((await waitFor(() => lastOf(p2!, "abort"))).reason).toMatch(/host left/i);
  const lobby = await waitFor(() => { const l = lastOf(p2!, "lobby"); return l?.players?.length === 1 ? l : undefined; });
  expect(lobby.hostId).toBe(p2id);
  expect(lobby.phase).toBe("lobby");
  p2!.ws.close();
  await Promise.all(kids.map((k) => k.context.close()));
});

test("hide-and-seek server: a player whose pass runs out is told 'timeup' and dropped (4003); the others carry on", async ({ browser }) => {
  test.setTimeout(180_000);
  const room = roomName();
  const [limited, fine] = await Promise.all([virtualKid(browser, { allowance: { freePlayMin: 1, maxPlayMin: 1 }, enforcement: "hard" }), virtualKid(browser)]);
  const sl = await rawSocket(URL(room, await limited.pass("hide-and-seek")));
  const sf = await rawSocket(URL(room, await fine.pass("hide-and-seek")));
  expect(await Promise.race([sl.closed, new Promise<number>((r) => setTimeout(() => r(-1), 100_000))])).toBe(4003);
  expect(sl.messages.some((m) => m.type === "timeup")).toBe(true);
  await waitFor(() => { const l = lastOf(sf, "lobby"); return l?.players?.length === 1 ? l : undefined; });   // the other player sees them go
  sf.ws.close();
  await limited.context.close(); await fine.context.close();
});
