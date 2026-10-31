// The isolated arcade origin: a game running on play.marshellis.com has no cookies and no site access;
// the host page relays an allowlist. These tests play the part of a hostile game trying to get out.
import { describe, it, expect, afterEach } from "vitest";
import { createWorld, ARCADE_ORIGIN, SITE_ORIGIN } from "./world";
import { Parent } from "./actors";
import { openTab, flush } from "./dom";
import { originAllowed, selfOrigins } from "../../src/lib/origin";

const tabs: ReturnType<typeof openTab>[] = [];
afterEach(() => { tabs.splice(0).forEach((t) => t.close()); });

async function setup(settings: object = { allowance: { freePlayMin: 10, maxPlayMin: 10 }, enforcement: "hard" }) {
  const w = createWorld();
  const mum = await Parent.signup(w);
  const kid = await mum.addChild("ava", 2017, settings);
  const host = openTab(w, kid.b, { url: `${SITE_ORIGIN}/arcade/x/play` }); tabs.push(host);
  // The game: its own origin, so its own (empty) cookie jar. It never sees the kid's cookies.
  const gameBrowser = w.browser(ARCADE_ORIGIN);
  const game = openTab(w, gameBrowser, { url: `${ARCADE_ORIGIN}/arcade/x/index.html`, parent: host, crossOrigin: true }); tabs.push(game);
  const mg = host.sdk({ game: "flappy", host: true, frame: game.frame });
  await flush(30);
  const gsdk = game.sdk({ game: "flappy" });
  await flush(30);
  return { w, mum, kid, host, game, gameBrowser, mg, gsdk };
}

describe("origin guard", () => {
  it("allows same-origin and header-less writes, refuses foreign origins, never blocks reads", () => {
    const self = [SITE_ORIGIN];
    expect(originAllowed("POST", SITE_ORIGIN, self)).toBe(true);
    expect(originAllowed("POST", undefined, self)).toBe(true); // webhooks, curl
    expect(originAllowed("POST", ARCADE_ORIGIN, self)).toBe(false);
    expect(originAllowed("DELETE", "https://evil.example", self)).toBe(false);
    expect(originAllowed("GET", "https://evil.example", self)).toBe(true);
    const req = new Request("http://internal/", { headers: { "x-forwarded-host": "games.marshellis.com" } });
    expect(selfOrigins(req, new URL("http://internal/"))).toContain("https://games.marshellis.com");
  });
});

describe("a game on the isolated origin", () => {
  it("has no ambient authority: direct calls to the family API from its own origin do nothing", async () => {
    const { gameBrowser } = await setup();
    for (const [m, u] of [["GET", "/api/family/household"], ["GET", "/api/me"], ["POST", "/api/family/billing/cancel"], ["DELETE", "/api/family/profiles/ava"]] as const) {
      const r = await gameBrowser.request(m, u, m === "GET" ? undefined : { password: "x" });
      expect(r.ok, `${m} ${u}`).toBe(false);
    }
    // Even forging the kid's host and hitting the site origin cross-site is refused by the Origin guard.
    const cross = await gameBrowser.request("POST", `${SITE_ORIGIN}/api/scores`, { game: "flappy", score: 5 });
    expect(cross.status).toBe(403);
  });
  it("can still do its job through the relay: identity, score, board, clock", async () => {
    const { w, kid, mg, gsdk } = await setup({ allowance: { freePlayMin: 30, maxPlayMin: 60 } });
    expect(mg.who()?.username).toBe("ava"); // host is signed in as the kid
    await gsdk.ready;
    expect(gsdk.who()?.username).toBe("ava"); // game learns who via the relay, not cookies
    const r = await gsdk.submitScore(42);
    expect(r?.best).toBe(42);
    expect(w.store.boards.get("flappy")?.get("ava")).toBe(42);
    expect(await gsdk.gate()).toBe(true);
    void kid;
  });
  it("cannot use the relay to reach parent, billing, profile or store routes (allowlist)", async () => {
    const { w, mum, game, gameBrowser } = await setup();
    // Speak the wire protocol directly, like a game that skips the SDK.
    const sent: any[] = [];
    game.w.addEventListener("message", (e: any) => sent.push(e.data));
    const ask = async (method: string, path: string, body?: unknown) => {
      const id = Math.floor(Math.random() * 1e9);
      game.w.parent.postMessage({ mg: 1, id, type: "api", method, path, body });
      await flush(40);
      return sent.find((m) => m.id === id);
    };
    for (const [m, p] of [
      ["DELETE", "/api/family/profiles/ava"], ["POST", "/api/family/billing/cancel"], ["POST", "/api/family/billing/checkout"],
      ["GET", "/api/family/household"], ["GET", "/api/family/profiles/ava/export"], ["PATCH", "/api/family/profiles/ava"],
      ["POST", "/api/family/store/review"], ["POST", "/api/family/pass"], ["POST", "/api/family/switch"], ["GET", "/api/family/picker"],
      ["DELETE", "/api/scores"], ["GET", "/api/me/trophies"], ["GET", "/api/../family/household"], ["GET", "https://evil.example/x"],
    ]) {
      const r = await ask(m, p, { password: "x" });
      expect(r?.status, `${m} ${p} must not be relayed`).toBe(403);
    }
    expect(await w.store.getUser("ava")).not.toBeNull();
    void mum; void gameBrowser;
  });
  it("only the real iframe's window can talk to the relay (another window is ignored)", async () => {
    const { w, kid, host } = await setup();
    const stranger = openTab(w, w.browser(ARCADE_ORIGIN), { parent: host, crossOrigin: true }); tabs.push(stranger);
    const got: any[] = [];
    stranger.w.addEventListener("message", (e: any) => got.push(e.data));
    stranger.w.parent.postMessage({ mg: 1, id: 7, type: "api", method: "GET", path: "/api/me" });
    await flush(40);
    expect(got).toEqual([]); // host ignored it: source is not frame.contentWindow
    void kid;
  });
  it("time limits still hold: the relayed game cannot run a second clock, and the host gate speaks for it", async () => {
    const { w, kid, host, gsdk } = await setup({ allowance: { freePlayMin: 5, maxPlayMin: 5 }, enforcement: "hard" });
    gsdk.startPlaying(); // delegated to the host: must not start its own timer
    await host.fire(4 * 60);
    expect((await kid.status()).remainingSec).toBeLessThan(75);
    expect((await kid.status()).remainingSec).toBeGreaterThan(40);
    await host.fire(2 * 60);
    expect((await kid.status()).ok).toBe(false);
    // The game asking to start another round gets the host's answer: no.
    const overlayBefore = host.doc.querySelectorAll(".mg-ov").length;
    const g = gsdk.gate();
    await flush(60);
    expect(host.doc.querySelectorAll(".mg-ov").length).toBeGreaterThan(overlayBefore);
    host.doc.querySelector<HTMLButtonElement>(".mg-go")!.click();
    expect(await g).toBe(false);
    void w;
  });
});
