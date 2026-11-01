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
    expect((await attacker.get("/api/family/play/status")).status).toBe(401); // and no guest cookie either
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

describe("concurrency: parallel requests must not lose updates", () => {
  it("20 simultaneous correct answers and 10 simultaneous puzzle reports all count (no lost write)", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    await mum.upgrade(); // lift the free-plan daily question cap
    const k = await mum.addChild("ava", 2017, { allowance: { freePlayMin: 0, maxPlayMin: 600 }, mix: { preset: "balanced" } });
    const items = (await Promise.all(Array.from({ length: 4 }, () => k.b.get("/api/family/learn/next?count=5")))).flatMap((r) => r.json.items);
    const { checkAnswer } = await import("../../src/lib/family/questions");
    const right = items.slice(0, 20).map((it: any) => ({ it, choice: it.choices.find((c: string) => checkAnswer(w.secret, it.id, it.token, c)) }));
    await Promise.all([
      ...right.map(({ it, choice }: any) => k.b.post("/api/family/learn/answer", { id: it.id, token: it.token, choice })),
      ...Array.from({ length: 10 }, (_, i) => k.reportPuzzle("sudoku", `par-${i}`)),
    ]);
    const st = await k.status();
    // 20 right answers * 20s * 2  +  10 puzzles * 3 * 20s * 2, minus nothing lost
    expect(st.remainingSec).toBe(20 * 20 * 2 + PUZZLE_DAILY_CAP * 3 * 20 * 2);
    expect(st.learnedToday).toBe(20 + PUZZLE_DAILY_CAP * 3);
  });
  it("parallel ticks never credit more than the clock allows", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    const k = await mum.addChild("ava", 2017, { allowance: { freePlayMin: 10, maxPlayMin: 10 } });
    await k.b.post("/api/family/play/tick", { seconds: 0 });
    w.advance(30_000);
    await Promise.all(Array.from({ length: 25 }, () => k.b.post("/api/family/play/tick", { seconds: 30 })));
    expect((await k.status()).remainingSec).toBe(600 - 30); // 30s elapsed, spent once
  });
});

describe("multiplayer game pass honours the parent's limits", () => {
  afterEach(() => { delete process.env.GAME_PASS_SECRET; });
  it("a child with no time left cannot get a pass (online play can't dodge the limit); one with time can, scoped to their name and room", async () => {
    process.env.GAME_PASS_SECRET = "pass-secret-for-the-sim-0123456789";
    const w = createWorld();
    const mum = await Parent.signup(w);
    const broke = await mum.addChild("broke", 2017, { allowance: { freePlayMin: 0, maxPlayMin: 0 }, enforcement: "hard" });
    const fine = await mum.addChild("fine", 2017, { allowance: { freePlayMin: 30, maxPlayMin: 60 } });
    const no = await broke.b.post("/api/family/pass", { room: "lobby-1" });
    expect(no.status).toBe(403);
    expect(no.json.error).toBe("no-time");
    const yes = await fine.b.post("/api/family/pass", { room: "lobby-1" });
    expect(yes.status).toBe(200);
    const claims = JSON.parse(Buffer.from(yes.json.pass.split(".")[0], "base64url").toString());
    expect(claims).toMatchObject({ u: "fine", room: "lobby-1" });
    expect(claims.exp - Math.floor(w.now / 1000)).toBeLessThanOrEqual(15 * 60); // short-lived
    // a malformed room or an unsigned-in caller gets nothing
    expect((await fine.b.post("/api/family/pass", { room: "../etc" })).status).toBe(400);
    expect((await w.browser().post("/api/family/pass", { room: "lobby-1" })).status).toBe(401);
  });
});

