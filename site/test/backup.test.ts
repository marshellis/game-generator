import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
// @ts-expect-error plain .mjs module
import { dump, restore, encrypt, decrypt, shouldSkip } from "../src/lib/backup.mjs";

/** A fake with the Upstash method names the backup uses, backed by Maps. */
function fakeRedis() {
  const s = new Map<string, any>(), h = new Map<string, Record<string, any>>(), z = new Map<string, Map<string, number>>(), ttl = new Map<string, number>();
  const all = () => [...s.keys(), ...h.keys(), ...z.keys()];
  return {
    s, h, z, ttl,
    async scan(_c: number, _o: object) { return ["0", all()] as [string, string[]]; },
    async type(k: string) { return s.has(k) ? "string" : h.has(k) ? "hash" : z.has(k) ? "zset" : "none"; },
    async get(k: string) { return s.get(k) ?? null; }, async hgetall(k: string) { return h.get(k) ?? null; },
    async zrange(k: string) { return [...(z.get(k) ?? [])].sort((a, b) => a[1] - b[1]).flatMap(([m, sc]) => [m, sc]); },
    async pttl(k: string) { return ttl.get(k) ?? -1; },
    async exists(k: string) { return all().includes(k) ? 1 : 0; },
    async set(k: string, v: any) { s.set(k, structuredClone(v)); }, async hset(k: string, o: Record<string, any>) { h.set(k, { ...(h.get(k) ?? {}), ...o }); },
    async zadd(k: string, { score, member }: { score: number; member: string }) { if (!z.has(k)) z.set(k, new Map()); z.get(k)!.set(member, score); },
    async pexpire(k: string, ms: number) { ttl.set(k, ms); },
  };
}
const world = () => {
  const r = fakeRedis();
  r.s.set("user:ava", { pinHash: "scrypt$x$y", createdAt: 1, avatar: "🦊" });
  r.s.set("profile:ava", { username: "ava", householdId: "hh1", birthYear: 2016, settings: { mix: { preset: "balanced" } } });
  r.s.set("parent:mum@x.com", "p1"); r.s.set("hh:hh1", { id: "hh1", profiles: ["ava"] });
  r.s.set("data:ava:day:2026-10-30", { spentSec: 5 }); r.ttl.set("data:ava:day:2026-10-30", 86_400_000);
  r.h.set("completions:ava", { "sudoku:abc": { grade: "g1", ts: 9 } });
  r.z.set("leaderboard:flappy", new Map([["ava", 40], ["bob", 70]]));
  // ephemeral noise that must NOT be backed up
  r.s.set("lockout:ava", 3); r.s.set("plock:mum@x.com", 2); r.s.set("stripe-ev:evt_1", 1); r.s.set("data:ava:ans:math.add~ab", 1); r.s.set("health:ping", "1");
  return r;
};
const keypair = () => crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

describe("backup", () => {
  it("dumps durable data of every type and skips ephemeral counters/locks/replay guards", async () => {
    const snap = await dump(world());
    const keys = snap.keys.map((k: any) => k.k);
    expect(keys).toEqual(expect.arrayContaining(["user:ava", "profile:ava", "parent:mum@x.com", "hh:hh1", "completions:ava", "leaderboard:flappy", "data:ava:day:2026-10-30"]));
    for (const noise of ["lockout:ava", "plock:mum@x.com", "stripe-ev:evt_1", "data:ava:ans:math.add~ab", "health:ping"]) expect(keys).not.toContain(noise);
    expect(snap.count).toBe(snap.keys.length);
    expect(shouldSkip("slock:ava")).toBe(true);
  });
  it("encrypt -> decrypt round-trips with the private key and is unreadable without it", async () => {
    const { publicKey, privateKey } = keypair(), other = keypair();
    const blob = encrypt(JSON.stringify(await dump(world())), publicKey);
    expect(blob.toString("latin1")).not.toContain("scrypt$");
    expect(blob.toString("latin1")).not.toContain("birthYear");
    expect(decrypt(blob, privateKey).keys.length).toBeGreaterThan(5);
    expect(() => decrypt(blob, other.privateKey)).toThrow();
    const tampered = Buffer.from(blob); tampered[tampered.length - 5] ^= 1;
    expect(() => decrypt(tampered, privateKey)).toThrow(); // GCM detects tampering
  });
  it("restores a lost database exactly (values, hashes, leaderboard order, TTLs); dry-run changes nothing; existing data is kept unless overwrite", async () => {
    const { publicKey, privateKey } = keypair();
    const original = world();
    const snap = decrypt(encrypt(JSON.stringify(await dump(original)), publicKey), privateKey);

    const empty = fakeRedis();                         // the database came back empty
    const dry = await restore(empty, snap, { apply: false });
    expect(dry.restored).toBeGreaterThan(5); expect(empty.s.size + empty.h.size + empty.z.size).toBe(0);

    await restore(empty, snap, { apply: true });
    expect(empty.s.get("user:ava")).toEqual(original.s.get("user:ava"));
    expect(empty.h.get("completions:ava")).toEqual(original.h.get("completions:ava"));
    expect(await empty.zrange("leaderboard:flappy")).toEqual(["ava", 40, "bob", 70]);
    expect(empty.ttl.get("data:ava:day:2026-10-30")).toBe(86_400_000);
    expect(empty.s.has("lockout:ava")).toBe(false);

    // a second restore into a live database must not clobber newer data
    empty.s.set("user:ava", { pinHash: "NEWER" });
    const again = await restore(empty, snap, { apply: true });
    expect(again.skippedExisting).toBeGreaterThan(0);
    expect(empty.s.get("user:ava")).toEqual({ pinHash: "NEWER" });
    await restore(empty, snap, { apply: true, overwrite: true });
    expect(empty.s.get("user:ava")).toEqual(original.s.get("user:ava"));
  });
});
