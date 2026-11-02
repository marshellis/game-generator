// Multiplayer test harness: the REAL game servers run locally; the browsers think they are talking to production.
//
//   const kid1 = await joinAsKid(browser, "alice");   // own browser context, own family, signed in as a child
//   await redirectToLocal(kid1.context, net);          // *.fly.dev -> 127.0.0.1 (HTTP and WebSocket), observed
//   await kid1.page.goto("/arcade/hide-and-seek/play");
//
// Servers are started by playwright.mp.config.ts (webServer) from the checkouts made by setup.mjs, with the SAME game-pass
// secret as the local site, so the whole chain is real: site issues a pass -> game connects -> server verifies it.
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import WebSocket from "ws";
import { becomeKid, makeFamily, type Family } from "../helpers";

export const PASS_SECRET = "e2e-pass-secret-e2e-pass-secret";
// Ports match what each game picks when it is served from localhost (galaga and glass-bridge: ws://localhost:2567, nexus: :8081),
// so a game that decides on its own to talk to "its local server" finds the right one.
export const LOCAL_SERVERS: Record<string, { port: number; name: string }> = {
  "battle-royale-server.fly.dev": { port: 2568, name: "battle-royale" },
  "hide-and-seek-server.fly.dev": { port: 8083, name: "hide-and-seek" },
  "nexus-server.fly.dev": { port: 8081, name: "nexus" },
  "galaga-server.fly.dev": { port: 2567, name: "galaga" },
  // the public PeerJS signalling broker the WebRTC games use by default; players then connect directly to each other
  "0.peerjs.com": { port: 9000, name: "peerjs" },
};

export interface WsRecord { host: string; path: string; query: URLSearchParams; toServer: number; toPage: number; open: boolean; closeCode?: number; lastToPage?: string[] }
export interface NetObserver { sockets: WsRecord[]; http: { host: string; path: string; status: number }[] }
export const observer = (): NetObserver => ({ sockets: [], http: [] });

/** Send every request the page makes to a production game host to the local copy of that server instead. */
export async function redirectToLocal(context: BrowserContext, obs: NetObserver = observer()): Promise<NetObserver> {
  const hosts = Object.keys(LOCAL_SERVERS).map((h) => h.replace(/\./g, "\\.")).join("|");
  await context.route(new RegExp(`^https://(${hosts})/`), async (route) => {
    const u = new URL(route.request().url());
    const resp = await route.fetch({ url: `http://127.0.0.1:${LOCAL_SERVERS[u.hostname]!.port}${u.pathname}${u.search}` });
    obs.http.push({ host: u.hostname, path: u.pathname, status: resp.status() });
    await route.fulfill({ response: resp });
  });
  await context.routeWebSocket(new RegExp(`^wss://(${hosts})/`), (ws) => {
    const u = new URL(ws.url());
    const rec: WsRecord = { host: u.hostname, path: u.pathname, query: u.searchParams, toServer: 0, toPage: 0, open: false, lastToPage: [] };
    obs.sockets.push(rec);
    const local = new WebSocket(`ws://127.0.0.1:${LOCAL_SERVERS[u.hostname]!.port}${u.pathname}${u.search}`);
    const pending: (string | Buffer)[] = [];
    local.on("open", () => { rec.open = true; for (const m of pending.splice(0)) local.send(m); });
    local.on("message", (d, isBinary) => { rec.toPage++; if (!isBinary) { rec.lastToPage!.push(d.toString().slice(0, 200)); if (rec.lastToPage!.length > 20) rec.lastToPage!.shift(); } ws.send(isBinary ? (d as Buffer) : d.toString()); });
    local.on("close", (code) => { rec.open = false; rec.closeCode = code; ws.close({ code: code === 1005 ? 1000 : code }); });
    local.on("error", () => { rec.open = false; });
    ws.onMessage((m) => { rec.toServer++; if (rec.open) local.send(m as string | Buffer); else pending.push(m as string | Buffer); });
    ws.onClose(() => { try { local.close(); } catch { /* already closed */ } });
  });
  return obs;
}

/** Also observe sockets a game opens straight to localhost (some games pick a local server when served from localhost). */
export function observeDirectSockets(page: Page, obs: NetObserver) {
  page.on("websocket", (ws) => {
    const u = new URL(ws.url());
    if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) || u.port === "4321") return; // the dev server's own HMR socket is not a game
    const rec: WsRecord = { host: `${u.hostname}:${u.port}`, path: u.pathname, query: u.searchParams, toServer: 0, toPage: 0, open: true, lastToPage: [] };
    obs.sockets.push(rec);
    ws.on("framesent", () => { rec.toServer++; });
    ws.on("framereceived", (f) => { rec.toPage++; if (typeof f.payload === "string") { rec.lastToPage!.push(f.payload.slice(0, 200)); if (rec.lastToPage!.length > 30) rec.lastToPage!.shift(); } });
    ws.on("close", () => { rec.open = false; });
  });
}

export interface Kid { context: BrowserContext; page: Page; fam: Family; net: NetObserver }

