// The generator registry (games.json) and the site's learning map must agree, in both directions.
import { describe, it, expect } from "vitest";
import games from "../src/data/games.json";
import { SKILL_BY_ID, SKILL_FOR_GAME } from "../src/lib/family/skills";
import { recordCompletion } from "../src/lib/profile/handlers";
import { createWorld } from "./sim/world";

describe("games.json <-> site", () => {
  it("every generated game names a real skill that points back at it", () => {
    for (const g of games) {
      expect(SKILL_BY_ID.has(g.skill), `${g.id} -> unknown skill ${g.skill}`).toBe(true);
      expect(SKILL_FOR_GAME.get(g.id), `skill ${g.skill} must declare game: "${g.id}"`).toBe(g.skill);
    }
  });
  it("every skill that names a game names a registered one", () => {
    const ids = new Set(games.map((g) => g.id));
    for (const [game] of SKILL_FOR_GAME) expect(ids.has(game), `skills.ts mentions unknown game ${game}`).toBe(true);
  });
  it("every registered game can record a completion (no hardcoded allowlist drift)", async () => {
    const w = createWorld();
    const b = w.browser(); await b.post("/api/auth/signup", { username: "tester", pin: "1234" });
    for (const g of games) expect((await b.post("/api/me/completions", { game: g.id, puzzleId: "x-1", grade: "g1" })).status, g.id).toBe(200);
    expect((await b.post("/api/me/completions", { game: "nope", puzzleId: "x-1" })).status).toBe(400);
    void recordCompletion;
  });
  it("every game's content collection is declared in the site's content config", async () => {
    const cfg = (await import("node:fs")).readFileSync(new URL("../src/content/config.ts", import.meta.url), "utf8");
    for (const g of games) expect(cfg, `collection ${g.collection}`).toMatch(new RegExp(`\\b${g.collection}\\b`));
  });
});
