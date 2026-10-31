// End to end: the real SDK in a fake browser, talking to the real family handlers (in-memory storage).
// Proves the whole loop a kid experiences: pick profile -> gate -> learning break -> earn time -> play -> time up.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { memoryKV } from "../src/lib/family/kv";
import * as A from "../src/lib/family/accounts";
import "../src/lib/family/register";
import { handle } from "../src/lib/family/router";
import { checkAnswer } from "../src/lib/family/questions";

const SECRET = "sec";
const sdkSrc = fs.readFileSync(new URL("../public/arcade/_sdk/marshellis.js", import.meta.url), "utf8");
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function world() {
  const users = new Map<string, any>();
  const store: any = {
    async getUser(u: string) { return users.get(u) ?? null; },
    async createUser(u: string, r: any) { if (users.has(u)) return false; users.set(u, r); return true; },
    async bumpScore() { return 0; }, async topScores() { return []; }, async userBest() { return 0; },
  };
  const kv = memoryKV();
  const jar: Record<string, string> = {};
  const d = () => ({ kv, store, secret: SECRET, now: Date.now() });
  const dom = new JSDOM('<div id="chip"></div><div id="picker"></div><div id="acc"></div><div id="board"></div>', { url: "https://games.marshellis.com/arcade/x/", runScripts: "outside-only" });
  const w: any = dom.window;
  w.fetch = async (url: string, init: any = {}) => {
    const u = new URL(url, "https://games.marshellis.com");
    const cookies = (n: string) => jar[n];
    let res: any;
    if (u.pathname.startsWith("/api/family/")) {
      res = await handle({
        method: init.method ?? "GET", path: u.pathname.replace("/api/family/", "").split("/"), body: init.body ? JSON.parse(init.body) : {},
        tokens: { parent: cookies("mg_parent"), household: cookies("mg_household") }, childToken: cookies("mg_session"),
        query: Object.fromEntries(u.searchParams),
      }, d());
    } else if (u.pathname === "/api/me") {
      const { verifySession } = await import("../src/lib/profile/session");
      const s = verifySession(cookies("mg_session"), SECRET, Math.floor(Date.now() / 1000));
      res = s ? { status: 200, json: { username: s.username, avatar: "🦊", avatarColor: "#fde68a" } } : { status: 401, json: {} };
    } else res = { status: 404, json: {} };
    for (const c of res.cookies ?? []) { if (c.clear) delete jar[c.name]; else jar[c.name] = c.value; }
    return { ok: res.status < 400, status: res.status, json: async () => res.json };
  };
  w.eval(sdkSrc);
  return { d, jar, w, dom };
}

async function family(over: object) {
  const x = world();
  const s = await A.signupParent({ email: "m@x.com", password: "correct horse battery", consent: true }, x.d());
  for (const c of s.cookies!) x.jar[c.name] = c.value;
  const tk = { parent: x.jar.mg_parent, household: x.jar.mg_household };
  await A.addProfile(tk, { nickname: "kida", birthYear: 2017 }, x.d());
  await A.updateProfile(tk, "kida", { settings: over }, x.d());
  return x;
}

// Click the right answer for whatever question is on screen (the test knows the secret; a kid would just know the math).
async function answerAll(x: Awaited<ReturnType<typeof world>>, rightly: boolean) {
  const doc = x.w.document;
  for (let guard = 0; guard < 20; guard++) {
    await wait(30);
    if (doc.querySelector(".mg-go")) return;
    const btns = [...doc.querySelectorAll(".mg-ch button")] as HTMLButtonElement[];
    if (!btns.length) continue;
    // fetch the item list the overlay is showing: recompute correctness through the same API the server used
    const items = (x as any).items as any[];
    const prompt = doc.querySelector(".mg-q")!.textContent;
    const it = items.find((i) => i.prompt === prompt)!;
    const right = btns.find((b) => checkAnswer(SECRET, it.id, it.token, b.textContent!))!;
    const wrong = btns.find((b) => b !== right)!;
    (rightly ? right : wrong).click();
    await wait(800);
  }
}

describe("kid loop in the browser SDK", () => {
  it("out of free time -> learning break -> earn time -> gate opens; hard limit shows time-up", async () => {
    const x = await family({ allowance: { freePlayMin: 0, maxPlayMin: 90 }, mix: { preset: "balanced", questionsPerBreak: 2 } });
    // capture the items the server hands out so the test can recognise the right answer
    const realFetch = x.w.fetch; (x as any).items = [];
    x.w.fetch = async (url: string, init?: any) => { const r = await realFetch(url, init); if (String(url).includes("learn/next")) { const j = await r.json(); (x as any).items.push(...j.items); return { ...r, json: async () => j }; } return r; };

    // Parent hands the phone over: kid taps their profile in the picker.
    const mg = x.w.Marshellis.init({ game: "t", chip: "#chip", picker: "#picker", account: "#acc", board: "#board" });
    await wait(60);
    const pickBtn = x.w.document.querySelector(".mg-pick button") as HTMLButtonElement;
    expect(pickBtn.textContent).toContain("kida");
    pickBtn.click(); await wait(80);
    expect(mg.who()?.username).toBe("kida");

    // Gate: no free time, so a learning break appears instead of the game starting.
    const gate = mg.gate();
    await wait(80);
    expect(x.w.document.querySelector(".mg-ov")).toBeTruthy();
    await answerAll(x, true);
    expect(x.w.document.body.textContent).toMatch(/of play time/);
    (x.w.document.querySelector(".mg-go") as HTMLButtonElement).click();
    expect(await gate).toBe(true);
    const st = await mg.status();
    expect(st.ok).toBe(true);
    expect(st.remainingSec).toBeGreaterThan(0);
  });

  it("wrong answers earn nothing, so the kid cannot pass the gate", async () => {
    const x = await family({ allowance: { freePlayMin: 0, maxPlayMin: 90 }, mix: { preset: "balanced", questionsPerBreak: 1 } });
    (x as any).items = []; const realFetch = x.w.fetch;
    x.w.fetch = async (url: string, init?: any) => { const r = await realFetch(url, init); if (String(url).includes("learn/next")) { const j = await r.json(); (x as any).items.push(...j.items); return { ...r, json: async () => j }; } return r; };
    const mg = x.w.Marshellis.init({ game: "t", picker: "#picker" }); await wait(60);
    (x.w.document.querySelector(".mg-pick button") as HTMLButtonElement).click(); await wait(80);
    void mg.gate(); await wait(80);
    await answerAll(x, false);
    expect((await mg.status()).ok).toBe(false);
  });

  it("hard stop: time-up screen, gate returns false", async () => {
    const x = await family({ allowance: { freePlayMin: 0, maxPlayMin: 0 }, mix: { preset: "balanced" }, enforcement: "hard" });
    const mg = x.w.Marshellis.init({ game: "t", picker: "#picker" }); await wait(60);
    (x.w.document.querySelector(".mg-pick button") as HTMLButtonElement).click(); await wait(80);
    const gate = mg.gate(); await wait(80);
    expect(x.w.document.body.textContent).toMatch(/all the play time for today/);
    (x.w.document.querySelector(".mg-go") as HTMLButtonElement).click();
    expect(await gate).toBe(false);
  });

  it("guests are never gated", async () => {
    const x = world();
    const mg = x.w.Marshellis.init({ game: "t" }); await wait(40);
    expect(await mg.gate()).toBe(true);
  });
});