/** A separate device: its own context, its own family and signed-in child, all game-server traffic redirected local and observed. */
export async function joinAsKid(browser: Browser, settings: object = { allowance: { freePlayMin: 60, maxPlayMin: 120 } }): Promise<Kid> {
  // Small window on purpose: several software-rendered 3D games at once would otherwise starve each other's network calls on a CI box.
  const context = await browser.newContext({ viewport: { width: 420, height: 300 } });
  const net = await redirectToLocal(context);
  const fam = await makeFamily(context, { settings });
  await becomeKid(context, fam);
  const page = await context.newPage();
  observeDirectSockets(page, net);
  return { context, page, fam, net };
}

export async function gameFrame(page: Page, slug: string) {
  for (let i = 0; i < 120; i++) { const f = page.frames().find((x) => x.url().includes(`/arcade/${slug}/index.html`)); if (f) return f; await page.waitForTimeout(250); }
  throw new Error(`no frame for ${slug}`);
}

/** Decode the claims out of a game pass (the server verified the signature; this is for assertions). */
export const passClaims = (pass: string) => JSON.parse(Buffer.from(pass.split(".")[0]!, "base64url").toString()) as { u: string; room: string; exp: number };
export { test } from "@playwright/test";
export { expect };

/** What a local Colyseus server says about its rooms right now (server-side truth, independent of what the game shows). */
export async function colyseusRooms(port: number, roomName: string): Promise<{ roomId: string; clients: number; maxClients: number; metadata?: Record<string, unknown> }[]> {
  const r = await fetch(`http://127.0.0.1:${port}/matchmake/${roomName}`);
  return r.ok ? ((await r.json()) as never) : [];
}

// ---------------------------------------------------------------------------------------------------------------------
// Virtual players: scripted clients that join the REAL servers with REAL passes minted by the local site. They scale a test
// to a full lobby (8 players) without 8 browsers, and give server-side truth (`room.state`) to assert against.
// ---------------------------------------------------------------------------------------------------------------------
import { Client as ColyseusClient, type Room } from "colyseus.js";

/** Ask the local site for a game pass as this kid, exactly like a game page does. */
export async function mintPass(context: BrowserContext, room: string): Promise<string> {
  const r = await context.request.post("/api/family/pass", { data: { room } });
  expect(r.ok(), `pass for ${room}: ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()).pass as string;
}

/** A kid without a browser: own family + signed-in child, used only to mint passes. */
export async function virtualKid(browser: Browser, settings?: object): Promise<{ context: BrowserContext; fam: Family; pass: (room: string) => Promise<string> }> {
  const context = await browser.newContext();
  const fam = await makeFamily(context, { settings: settings ?? { allowance: { freePlayMin: 60, maxPlayMin: 120 } } });
  await becomeKid(context, fam);
  return { context, fam, pass: (room) => mintPass(context, room) };
}

/** Join a Colyseus room by id as a virtual player. `onLeave` code 4003 = the server dropped them when their pass ran out. */
export async function colyseusJoin(port: number, roomId: string, pass: string, extra: Record<string, unknown> = {}): Promise<Room & { leftWith?: number }> {
  const room = (await new ColyseusClient(`ws://127.0.0.1:${port}`).joinById(roomId, { displayName: "virtual", pass, ...extra })) as Room & { leftWith?: number };
  room.onLeave((code) => { room.leftWith = code; });
  return room;
}

/** Join a raw-WebSocket game (hide-and-seek / nexus style): resolves with the socket and everything the server sends. */
export async function rawSocket(url: string): Promise<{ ws: WebSocket; messages: any[]; closed: Promise<number>; send(o: unknown): void }> {
  const ws = new WebSocket(url), messages: any[] = [];
  let resolveClosed!: (c: number) => void;
  const closed = new Promise<number>((r) => { resolveClosed = r; });
  ws.on("message", (d) => { try { messages.push(JSON.parse(d.toString())); } catch { /* binary */ } });
  ws.on("close", (c) => resolveClosed(c));
  await new Promise<void>((res, rej) => { ws.on("open", () => res()); ws.on("error", rej); });
  return { ws, messages, closed, send: (o) => ws.send(JSON.stringify(o)) };
}

/** A child answers `n` brain-break questions correctly through the real API (the education loop) and so earns play time. */
export async function earnTime(context: BrowserContext, n = 3): Promise<void> {
  const { checkAnswer } = await import("../../src/lib/family/questions");
  const next = await context.request.get(`/api/family/learn/next?count=${n}`);
  expect(next.ok(), `learn/next: ${next.status()}`).toBe(true);
  for (const it of (await next.json()).items as { id: string; token: string; choices: string[] }[]) {
    const right = it.choices.find((c) => checkAnswer("e2e-session-secret-e2e-session-secret", it.id, it.token, c))!;
    const a = await context.request.post("/api/family/learn/answer", { data: { id: it.id, token: it.token, choice: right } });
    expect(a.ok()).toBe(true);
  }
}
