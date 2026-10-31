// Arcade platform ratchet. Time limits are enforced by the wrapper page for EVERY game, but scores,
// accounts and learning breaks need the SDK (or a game pass for multiplayer). New games must integrate;
// the legacy list below may only shrink, never grow.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../public/arcade");
const LEGACY = [
  "bounce", "cop-chase", "dungeon-crawler", "galaga", "glass-bridge", "hex-collapse", "kingdom-wars", "minecraft-2d",
  "net-rally", "nexus", "ragdoll-siege", "ragdoll-soccer", "reverse-zelda", "snowball-arena", "stickfigure-tower-defense",
];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : /\.(html|js|json)$/.test(e.name) && fs.statSync(path.join(dir, e.name)).size < 400_000 ? [path.join(dir, e.name)] : []);
}
const games = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
const integrates = (slug: string) => files(path.join(ROOT, slug)).some((f) => /_sdk\/marshellis\.js|\/api\/family\/pass/.test(fs.readFileSync(f, "utf8")));

describe("arcade integration ratchet", () => {
  it("every game either integrates with the platform or is on the shrinking legacy list", () => {
    const unintegrated = games.filter((g) => !integrates(g)).sort();
    expect(unintegrated, "new arcade games must load /arcade/_sdk/marshellis.js (see arcade/README.md)").toEqual([...LEGACY].sort());
  });
  it("the legacy list never names a game that has since integrated (remove it) or doesn't exist", () => {
    for (const g of LEGACY) expect(games, `${g} not found`).toContain(g);
    for (const g of LEGACY) expect(integrates(g), `${g} integrates now: delete it from LEGACY`).toBe(false);
  });
  it("no game may open a parent-level API: games never call billing, parent or profile-management routes", () => {
    const forbidden = /\/api\/family\/(parent|billing|profiles|store\/review|household)/;
    const bad = games.filter((g) => files(path.join(ROOT, g)).some((f) => forbidden.test(fs.readFileSync(f, "utf8"))));
    expect(bad).toEqual([]);
  });
});
