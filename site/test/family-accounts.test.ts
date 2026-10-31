import { describe, it, expect, beforeEach } from "vitest";
import { memoryKV } from "../src/lib/family/kv";
import * as A from "../src/lib/family/accounts";
import type { FamilyDeps, Tokens } from "../src/lib/family/accounts";
import type { Store, UserRecord } from "../src/lib/profile/types";
import { verifySession } from "../src/lib/profile/session";
import { hashPin } from "../src/lib/profile/auth";
import { sanitizeSettings, defaultSettings, gradeFor } from "../src/lib/family/settings";

function fakeStore(): Store & { users: Map<string, UserRecord>; removed: string[] } {
  const users = new Map<string, UserRecord>(); const removed: string[] = [];
  return {
    users, removed,
    async getUser(u) { return users.get(u) ?? null; },
    async createUser(u, r) { if (users.has(u)) return false; users.set(u, r); return true; },
    async deleteUser(u) { users.delete(u); },
    async removeScore(g, u) { removed.push(`${g}:${u}`); },
    async getCompletions() { return {}; }, async putCompletion() {}, async bumpLockout() { return 1; }, async getLockout() { return 0; },
    async bumpScore() { return 0; }, async topScores() { return []; }, async userBest() { return 0; },
    async userRank() { return null; }, async playerCount() { return 0; },
  } as never;
}

let d: FamilyDeps;
const tokens = (res: A.FamilyResult): Tokens => ({
  parent: res.cookies?.find((c) => c.name === "mg_parent")?.value,
  household: res.cookies?.find((c) => c.name === "mg_household")?.value,
});
const signup = (over: object = {}) => A.signupParent({ email: "Mom@Example.com", password: "correct horse battery", consent: true, ...over }, d);
beforeEach(() => { d = { kv: memoryKV(), store: fakeStore(), secret: "s3cret", now: Date.UTC(2026, 9, 30) }; });

describe("parent signup/login", () => {
  it("requires consent, a real email and a long password", async () => {
    expect((await signup({ consent: false })).status).toBe(400);
    expect((await signup({ email: "nope" })).status).toBe(400);
    expect((await signup({ password: "short" })).status).toBe(400);
  });
  it("creates a household, sets both cookies, rejects a duplicate email", async () => {
    const r = await signup();
    expect(r.status).toBe(201);
    expect(r.cookies?.map((c) => c.name).sort()).toEqual(["mg_household", "mg_parent"]);
    expect((await signup({ email: "mom@example.com" })).status).toBe(409);
  });
  it("logs in with the right password only, and locks after repeated failures", async () => {
    await signup();
    expect((await A.loginParent({ email: "mom@example.com", password: "wrong wrong wrong" }, d)).status).toBe(401);
    expect((await A.loginParent({ email: "mom@example.com", password: "correct horse battery" }, d)).status).toBe(200);
    for (let i = 0; i < 8; i++) await A.loginParent({ email: "mom@example.com", password: "x".repeat(11) }, d);
    expect((await A.loginParent({ email: "mom@example.com", password: "correct horse battery" }, d)).status).toBe(429);
  });
  it("parent tokens expire after 30 minutes and cannot be used as household tokens", async () => {
    const t = tokens(await signup());
    expect((await A.getHousehold(t, d)).status).toBe(200);
    expect((await A.getHousehold({ parent: t.household }, d)).status).toBe(401);
    expect((await A.getHousehold(t, { ...d, now: d.now + 31 * 60_000 })).status).toBe(401);
  });
});

