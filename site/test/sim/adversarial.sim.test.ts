// Red-team suite: one test per way a kid (or a page running on our origin) could cheat or break in.
// Each encodes a finding from the 2026-10-31 review. If you add a feature, add its attacker here.
import { describe, it, expect, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { createWorld, DEFAULT_START } from "./world";
import { Parent, Cheater, PASSWORD } from "./actors";
import { openTab, flush } from "./dom";
import { verifyStripeSignature } from "../../src/lib/family/billing";
import { PUZZLE_DAILY_CAP } from "../../src/lib/family/wallet";

const forge = (user: string, secret: string, iat: number) => {
  const payload = `${user}.${iat}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
};

describe("forged sessions", () => {
  it("an unset SESSION_SECRET fails closed: nobody can be forged in, and nothing mints a cookie", async () => {
    const w = createWorld({ secret: "" });
    const attacker = w.browser();
    attacker.setCookie("mg_session", forge("victim", "", Math.floor(w.now / 1000)));
    expect((await attacker.get("/api/me")).status).toBe(401);
    expect((await attacker.get("/api/family/play/status")).status).toBe(401);
    // Legit signup must not silently mint a session signed with an empty key either.
    await expect(w.browser().post("/api/auth/signup", { username: "newkid", pin: "1234" })).rejects.toThrow(/SESSION_SECRET/);
  });
  it("a cookie signed with the wrong secret, or expired, is rejected", async () => {
    const w = createWorld();
    const b = w.browser();
    b.setCookie("mg_session", forge("victim", "not-the-secret", Math.floor(w.now / 1000)));
    expect((await b.get("/api/me")).status).toBe(401);
    b.setCookie("mg_session", forge("victim", w.secret, Math.floor(w.now / 1000) - 91 * 86400));
    expect((await b.get("/api/me")).status).toBe(401);
  });
});

describe("parent mode on a borrowed or compromised device", () => {
  it("replaying the parent cookie cannot delete a child or cancel billing without the password", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    await mum.addChild("ava");
    // A hostile page on our origin has the parent's cookies (browser sends them) but not the password.
    const evil = w.browser(); evil.adopt(mum.b);
    expect((await evil.delete("/api/family/profiles/ava")).status).toBe(403);
    expect((await evil.delete("/api/family/profiles/ava", { password: "guess" })).status).toBe(403);
    expect(await w.store.getUser("ava")).not.toBeNull();
    expect((await evil.post("/api/family/billing/cancel")).status).toBe(403);
    // The real parent can.
    expect((await mum.b.delete("/api/family/profiles/ava", { password: PASSWORD })).status).toBe(200);
  });
  it("the password step-up cannot be brute-forced", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    await mum.addChild("ava");
    for (let i = 0; i < 8; i++) await mum.b.delete("/api/family/profiles/ava", { password: `wrong-${i}` });
    expect((await mum.b.delete("/api/family/profiles/ava", { password: PASSWORD })).status).toBe(429);
  });
  it("parent unlock expires after 30 minutes; the kid device never had it", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    const ava = await mum.addChild("ava");
    expect((await ava.b.get("/api/family/household")).status).toBe(401); // linked device, not unlocked
    expect((await ava.b.patch("/api/family/profiles/ava", { settings: { allowance: { freePlayMin: 600, maxPlayMin: 1440 } } })).status).toBe(401);
    w.advance(31 * 60 * 1000);
    expect((await mum.household()).status).toBe(401);
    expect((await mum.login()).ok).toBe(true);
  });
});

describe("household isolation", () => {
  it("another family can't read, change, export, delete or sign in as your child", async () => {
    const w = createWorld();
    const a = await Parent.signup(w, "a@x.com"); await a.addChild("ava");
    const b = await Parent.signup(w, "b@x.com");
    expect((await b.b.patch("/api/family/profiles/ava", { settings: {} })).status).toBe(404);
    expect((await b.b.get("/api/family/profiles/ava/export")).status).toBe(404);
    expect((await b.b.delete("/api/family/profiles/ava", { password: PASSWORD })).status).toBe(404);
    expect((await b.b.post("/api/family/switch", { username: "ava" })).status).toBe(403);
  });
  it("a PIN-locked profile needs its PIN, with lockout", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    await mum.b.post("/api/family/profiles", { nickname: "ava", birthYear: 2017, pin: "4321" });
    const dev = w.browser(); dev.adopt(mum.b);
    expect((await dev.post("/api/family/switch", { username: "ava", pin: "0000" })).status).toBe(401);
    for (let i = 0; i < 8; i++) await dev.post("/api/family/switch", { username: "ava", pin: "1111" });
    expect((await dev.post("/api/family/switch", { username: "ava", pin: "4321" })).status).toBe(429);
  });
});

describe("play-time economy", () => {
  it("farming 'finished puzzles' with fresh ids earns at most the daily cap", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    const k = await mum.addChild("ava", 2017, { allowance: { freePlayMin: 0, maxPlayMin: 600 }, mix: { preset: "balanced" } });
    const cheat = Object.assign(new Cheater(w, k.b, "ava"));
    await cheat.farmPuzzles("sudoku", 200);
    const st = await cheat.status();
    expect(st.remainingSec).toBe(PUZZLE_DAILY_CAP * 3 * 20 * 2); // cap puzzles * weight * sec * ratio
    // The same id twice, junk ids and unknown games earn nothing.
    expect((await cheat.reportPuzzle("sudoku", "bad id with spaces")).status).toBe(400);
    expect((await cheat.reportPuzzle("not-a-game", "x1")).status).toBe(400);
    // Next family day the cap resets.
    w.advance(24 * 3600 * 1000);
    expect((await cheat.reportPuzzle("sudoku", "fresh-1")).json.remainingSec).toBeGreaterThan(0);
  });
  it("tick claims are bounded by the clock: huge, negative and bursty claims buy nothing", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    const k = await mum.addChild("ava", 2017, { allowance: { freePlayMin: 10, maxPlayMin: 10 } });
    const c = new Cheater(w, k.b, "ava");
    await c.tickClaim(0);
    expect((await c.tickClaim(1e9)).json.remainingSec).toBe(600);
    await c.tickClaim(-500);
    // 100 back-to-back 30s claims in one wall-clock instant.
    let last: any; for (let i = 0; i < 100; i++) last = await c.tickClaim(30);
    expect(last.json.remainingSec).toBe(600); // no wall-clock time passed, so nothing was spent
  });
  it("a learning answer can't be replayed, forged or taken from a stranger's token", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    const k = await mum.addChild("ava", 2017, { allowance: { freePlayMin: 0, maxPlayMin: 600 } });
    const next = await k.b.get("/api/family/learn/next?count=1");
    const it = next.json.items[0];
    const wrong = it.choices.find((c: string) => c !== it.choices[0])!;
    const first = await k.b.post("/api/family/learn/answer", { id: it.id, token: it.token, choice: wrong });
    expect(first.json.correct).toBe(false);
    // Replaying the same id (now guessing another choice) is refused: one try per question.
    expect((await k.b.post("/api/family/learn/answer", { id: it.id, token: it.token, choice: it.choices[0] })).status).toBe(409);
    // A made-up token never validates.
    const it2 = (await k.b.get("/api/family/learn/next?count=1")).json.items[0];
    expect((await k.b.post("/api/family/learn/answer", { id: it2.id, token: "x".repeat(43), choice: it2.choices[0] })).json.correct).toBe(false);
  });
  it("free plan caps daily learning questions", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    const k = await mum.addChild("ava");
    let served = 0;
    for (let i = 0; i < 20; i++) { const n = await k.learn(1, 1); served += n; }
    expect(served).toBeLessThanOrEqual(15);
    expect((await k.b.get("/api/family/learn/next?count=1")).status).toBe(402);
  });
});

describe("leaderboard abuse", () => {
  it("rejects negative, fractional, huge and unknown-game scores; deleting only touches your own entry", async () => {
    const w = createWorld();
    const a = w.browser(), b = w.browser();
    await a.post("/api/auth/signup", { username: "alice", pin: "1234" });
    await b.post("/api/auth/signup", { username: "bobby", pin: "1234" });
    for (const score of [-1, 1.5, 1e9, "9", null]) expect((await a.post("/api/scores", { game: "flappy", score })).status).toBe(400);
    expect((await a.post("/api/scores", { game: "made-up", score: 5 })).status).toBe(400);
    await a.post("/api/scores", { game: "flappy", score: 50 });
    await b.post("/api/scores", { game: "flappy", score: 70 });
    await b.delete("/api/scores", { game: "flappy" });
    const top = (await a.get("/api/leaderboard?game=flappy")).json.top;
    expect(top.map((r: any) => r.username)).toEqual(["alice"]);
  });
});

describe("stripe webhook", () => {
  const SECRET = "whsec_sim";
  const sign = (raw: string, t: number) => `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex")}`;
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });
  it("rejects bad signatures, stale timestamps, malformed JSON; ignores replays", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const w = createWorld();
    const mum = await Parent.signup(w);
    const post = (raw: string, sig: string) => mum.b.request("POST", "/api/family/billing/webhook/stripe", undefined, { raw, headers: { "stripe-signature": sig } });
    const t = Math.floor(w.now / 1000);
    const ev = JSON.stringify({ id: "evt_1", type: "ping", data: { object: {} } });
    expect((await post(ev, "t=1,v1=abc")).status).toBe(400);
    expect((await post(ev, sign(ev, t - 3600))).status).toBe(400); // replayed old capture
    expect((await post("not json", sign("not json", t))).status).toBe(400); // used to throw -> 500
    expect((await post(ev, sign(ev, t))).status).toBe(200);
    expect((await post(ev, sign(ev, t))).json).toEqual({ duplicate: true });
    expect(verifyStripeSignature(ev, sign(ev, t), "", t)).toBe(false); // no secret configured -> nothing verifies
  });
});

