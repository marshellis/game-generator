import { describe, it, expect } from "vitest";
import { parseArgs, mazeOutputPathFor } from "../src/cli";

describe("cli maze", () => {
  it("parses --game maze with a maze default difficulty", () => {
    const a = parseArgs(["--game", "maze", "--seed", "3"]);
    expect(a.game).toBe("maze");
    expect(a.difficulty).toBe("g3");
  });
  it("maze output path", () => {
    expect(mazeOutputPathFor("2026-06-05-mouse-3")).toBe("../site/src/content/mazes/2026-06-05-mouse-3.json");
  });
});