describe("guests (no account) get a limited daily allowance", () => {
  afterEach(() => { delete process.env.GUEST_PLAY_MIN; });

  it("a first visit is a guest with the default 15 minutes, and the browser keeps one identity", async () => {
    const w = createWorld(), b = w.browser();
    const first = await b.get("/api/family/play/status");
    expect(first.json).toMatchObject({ ok: true, guest: true, remainingSec: 15 * 60 });
    expect(b.cookie("mg_guest")).toBeTruthy();
    const id1 = b.cookie("mg_guest");
    await b.get("/api/family/play/status");
    expect(b.cookie("mg_guest")).toBe(id1); // not re-minted
  });
  it("guest play time is spent, runs out, and then the guest is stopped with no way to earn more", async () => {
    process.env.GUEST_PLAY_MIN = "2";
    const w = createWorld(), b = w.browser();
    await b.post("/api/family/play/tick", { seconds: 0 });
    for (let i = 0; i < 4; i++) { w.advance(30_000); await b.post("/api/family/play/tick", { seconds: 30 }); }
    const st = (await b.get("/api/family/play/status")).json;
    expect(st).toMatchObject({ ok: false, reason: "limit", guest: true, remainingSec: 0 });
    // brain breaks are for managed children: a guest cannot learn their way to more time
    expect((await b.get("/api/family/learn/next?count=3")).status).toBe(401);
    expect((await b.post("/api/family/learn/report", { game: "sudoku", puzzleId: "x1" })).status).toBe(401);
    // tomorrow is a new allowance
    w.advance(24 * 3600 * 1000);
    expect((await b.get("/api/family/play/status")).json).toMatchObject({ ok: true, remainingSec: 2 * 60 });
  });
  it("tick claims can't burn or skip a guest's time: bounded by the clock like everyone's", async () => {
    process.env.GUEST_PLAY_MIN = "10";
    const w = createWorld(), b = w.browser();
    await b.post("/api/family/play/tick", { seconds: 0 });
    expect((await b.post("/api/family/play/tick", { seconds: 1e9 })).json.remainingSec).toBe(600);
    let last: any; for (let i = 0; i < 50; i++) last = await b.post("/api/family/play/tick", { seconds: 30 });
    expect(last.json.remainingSec).toBe(600); // no wall-clock time passed
    w.advance(30_000);
    await Promise.all(Array.from({ length: 20 }, () => b.post("/api/family/play/tick", { seconds: 30 })));
    expect((await b.get("/api/family/play/status")).json.remainingSec).toBe(570); // 30s elapsed, spent exactly once
  });
  it("a forged or tampered guest cookie is just a new guest; it can't borrow a child's identity or time", async () => {
    const w = createWorld(), mum = await Parent.signup(w), kid = await mum.addChild("ava", 2017, { allowance: { freePlayMin: 1, maxPlayMin: 1 } });
    const evil = w.browser();
    evil.setCookie("mg_guest", "guest~ava~1~aaaa");
    const r = await evil.get("/api/family/play/status");
    expect(r.json).toMatchObject({ guest: true, remainingSec: 15 * 60 }); // got a fresh guest, not ava's minute
    expect(evil.cookie("mg_guest")).not.toBe("guest~ava~1~aaaa");
    void kid;
  });
  it("a signed-in standalone account is not a guest (unlimited, as before); a managed child follows their parent's rules, not the guest cap", async () => {
    const w = createWorld(), legacy = w.browser();
    await legacy.post("/api/auth/signup", { username: "olduser", pin: "1234" });
    expect((await legacy.get("/api/family/play/status")).json).toMatchObject({ ok: true, unmanaged: true });
    const mum = await Parent.signup(w), kid = await mum.addChild("ava", 2017, { allowance: { freePlayMin: 40, maxPlayMin: 60 } });
    expect((await kid.status()).remainingSec).toBe(40 * 60);
  });
  it("GUEST_PLAY_MIN=off removes the guest cap, an unusable value falls back to the default, no secret = no guest cookie", async () => {
    process.env.GUEST_PLAY_MIN = "off";
    const w = createWorld(), b = w.browser();
    expect((await b.get("/api/family/play/status")).json.limitSec).toBeNull();
    expect((await b.get("/api/family/play/status")).json.ok).toBe(true);
    process.env.GUEST_PLAY_MIN = "banana";
    expect((await w.browser().get("/api/family/play/status")).json.remainingSec).toBe(15 * 60);
    const noSecret = createWorld({ secret: "" }), nb = noSecret.browser();
    expect((await nb.get("/api/family/play/status")).status).toBe(401);
    expect(nb.cookie("mg_guest")).toBeUndefined();
  });
});

describe("guests in the real SDK: the wrapper page meters them and offers a profile when time is up", () => {
  const tabs: ReturnType<typeof openTab>[] = [];
  afterEach(() => { tabs.splice(0).forEach((t) => t.close()); delete process.env.GUEST_PLAY_MIN; });
  it("a guest tab is metered with no cooperation from the game; at the limit onLimit fires and the gate says 'make a profile'", async () => {
    process.env.GUEST_PLAY_MIN = "2";
    const w = createWorld(), b = w.browser();
    const host = openTab(w, b); tabs.push(host);
    let limited = false;
    const mg = host.sdk({ game: "x", host: true, onLimit: () => { limited = true; } });
    await flush(30);
    expect(await mg.gate()).toBe(true);            // time left: straight in, no wall
    await host.fire(90);
    expect(limited).toBe(false);
    await host.fire(60);                           // past 2 minutes of guest play
    expect(limited).toBe(true);
    const g = mg.gate();
    await flush(40);
    const ov = host.doc.querySelector(".mg-ov")!;
    expect(ov.textContent).toMatch(/guest play time/i);
    expect(ov.querySelector("a.mg-go")!.getAttribute("href")).toBe("/profile");
    host.doc.querySelector<HTMLButtonElement>("button.mg-go")!.click(); // "Not now"
    expect(await g).toBe(false);
  });
  it("two game tabs and the host share one guest allowance (a cooperating game does not double the clock)", async () => {
    process.env.GUEST_PLAY_MIN = "10";
    const w = createWorld(), b = w.browser();
    const host = openTab(w, b); tabs.push(host);
    host.sdk({ game: "x", host: true });
    await flush(30);
    const frame = openTab(w, b, { parent: host }); tabs.push(frame);
    const mg = frame.sdk({ game: "x" });
    await flush(30);
    mg.startPlaying();
    await host.fire(4 * 60);
    const left = (await b.get("/api/family/play/status")).json.remainingSec;
    expect(left).toBeGreaterThan(10 * 60 - 4 * 60 - 25);
    expect(left).toBeLessThan(10 * 60 - 4 * 60 + 25);
  });
});