describe("profiles", () => {
  it("adds a child profile that is also a legacy account (no own PIN login)", async () => {
    const t = tokens(await signup());
    const r = await A.addProfile(t, { nickname: "Kid_One", birthYear: 2017 }, d);
    expect(r.status).toBe(201);
    const legacy = await d.store.getUser("kid_one");
    expect(legacy?.pinHash).toBe("");
  });
  it("rejects bad nicknames and ages and duplicate names", async () => {
    const t = tokens(await signup());
    expect((await A.addProfile(t, { nickname: "a", birthYear: 2017 }, d)).status).toBe(400);
    expect((await A.addProfile(t, { nickname: "okname", birthYear: 1990 }, d)).status).toBe(400);
    expect((await A.addProfile(t, { nickname: "okname", birthYear: 2017 }, d)).status).toBe(201);
    expect((await A.addProfile(t, { nickname: "okname", birthYear: 2017 }, d)).status).toBe(409);
  });
  it("enforces the plan's profile limit", async () => {
    const t = tokens(await signup());
    for (const n of ["kida", "kidb"]) expect((await A.addProfile(t, { nickname: n, birthYear: 2017 }, d)).status).toBe(201);
    expect((await A.addProfile(t, { nickname: "kidc", birthYear: 2017 }, d)).status).toBe(402);
  });
  it("picker works from the device link alone and exposes no birth year or settings", async () => {
    const t = tokens(await signup());
    await A.addProfile(t, { nickname: "kida", birthYear: 2017 }, d);
    const r = await A.listPicker({ household: t.household }, d);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json)).not.toMatch(/birthYear|settings/);
    expect((await A.getHousehold({ household: t.household }, d)).status).toBe(401);
  });
  it("switching sets the standard child session cookie; a profile PIN is required when set", async () => {
    const t = tokens(await signup());
    await A.addProfile(t, { nickname: "kida", birthYear: 2017, pin: "1234" }, d);
    expect((await A.switchProfile(t, { username: "kida" }, d)).status).toBe(401);
    expect((await A.switchProfile(t, { username: "kida", pin: "9999" }, d)).status).toBe(401);
    const ok = await A.switchProfile(t, { username: "kida", pin: "1234" }, d);
    expect(ok.status).toBe(200);
    expect(verifySession(ok.cookies![0].value, "s3cret", Math.floor(d.now / 1000))?.username).toBe("kida");
  });
  it("cannot switch to, edit, export or delete another household's child", async () => {
    const t1 = tokens(await signup());
    await A.addProfile(t1, { nickname: "kida", birthYear: 2017 }, d);
    const t2 = tokens(await signup({ email: "dad@example.com" }));
    expect((await A.switchProfile(t2, { username: "kida" }, d)).status).toBe(403);
    expect((await A.updateProfile(t2, "kida", { settings: {} }, d)).status).toBe(404);
    expect((await A.exportProfile(t2, "kida", d)).status).toBe(404);
    expect((await A.deleteProfile(t2, "kida", [], d)).status).toBe(404);
  });
  it("claims an existing standalone account with its PIN", async () => {
    const t = tokens(await signup());
    await d.store.createUser("oldkid", { pinHash: hashPin("4321"), createdAt: 1 });
    expect((await A.claimLegacy(t, { username: "oldkid", pin: "0000", birthYear: 2016 }, d)).status).toBe(401);
    expect((await A.claimLegacy(t, { username: "oldkid", pin: "4321", birthYear: 2016 }, d)).status).toBe(201);
    expect((await A.claimLegacy(t, { username: "oldkid", pin: "4321", birthYear: 2016 }, d)).status).toBe(409);
  });
  it("deleting a profile removes it, its data and its leaderboard entries", async () => {
    const t = tokens(await signup());
    await A.addProfile(t, { nickname: "kida", birthYear: 2017 }, d);
    await d.kv.set(A.dataKey("kida", "mastery"), { x: 1 });
    const r = await A.deleteProfile(t, "kida", ["flappy"], d);
    expect(r.status).toBe(200);
    expect(await d.kv.get(A.dataKey("kida", "mastery"))).toBeNull();
    expect(await d.store.getUser("kida")).toBeNull();
    expect((d.store as any).removed).toContain("flappy:kida");
    expect(((await A.getHousehold(t, d)).json as any).profiles).toHaveLength(0);
  });
  it("export includes learning data but never the PIN hash", async () => {
    const t = tokens(await signup());
    await A.addProfile(t, { nickname: "kida", birthYear: 2017, pin: "1234" }, d);
    await d.kv.set(A.dataKey("kida", "mastery"), { math: 1 });
    const j = (await A.exportProfile(t, "kida", d)).json as any;
    expect(j.mastery).toEqual({ math: 1 });
    expect(JSON.stringify(j)).not.toMatch(/scrypt/);
  });
});

describe("settings", () => {
  it("clamps hostile input and keeps presets consistent", () => {
    const s = sanitizeSettings({ mix: { preset: "heavy", playPerLearn: 999 }, allowance: { freePlayMin: 9999, maxPlayMin: 1 }, gradeOffset: 50, enforcement: "weird", subjects: { math: false, evil: true } });
    expect(s.mix.playPerLearn).toBe(1);
    expect(s.allowance.freePlayMin).toBe(600);
    expect(s.allowance.maxPlayMin).toBeGreaterThanOrEqual(s.allowance.freePlayMin);
    expect(s.gradeOffset).toBe(2);
    expect(s.enforcement).toBe("soft");
    expect(s.subjects.math).toBe(false);
    expect((s.subjects as any).evil).toBeUndefined();
  });
  it("custom preset keeps the typed ratio", () => {
    expect(sanitizeSettings({ mix: { preset: "custom", playPerLearn: 3.5 } }).mix.playPerLearn).toBe(3.5);
  });
  it("parent can update settings; invalid values never throw", async () => {
    const t = tokens(await signup());
    await A.addProfile(t, { nickname: "kida", birthYear: 2017 }, d);
    const r = await A.updateProfile(t, "kida", { settings: { mix: { preset: "light" } } }, d);
    expect((r.json as any).settings.mix.playPerLearn).toBe(4);
    expect((await A.updateProfile(t, "kida", { settings: "garbage" as never }, d)).status).toBe(200);
  });
  it("maps birth year to grade within g1-g8", () => {
    expect(gradeFor(2020, 0, 2026)).toBe(1);
    expect(gradeFor(2017, 0, 2026)).toBe(4);
    expect(gradeFor(2005, 0, 2026)).toBe(8);
    expect(gradeFor(2017, -2, 2026)).toBe(2);
    expect(defaultSettings().mix.playPerLearn).toBe(2);
  });
});
