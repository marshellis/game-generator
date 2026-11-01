import { describe, it, expect, beforeEach } from "vitest";
import { memoryKV } from "../src/lib/family/kv";
import * as A from "../src/lib/family/accounts";
import "../src/lib/family/register";
import { handle } from "../src/lib/family/router";
import type { Req } from "../src/lib/family/router";
import { selectNext, record, simpleStrategy } from "../src/lib/family/mastery";
import { makeItem, mulberry32, checkAnswer, askable } from "../src/lib/family/questions";
import { SKILLS } from "../src/lib/family/skills";
import * as W from "../src/lib/family/wallet";
import { defaultSettings } from "../src/lib/family/settings";

const users = new Map<string, any>();
const store: any = {
  async getUser(u: string) { return users.get(u) ?? null; }, async createUser(u: string, r: any) { if (users.has(u)) return false; users.set(u, r); return true; },
  async removeScore() {}, async getCompletions() { return {}; }, async deleteUser(u: string) { users.delete(u); },
};
let d: A.FamilyDeps; let parent: A.Tokens; let child: string | undefined;
const call = (method: string, path: string, body: object = {}, over: Partial<Req> = {}) =>
  handle({ method, path: path.split("/"), body: body as never, tokens: parent, childToken: child, query: {}, ...over }, d);

async function setup(over: object = {}) {
  users.clear();
  d = { kv: memoryKV(), store, secret: "sec", now: Date.UTC(2026, 9, 30, 18) };
  const s = await A.signupParent({ email: "m@x.com", password: "correct horse battery", consent: true }, d);
  parent = { parent: s.cookies![0].value, household: s.cookies![1].value };
  await A.addProfile(parent, { nickname: "kida", birthYear: 2017 }, d);
  if (Object.keys(over).length) await A.updateProfile(parent, "kida", { settings: over }, d);
  child = (await A.switchProfile(parent, { username: "kida" }, d)).cookies![0].value;
}
beforeEach(() => setup());

describe("questions", () => {
  it("every askable skill yields a well-formed item with exactly one correct choice", () => {
    for (const s of SKILLS.filter((x) => x.ask)) {
      expect(askable(s.id)).toBe(true);
      for (let g = s.grades[0]; g <= s.grades[1]; g++) for (let seed = 1; seed <= 25; seed++) {
        const it = makeItem(s.id, g, mulberry32(seed), "k");
        expect(it.choices.length).toBe(4);
        expect(new Set(it.choices).size).toBe(4);
        expect(it.choices.filter((c) => checkAnswer("k", it.id, it.token, c)).length).toBe(1);
      }
    }
  });
  it("a wrong secret never validates", () => {
    const it = makeItem("math.add", 2, mulberry32(1), "k");
    expect(it.choices.some((c) => checkAnswer("other", it.id, it.token, c))).toBe(false);
  });
});

describe("mastery + selection", () => {
  it("rises with correct answers and falls with wrong ones; mastery needs repetition", () => {
    let m = {}; for (let i = 0; i < 4; i++) m = record(m, "math.add", true, 1);
    expect(simpleStrategy.isMastered((m as any)["math.add"])).toBe(false);
    m = record(m, "math.add", true, 1); m = record(m, "math.add", true, 1); m = record(m, "math.add", true, 1);
    expect(simpleStrategy.isMastered((m as any)["math.add"])).toBe(true);
    expect(record(m, "math.add", false, 1)["math.add"].p).toBeLessThan((m as any)["math.add"].p);
  });
  it("respects grade band, disabled subjects and prerequisites", () => {
    const rand = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      const s = selectNext({ grade: 1, subjects: { math: true }, mastery: {}, rand })!;
      expect(s.grades[0]).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < 50; i++) expect(selectNext({ grade: 4, subjects: { math: false, logic: true, language: true }, mastery: {}, rand })!.subject).not.toBe("math");
    const picks = new Set(Array.from({ length: 80 }, () => selectNext({ grade: 4, subjects: { math: true, logic: false, language: false }, mastery: {}, rand })!.id));
    expect(picks.has("math.div")).toBe(false); // needs math.mul learned first
    expect(picks.has("math.pct")).toBe(false);
  });
});

