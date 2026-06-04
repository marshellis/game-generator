import { describe, it, expect } from "vitest";
import { makeRng, shuffle } from "../src/core/rng";

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0,1)", () => {
    const r = makeRng(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("differs across seeds", () => {
    expect(makeRng(1)()).not.toEqual(makeRng(2)());
  });
});

describe("shuffle", () => {
  it("is a deterministic permutation for a given rng", () => {
    const arr = [1, 2, 3, 4, 5];
    const out1 = shuffle([...arr], makeRng(7));
    const out2 = shuffle([...arr], makeRng(7));
    expect(out1).toEqual(out2);
    expect([...out1].sort()).toEqual(arr);
  });
});
