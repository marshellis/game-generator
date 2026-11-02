// Raw-WebSocket hub + racing game (the private nexus-server): presence in the hub, the racing lobby and countdown, server-measured
// finish times, rate limiting, and - the point of the whole platform - a child who EARNS more time mid-session keeps their connection
// by renewing their pass, while the server still enforces the limit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, virtualKid, rawSocket, earnTime, mintPass } from "./harness";

const DIR = process.env.MP_SERVERS_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.mp-servers");
test.skip(!fs.existsSync(path.join(DIR, "nexus-server")), "nexus-server is private: run `GH_TOKEN=... npm run e2e:mp:setup` to include it");

const URL = (pass?: string) => `ws://127.0.0.1:8081/${pass ? `?pass=${encodeURIComponent(pass)}` : ""}`;
const last = (s: { messages: any[] }, type: string) => [...s.messages].reverse().find((m) => m.type === type);
const waitFor = async <T,>(fn: () => T | undefined, ms = 20_000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 100)); } };

test("nexus: kids in the hub see each other (by pass nickname) and where they are", async ({ browser }) => {
  const [a, b] = await Promise.all([virtualKid(browser), virtualKid(browser)]);
  const sa = await rawSocket(URL(await a.pass("nexus"))), sb = await rawSocket(URL(await b.pass("nexus")));
  expect((await waitFor(() => last(sa, "welcome"))).name).toBe(a.fam.child);       // the server named them from the signed pass
  expect((await waitFor(() => last(sb, "welcome"))).verified).toBe(true);
  sa.send({ type: "pos", x: 1.5, y: 0, z: -3, h: 0.5, m: 1, g: 1, s: 0 });
  sb.send({ type: "pos", x: 9, y: 0, z: 9, h: 0, m: 0, g: 1, s: 0 });
  const hub = await waitFor(() => { const h = last(sb, "hub"); return h?.players?.length === 1 ? h : undefined; });
  expect(hub.players[0]).toMatchObject({ name: a.fam.child, x: 1.5, z: -3 });
  expect(hub.online).toBeGreaterThanOrEqual(2);
  sa.ws.close();
  await waitFor(() => { const h = last(sb, "hub"); return h && h.players.length === 0 ? h : undefined; });   // A leaves: B's hub empties
  sb.ws.close(); await a.context.close(); await b.context.close();
});

test("nexus: racing lobby -> countdown -> everyone finishes -> server-measured results", async ({ browser }) => {
  test.setTimeout(120_000);
  const kids = await Promise.all([0, 1, 2].map(() => virtualKid(browser)));
  const socks = await Promise.all(kids.map(async (k) => rawSocket(URL(await k.pass("nexus")))));
  socks.forEach((s) => s.send({ type: "area", a: "racing" }));
  const info = await waitFor(() => { const r = last(socks[0]!, "race"); return r?.total === 3 ? r : undefined; });
  expect(info.phase).toBe("lobby");
  socks.forEach((s) => s.send({ type: "ready" }));                     // all ready skips the lobby wait
  const start = await waitFor(() => { const r = last(socks[1]!, "race"); return r?.phase === "racing" ? r : undefined; });
  expect(start.field.map((f: any) => f.name).sort()).toEqual(kids.map((k) => k.fam.child).sort());
  expect(start.hostId).toBe(last(socks[0]!, "welcome").id);            // first racer is the host

  await new Promise((r) => setTimeout(r, Math.max(0, start.startAt - Date.now()) + 300));   // wait out the grid countdown
  socks[0]!.send({ type: "car", c: [1, 2, 3, 4, 5, 6] });
  const cars = await waitFor(() => socks[1]!.messages.filter((m) => m.type === "cars").pop());
  expect(Object.keys(cars.cars).length).toBeGreaterThanOrEqual(0);
  // players report finishing, claiming silly times; the SERVER measures
  socks.forEach((s, i) => setTimeout(() => s.send({ type: "finish", t: 0.001 }), 300 * i));
  const end = await waitFor(() => last(socks[2]!, "race-end"), 30_000);
  expect(end.results).toHaveLength(3);
  for (const r of end.results) expect(r.t).toBeGreaterThan(0.1);      // nobody got "0.001"
  expect(end.results.map((r: any) => r.t)).toEqual([...end.results.map((r: any) => r.t)].sort((x: number, y: number) => x - y));   // ranked fastest first
  socks.forEach((s) => s.ws.close());
  await Promise.all(kids.map((k) => k.context.close()));
});

test("nexus: a flood of messages is rate limited; oversized frames are refused", async ({ browser }) => {
  const k = await virtualKid(browser);
  const s = await rawSocket(URL(await k.pass("nexus")));
  await waitFor(() => last(s, "welcome"));
  for (let i = 0; i < 300; i++) s.send({ type: "ping", t: i });
  await new Promise((r) => setTimeout(r, 800));
  expect(s.messages.filter((m) => m.type === "pong").length).toBeLessThan(150);   // ~60 per 250ms window were honoured, the rest dropped
  s.ws.send("x".repeat(10_000));                                                   // maxPayload is 4096
  expect(await Promise.race([s.closed, new Promise<number>((r) => setTimeout(() => r(-1), 5000))])).not.toBe(-1);
  await k.context.close();
});

test("nexus + the education loop: a child who earns more time mid-session renews their pass and stays connected; without it the server drops them", async ({ browser }) => {
  test.setTimeout(150_000);
  const settings = { allowance: { freePlayMin: 0.5, maxPlayMin: 90 }, mix: { preset: "balanced" }, enforcement: "soft" };   // 30 seconds, then learn to earn
  const [earner, stuck] = await Promise.all([virtualKid(browser, settings), virtualKid(browser, settings)]);
  const t0 = Date.now();
  const sEarn = await rawSocket(URL(await earner.pass("nexus"))), sStuck = await rawSocket(URL(await stuck.pass("nexus")));
  await waitFor(() => last(sEarn, "welcome"));

  await earnTime(earner.context, 3);                                  // the brain break: 3 right answers = +2 minutes at 2:1
  const renewed = await mintPass(earner.context, "nexus");            // the game fetches a fresh pass for the extended allowance...
  sEarn.send({ type: "renew", pass: renewed });                       // ...and hands it to the server

  // the child who did NOT earn anything is dropped at their original ~30s expiry; the one who renewed carries on past it
  expect(await Promise.race([sStuck.closed, new Promise<number>((r) => setTimeout(() => r(-1), 60_000))])).toBe(4003);
  expect(sStuck.messages.some((m) => m.type === "timeup")).toBe(true);
  expect(Date.now() - t0).toBeGreaterThan(25_000);
  expect(sEarn.ws.readyState).toBe(1);                                // still connected after the original pass expired
  expect(sEarn.messages.some((m) => m.type === "timeup")).toBe(false);
  sEarn.ws.close();
  await earner.context.close(); await stuck.context.close();
});