describe("wallet", () => {
  const s = defaultSettings();
  it("free time then learn-to-continue, capped by the daily max", () => {
    let day = W.emptyDay();
    expect(W.status(s, day).remainingSec).toBe(20 * 60);
    day = { ...day, spentSec: 20 * 60 };
    expect(W.status(s, day)).toMatchObject({ ok: false, reason: "learn", breakNow: true });
    day = { ...day, earnedSec: W.earnFor(s, 3) }; // 3 correct * 20s * 2 = 120s
    expect(W.status(s, day).remainingSec).toBe(120);
    expect(W.status(s, { ...day, earnedSec: 99999, spentSec: 90 * 60 })).toMatchObject({ ok: false, reason: "limit" });
  });
  it("hard enforcement never offers learning; learning off means no breaks", () => {
    const hard = { ...s, enforcement: "hard" as const };
    expect(W.status(hard, { ...W.emptyDay(), spentSec: 20 * 60 }).reason).toBe("limit");
    const off = { ...s, mix: { ...s.mix, playPerLearn: 0 } };
    expect(W.status(off, W.emptyDay())).toMatchObject({ ok: true, breakNow: false });
  });
  it("tick credits at most what the clock allows", () => {
    let day = W.tick(W.emptyDay(), 999, 1_000_000); expect(day.spentSec).toBe(10);
    day = W.tick(day, 999, 1_010_000); expect(day.spentSec).toBe(10 + 10); // exactly the 10s that elapsed, no slack
    day = W.tick(day, 30, 1_010_000); expect(day.spentSec).toBe(20); // same instant again: nothing
    day = W.tick(day, 5, 1_015_000); expect(day.spentSec).toBe(25);
  });
  it("day rolls over at the household's midnight", () => {
    const t = Date.UTC(2026, 9, 31, 3, 0); // 21:00 Oct 30 in Denver, already Oct 31 UTC
    expect(W.dayKey(t, "America/Denver")).toBe("2026-10-30");
    expect(W.dayKey(t, "UTC")).toBe("2026-10-31");
  });
});

describe("learning API end to end", () => {
  it("serves questions, scores answers once, earns time, updates mastery", async () => {
    const next: any = await call("GET", "learn/next", {}, { query: { count: "3" } });
    expect(next.status).toBe(200);
    const item = next.json.items[0];
    expect(JSON.stringify(next.json)).not.toMatch(/answer/i);
    // find the right choice the way a child would: try them (single use, so only one is accepted)
    let right: string | undefined;
    for (const c of item.choices) if (checkAnswer("sec", item.id, item.token, c)) right = c;
    const res: any = await call("POST", "learn/answer", { id: item.id, token: item.token, choice: right });
    expect(res.json.correct).toBe(true);
    expect(res.json.remainingSec).toBe(20 * 60 + 40);
    expect((await call("POST", "learn/answer", { id: item.id, token: item.token, choice: right })).status).toBe(409);
    const prog: any = await call("GET", "me/progress");
    expect(prog.json.skills).toHaveLength(1);
  });
  it("wrong answers earn nothing", async () => {
    const item = ((await call("GET", "learn/next")) as any).json.items[0];
    const wrong = item.choices.find((c: string) => !checkAnswer("sec", item.id, item.token, c));
    const res: any = await call("POST", "learn/answer", { id: item.id, token: item.token, choice: wrong });
    expect(res.json).toMatchObject({ correct: false, remainingSec: 20 * 60 });
  });
  it("puzzle completions earn time and dedupe per day", async () => {
    const a: any = await call("POST", "learn/report", { game: "sudoku", puzzleId: "p1" });
    expect(a.json.remainingSec).toBe(20 * 60 + 120);
    const b: any = await call("POST", "learn/report", { game: "sudoku", puzzleId: "p1" });
    expect(b.json.duplicate).toBe(true);
    expect((await call("POST", "learn/report", { game: "nope", puzzleId: "p" })).status).toBe(400);
  });
  it("play ticks spend time; reaching zero flips to learn-to-continue", async () => {
    let now = d.now;
    for (let i = 0; i < 41; i++) { d.now = now += 30_000; await call("POST", "play/tick", { seconds: 30 }); }
    const st: any = await call("GET", "play/status");
    expect(st.json).toMatchObject({ ok: false, reason: "learn", breakNow: true });
  });
  it("round breaks fire every N rounds until the daily target is met", async () => {
    let st: any;
    for (let i = 0; i < 3; i++) st = await call("POST", "play/tick", { seconds: 0, round: true });
    expect(st.json.breakNow).toBe(true);
  });
  it("free plan caps questions per day", async () => {
    for (let i = 0; i < 15; i++) {
      const it = ((await call("GET", "learn/next", {}, { query: { count: "1" } })) as any).json.items[0];
      await call("POST", "learn/answer", { id: it.id, token: it.token, choice: it.choices[0] });
    }
    expect((await call("GET", "learn/next")).status).toBe(402);
  });
  it("unauthenticated and legacy (unmanaged) children are handled", async () => {
    // no session at all = a guest: metered on a flat daily allowance, never a managed child's rules
    expect(((await call("GET", "play/status", {}, { childToken: undefined })) as any).json).toMatchObject({ ok: true, guest: true, remainingSec: 15 * 60 });
    users.set("legacy", { pinHash: "x", createdAt: 1 });
    const tok = (await import("../src/lib/profile/session")).signSession("legacy", "sec", Math.floor(d.now / 1000));
    expect(((await call("GET", "play/status", {}, { childToken: tok })) as any).json).toMatchObject({ ok: true, unmanaged: true });
  });
  it("parent reports are a paid feature and household-scoped", async () => {
    expect((await call("GET", "profiles/kida/progress")).status).toBe(402);
  });
  it("preset 'off' means free play with no learning demanded", async () => {
    await setup({ mix: { preset: "off" } });
    expect(((await call("GET", "play/status")) as any).json).toMatchObject({ ok: true, breakNow: false, remainingSec: 90 * 60 });
  });
});
