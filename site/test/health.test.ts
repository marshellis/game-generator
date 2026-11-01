import { describe, it, expect } from "vitest";
import { healthCheck } from "../src/lib/health";
import { memoryKV, type KV } from "../src/lib/family/kv";

const good = { SESSION_SECRET: "s".repeat(40), GAME_PASS_SECRET: "p".repeat(40) };
describe("health", () => {
  it("is ok with working storage and sound secrets", async () => {
    const h = await healthCheck(memoryKV(), good);
    expect(h.ok).toBe(true);
    expect(h.checks).toMatchObject({ storage: "ok", sessionSecret: "ok", passSecret: "ok" });
  });
  it("fails when storage is gone (the lost-Redis case) or throws", async () => {
    const dead: KV = { ...memoryKV(), get: async () => null };
    expect((await healthCheck(dead, good)).checks.storage).toBe("failed");
    const boom: KV = { ...memoryKV(), set: async () => { throw new Error("redis down"); } };
    expect((await healthCheck(boom, good)).ok).toBe(false);
  });
  it("flags weak/missing/shared secrets without ever returning a value", async () => {
    expect((await healthCheck(memoryKV(), { SESSION_SECRET: "short", GAME_PASS_SECRET: "p".repeat(40) })).checks.sessionSecret).toBe("weak");
    const none = await healthCheck(memoryKV(), {});
    expect(none.ok).toBe(false);
    expect(none.checks.passSecret).toBe("missing");
    const same = await healthCheck(memoryKV(), { SESSION_SECRET: "x".repeat(40), GAME_PASS_SECRET: "x".repeat(40) });
    expect(same.checks.passSecret).toBe("same-as-session");
    expect(JSON.stringify(same)).not.toContain("xxxx");
  });
});
