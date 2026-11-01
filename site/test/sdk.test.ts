import { describe, it, expect } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { AVATARS as SERVER_AVATARS } from "../src/lib/profile/avatars";

// The SDK is a plain browser script; run it in a bare context and read the global it defines.
const ctx: any = {};
vm.runInNewContext(fs.readFileSync(new URL("../public/arcade/_sdk/marshellis.js", import.meta.url), "utf8"), ctx);
const sdk = ctx.Marshellis;

describe("arcade SDK", () => {
  it("validates username and PIN like the server", () => {
    expect(sdk._validate("Ab_1", "1234")).toEqual({ u: "ab_1", p: "1234" });
    expect(sdk._validate("a", "1234").error).toMatch(/Username/);
    expect(sdk._validate("abc", "12").error).toMatch(/PIN/);
  });
  it("avatar list matches the server allowlist", () => {
    expect(sdk.AVATARS).toEqual([...SERVER_AVATARS]);
  });
});

// getPass: the SDK in a jsdom tab, same-origin (stubbed fetch) and framed (stubbed relay parent).
const sdkSrc = fs.readFileSync(new URL("../public/arcade/_sdk/marshellis.js", import.meta.url), "utf8");
function tab(setup: (w: any) => void) {
  const dom = new JSDOM("<body></body>", { url: "https://play.marshellis.com/arcade/x/index.html", runScripts: "outside-only" });
  const w: any = dom.window;
  setup(w);
  w.eval(sdkSrc);
  return w.Marshellis.init({ game: "nexus" });
}
const reply = (status: number, json: unknown) => async () => ({ ok: status < 400, status, json: async () => json });

describe("mg.getPass (same-origin)", () => {
  const withFetch = (f: unknown) => tab((w) => { w.fetch = f; });
  it("POSTs the room and resolves { pass, exp }", async () => {
    const calls: any[] = [];
    const mg = withFetch(async (url: string, init: any) => { calls.push([url, init.method, JSON.parse(init.body)]); return reply(200, { pass: "tok", exp: 99 })(); });
    expect(await mg.getPass("nexus")).toEqual({ pass: "tok", exp: 99 });
    expect(calls.at(-1)).toEqual(["/api/family/pass", "POST", { room: "nexus" }]);
  });
  it("403 (no play time left) -> { noTime: true }", async () => {
    expect(await withFetch(reply(403, { error: "no-time" })).getPass("nexus")).toEqual({ noTime: true });
  });
  it("guest (401), server error, bad body or network failure -> null", async () => {
    expect(await withFetch(reply(401, { error: "unauthenticated" })).getPass("nexus")).toBeNull();
    expect(await withFetch(reply(503, { error: "passes-not-configured" })).getPass("nexus")).toBeNull();
    expect(await withFetch(reply(200, {})).getPass("nexus")).toBeNull();
    expect(await withFetch(async () => { throw new Error("offline"); }).getPass("nexus")).toBeNull();
  });
});

describe("mg.getPass (framed, via the host relay)", () => {
  // A parent on the site origin (the game is on the isolated one) that answers each rpc like the host page's relay does.
  function framed(answer: (m: any) => object | null) {
    return tab((w) => {
      const parent: any = {
        location: { origin: "https://games.marshellis.com" },
        postMessage: (m: any) => {
          const out = m.path === "/api/family/pass" ? answer(m) : { ok: true, status: 401, json: { error: "unauthenticated" } };
          if (!out) return; // no reply: the rpc will time out
          const ev: any = new w.Event("message"); Object.assign(ev, { data: { mg: 1, id: m.id, ...out }, source: parent });
          w.dispatchEvent(ev);
        },
      };
      Object.defineProperty(w, "parent", { value: parent });
    });
  }
  it("relays POST /api/family/pass and resolves { pass, exp }", async () => {
    let seen: any;
    const mg = framed((m) => { seen = m; return { ok: true, status: 200, json: { pass: "tok", exp: 7 } }; });
    expect(await mg.getPass("nexus")).toEqual({ pass: "tok", exp: 7 });
    expect(seen).toMatchObject({ type: "api", method: "POST", path: "/api/family/pass", body: { room: "nexus" } });
  });
  it("relayed 403 -> { noTime: true }; relayed 401 or a refused relay -> null", async () => {
    expect(await framed(() => ({ ok: true, status: 403, json: { error: "no-time" } })).getPass("nexus")).toEqual({ noTime: true });
    expect(await framed(() => ({ ok: true, status: 401, json: { error: "unauthenticated" } })).getPass("nexus")).toBeNull();
    expect(await framed(() => ({ ok: false, status: 502, json: null })).getPass("nexus")).toBeNull();
  });
});
