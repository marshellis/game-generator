import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/cli";

describe("cli --all", () => {
  it("parses catalog flags", () => {
    const a = parseArgs(["--all", "--per-grade", "2", "--seed-base", "42", "--date", "2026-06-06"]);
    expect(a.all).toBe(true);
    expect(a.perGrade).toBe(2);
    expect(a.seedBase).toBe(42);
    expect(a.date).toBe("2026-06-06");
  });
  it("defaults perGrade to 1 and all to false", () => {
    const a = parseArgs(["--game", "maze"]);
    expect(a.all).toBe(false);
    expect(a.perGrade).toBe(1);
  });
});
