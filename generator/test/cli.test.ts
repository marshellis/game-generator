import { describe, it, expect } from "vitest";
import { parseArgs, outputPathFor } from "../src/cli";

describe("cli parseArgs", () => {
  it("parses flags with defaults", () => {
    const a = parseArgs(["--difficulty", "g5", "--seed", "42", "--date", "2026-06-04"]);
    expect(a.difficulty).toBe("g5");
    expect(a.seed).toBe(42);
    expect(a.date).toBe("2026-06-04");
  });

  it("parses category/item overrides", () => {
    const a = parseArgs(["--difficulty", "g1", "--categories", "4", "--items", "5"]);
    expect(a.overrides).toEqual({ categories: 4, items: 5 });
  });

  it("computes the output path inside the site content dir", () => {
    expect(outputPathFor("2026-06-04-pets-42")).toBe("../site/src/content/puzzles/2026-06-04-pets-42.json");
  });
});
