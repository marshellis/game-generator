import { describe, it, expect } from "vitest";
import { slugify, makeMazeId } from "../src/games/maze/serialize";

describe("maze serialize", () => {
  it("slugifies", () => expect(slugify("The Mouse and the Cheese!")).toBe("the-mouse-and-the-cheese"));
  it("builds an id", () => expect(makeMazeId("2026-06-05", "mouse", 3)).toBe("2026-06-05-mouse-3"));
});
