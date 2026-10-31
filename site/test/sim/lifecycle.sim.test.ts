// Story: a family joins, a kid plays under limits, learns to earn time, a parent reviews and deletes.
import { describe, it, expect } from "vitest";
import { createWorld } from "./world";
import { Parent, PASSWORD } from "./actors";

describe("family lifecycle (simulated)", () => {
  it("signup -> child -> play -> learn -> earn -> limit -> report -> export -> delete", async () => {
    const w = createWorld();
    const mum = await Parent.signup(w);
    const ava = await mum.addChild("ava", 2017, { allowance: { freePlayMin: 5, maxPlayMin: 30 }, mix: { preset: "balanced", questionsPerBreak: 3 }, enforcement: "soft" });

    // 5 free minutes, then the clock says "learn".
    expect((await ava.status()).remainingSec).toBe(300);
    await ava.play(300);
    let st = await ava.status();
    expect(st.ok).toBe(false);
    expect(st.reason).toBe("learn");

    // Three right answers at 2:1 balanced = 3 * 20s * 2 = 120s of play.
    expect(await ava.learn(3, 1)).toBe(3);
    st = await ava.status();
    expect(st.ok).toBe(true);
    expect(st.remainingSec).toBe(120);

    // Wrong answers earn nothing.
    await ava.play(120);
    expect(await ava.learn(3, 0)).toBe(0);
    expect((await ava.status()).ok).toBe(false);

    // The parent sees the progress report only on a plan that includes it (free plan -> 402).
    expect((await mum.b.get("/api/family/profiles/ava/progress")).status).toBe(402);

    // Export contains the learning data and never any secret hash.
    const exp = await mum.b.get("/api/family/profiles/ava/export");
    expect(exp.ok).toBe(true);
    expect(JSON.stringify(exp.json)).not.toMatch(/pwHash|scrypt\$/);

    // Deleting needs the parent's password (see adversarial suite), then really deletes.
    expect((await mum.b.delete("/api/family/profiles/ava", { password: PASSWORD })).status).toBe(200);
    expect(await w.store.getUser("ava")).toBeNull();
    expect((await ava.status()).ok).toBe(true); // unmanaged/deleted: no managed limits left
  });

  it("the family day rolls over at the household's midnight, not UTC", async () => {
    const w = createWorld({ start: Date.UTC(2026, 9, 31, 5, 30) }); // 23:30 in Denver on Oct 30
    const mum = await Parent.signup(w);
    const kid = await mum.addChild("leo", 2016, { allowance: { freePlayMin: 10, maxPlayMin: 30 } });
    await kid.play(300);
    expect((await kid.status()).remainingSec).toBe(300);
    w.advance(60 * 60 * 1000); // 00:30 Denver, new family day
    expect((await kid.status()).remainingSec).toBe(600);
  });
});
