import { describe, it, expect } from "vitest";
import { slugify, makePuzzleId } from "../src/games/logic-grid/serialize";

describe("serialize helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("The Great Pet Mix-Up!")).toBe("the-great-pet-mix-up");
  });

  it("builds a stable id from date, slug, and seed", () => {
    expect(makePuzzleId("2026-06-04", "pets", 42)).toBe("2026-06-04-pets-42");
  });
});