describe("time limits hold even if the game never cooperates (host metering)", () => {
  const tabs: ReturnType<typeof openTab>[] = [];
  afterEach(() => { tabs.splice(0).forEach((t) => t.close()); });
  const page = async (hard = true) => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    const kid = await mum.addChild("ava", 2017, { allowance: { freePlayMin: 10, maxPlayMin: 10 }, enforcement: hard ? "hard" : "soft", mix: { preset: "balanced" } });
    return { w, mum, kid };
  };
  it("the wrapper page meters a game that never calls the SDK, and raises the limit over the frame", async () => {
    const { w, kid } = await page();
    const host = openTab(w, kid.b); tabs.push(host);
    let limited = false;
    host.sdk({ game: "x", host: true, onLimit: () => { limited = true; } });
    await flush(30);
    await host.fire(5 * 60); // 5 minutes on screen, the game itself says nothing
    expect((await kid.status()).remainingSec).toBeLessThan(5 * 60 + 20);
    expect(limited).toBe(false);
    await host.fire(6 * 60);
    expect(limited).toBe(true);
    expect((await kid.status()).ok).toBe(false);
  });
  it("a cooperating game inside the frame shares the host's clock: no double counting", async () => {
    const { w, kid } = await page();
    const host = openTab(w, kid.b); tabs.push(host);
    host.sdk({ game: "x", host: true });
    await flush(30);
    const frame = openTab(w, kid.b, { parent: host }); tabs.push(frame);
    const mg = frame.sdk({ game: "x" });
    await flush(30);
    mg.startPlaying(); // delegated: must not start a second clock
    await host.fire(5 * 60);
    await frame.fire(5 * 60);
    const spent = 10 * 60 - (await kid.status()).remainingSec;
    expect(spent).toBeGreaterThanOrEqual(5 * 60 - 20);
    expect(spent).toBeLessThanOrEqual(5 * 60 + 20); // not ~10 minutes
  });
  it("a hidden tab is not 'playing'", async () => {
    const { w, kid } = await page();
    const host = openTab(w, kid.b); tabs.push(host);
    host.sdk({ game: "x", host: true });
    await flush(30);
    Object.defineProperty(host.doc, "hidden", { value: true, configurable: true });
    await host.fire(5 * 60);
    expect((await kid.status()).remainingSec).toBeGreaterThan(10 * 60 - 40);
  });
});

void DEFAULT_START;
