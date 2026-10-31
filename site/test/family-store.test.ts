import { describe, it, expect, beforeEach } from "vitest";
import { memoryKV } from "../src/lib/family/kv";
import * as A from "../src/lib/family/accounts";
import "../src/lib/family/register";
import { handle, type Req } from "../src/lib/family/router";
import { validateSubmission } from "../src/lib/family/store";
import { verifyPass, signPass } from "../src/lib/family/pass";
import { entKey } from "../src/lib/family/plans";
import { signSession } from "../src/lib/profile/session";

const users = new Map<string, any>();
const store: any = { async getUser(u: string) { return users.get(u) ?? null; }, async createUser(u: string, r: any) { if (users.has(u)) return false; users.set(u, r); return true; } };
let d: A.FamilyDeps, pub: A.Tokens, hidPub: string, admin: A.Tokens, child: string;
const call = (method: string, path: string, body: object = {}, tokens: A.Tokens = pub, over: Partial<Req> = {}) =>
  handle({ method, path: path.split("/"), body: body as never, tokens, childToken: child, query: {}, ...over }, d);
const good = { slug: "cool-game", title: "Cool Game", description: "A very cool game for kids.", url: "https://games.example.com/cool", minAge: 7, categories: ["arcade"] };

beforeEach(async () => {
  users.clear(); process.env.GAME_PASS_SECRET = "passsec";
  process.env.STORE_PUBLISHER_EMAILS = "pub@x.com"; process.env.STORE_ADMIN_EMAILS = "admin@x.com"; delete process.env.STORE_INVITE_ONLY;
  d = { kv: memoryKV(), store, secret: "sec", now: Date.UTC(2026, 9, 30, 18) };
  const s = await A.signupParent({ email: "pub@x.com", password: "correct horse battery", consent: true }, d);
  pub = { parent: s.cookies![0].value, household: s.cookies![1].value }; hidPub = (s.json as any).household.id;
  const a = await A.signupParent({ email: "admin@x.com", password: "correct horse battery", consent: true }, d);
  admin = { parent: a.cookies![0].value, household: a.cookies![1].value };
  await d.kv.set(entKey(hidPub), { plan: "family", status: "active", source: "manual", updatedAt: 0 });
  await A.addProfile(pub, { nickname: "kida", birthYear: 2017 }, d);
  child = signSession("kida", "sec", Math.floor(d.now / 1000));
});

describe("store", () => {
  it("validates submissions", () => {
    expect(validateSubmission(good).ok).toBe(true);
    for (const bad of [{ slug: "A" }, { url: "http://x.com" }, { url: "https://localhost/x" }, { minAge: 4 }, { categories: ["nope"] }, { title: "x" }, { description: "short" }])
      expect(validateSubmission({ ...good, ...bad }).ok).toBe(false);
  });
  it("needs an invited publisher on a plan with publishing", async () => {
    expect((await call("POST", "store/submit", good, admin)).status).toBe(403); // not invited
    process.env.STORE_PUBLISHER_EMAILS = "pub@x.com,admin@x.com";
    expect((await call("POST", "store/submit", good, admin)).status).toBe(402); // free plan
    expect((await call("POST", "store/submit", good)).status).toBe(201);
  });
  it("nothing is listed until approved; rejection needs a reason; publisher email never leaks", async () => {
    const id = ((await call("POST", "store/submit", good)) as any).json.id;
    expect(((await call("GET", "store/games")) as any).json.games).toHaveLength(0);
    expect((await call("GET", "store/queue", {}, pub)).status).toBe(403);
    expect(((await call("GET", "store/queue", {}, admin)) as any).json.submissions).toHaveLength(1);
    expect((await call("POST", "store/review", { id, decision: "rejected" }, admin)).status).toBe(400);
    expect((await call("POST", "store/review", { id, decision: "approved" }, pub)).status).toBe(403);
    expect((await call("POST", "store/review", { id, decision: "approved" }, admin)).status).toBe(200);
    const listed = ((await call("GET", "store/games")) as any).json.games;
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toMatch(/pub@x\.com|publisher/);
  });
  it("slug cannot be taken by someone else", async () => {
    await call("POST", "store/submit", good);
    await d.kv.set(entKey("other"), { plan: "family", status: "active", source: "manual", updatedAt: 0 });
    process.env.STORE_PUBLISHER_EMAILS += ",admin@x.com";
    const hidAdmin = (await d.kv.get<any>(`parentid:${(await d.kv.get<string>("parent:admin@x.com"))}`)).householdId;
    await d.kv.set(entKey(hidAdmin), { plan: "family", status: "active", source: "manual", updatedAt: 0 });
    expect((await call("POST", "store/submit", good, admin)).status).toBe(409);
  });
});

describe("game pass", () => {
  it("issues a verifiable pass with the real nickname and short expiry", async () => {
    const r: any = await call("POST", "pass", { room: "galaga" });
    expect(r.status).toBe(200);
    const c = verifyPass(r.json.pass, "passsec", Math.floor(d.now / 1000))!;
    expect(c).toMatchObject({ u: "kida", room: "galaga" });
    expect(c.exp - Math.floor(d.now / 1000)).toBeLessThanOrEqual(15 * 60);
  });
  it("rejects tampering, wrong secret, expiry", async () => {
    const t = ((await call("POST", "pass", { room: "galaga" })) as any).json.pass;
    const now = Math.floor(d.now / 1000);
    expect(verifyPass(t, "other", now)).toBeNull();
    expect(verifyPass(t.replace(/^./, "x"), "passsec", now)).toBeNull();
    expect(verifyPass(t, "passsec", now + 3600)).toBeNull();
    expect(verifyPass(signPass({ u: "x", a: "", c: "", room: "r", exp: now + 5, lb: true }, "passsec"), "passsec", now)).not.toBeNull();
  });
  it("is refused when the parent's play time is used up, and requires a signed-in child", async () => {
    await A.updateProfile(pub, "kida", { settings: { allowance: { freePlayMin: 0, maxPlayMin: 0 }, enforcement: "hard" } }, d);
    const r: any = await call("POST", "pass", { room: "galaga" });
    expect(r).toMatchObject({ status: 403, json: { error: "no-time" } });
    expect((await call("POST", "pass", { room: "galaga" }, pub, { childToken: undefined })).status).toBe(401);
    expect((await call("POST", "pass", { room: "../x" })).status).toBe(400);
  });
  it("is unavailable until GAME_PASS_SECRET is set (never falls back to the session secret)", async () => {
    delete process.env.GAME_PASS_SECRET;
    expect((await call("POST", "pass", { room: "galaga" })).status).toBe(503);
  });
});
