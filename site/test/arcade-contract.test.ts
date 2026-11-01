// Arcade platform ratchet. Time limits are enforced by the wrapper page for EVERY game, but scores,
// accounts and learning breaks need the SDK (or a game pass for multiplayer). New games must integrate;
// the legacy list below may only shrink, never grow.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../public/arcade");
const LEGACY = ["reverse-zelda"]; // Godot export: no JS to integrate until its project calls MGRounds.end() (see the learning-loop test)

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : /\.(html|js|json)$/.test(e.name) && fs.statSync(path.join(dir, e.name)).size < 400_000 ? [path.join(dir, e.name)] : []);
}
function filesAnySize(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesAnySize(path.join(dir, e.name)) : /\.(html|js)$/.test(e.name) ? [path.join(dir, e.name)] : []));
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
  it("every game that calls the platform API directly loads compat.js or the SDK, so it survives the isolated origin", () => {
    const bad = games.filter((g) => {
      const text = files(path.join(ROOT, g)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
      const callsApi = /["'`]\/api\/(me|scores|auth|leaderboard|family)/.test(text);
      return callsApi && !/_sdk\/(compat|marshellis)\.js/.test(text);
    });
    expect(bad, "add <script src=\"/arcade/_sdk/compat.js\"> as the first thing in <head>").toEqual([]);
  });
  it("no single arcade file is huge (a repeated engine/build artifact belongs in shared hosting, not N copies)", () => {
    // reverse-zelda's Godot engine wasm is the one known exception; a second copy of it would trip this.
    const ALLOWED = new Set(["reverse-zelda/index.wasm"]);
    const big: string[] = [];
    const walk = (dir: string) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) return walk(f);
      const rel = path.relative(ROOT, f);
      if (fs.statSync(f).size > 10_000_000 && !ALLOWED.has(rel)) big.push(rel);
    });
    walk(ROOT);
    expect(big, "files over 10 MB: host once and share (see arcade/README.md, 'Big engines')").toEqual([]);
  });
  it("the learning loop is wired in: every game loads the SDK + rounds.js and reports finished rounds (or is a documented exception)", () => {
    // flappy and nexus use the SDK directly (mg.roundEnded). reverse-zelda is a Godot export: its end-of-round lives inside
    // compiled GDScript in another repo, so it can only be time-limited by the wrapper until that project calls MGRounds.end().
    const DIRECT_SDK = new Set(["flappy", "nexus"]), NO_ROUND_HOOK = new Set(["reverse-zelda"]);
    const missing: string[] = [];
    for (const g of games) {
      if (NO_ROUND_HOOK.has(g)) continue;
      // (no size cap here: a built game bundle is large and is exactly where the call lives)
      const text = filesAnySize(path.join(ROOT, g)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
      if (DIRECT_SDK.has(g)) { if (!/roundEnded\(/.test(text)) missing.push(`${g}: no mg.roundEnded() call`); continue; }
      if (!/_sdk\/rounds\.js/.test(text)) missing.push(`${g}: does not load /arcade/_sdk/rounds.js`);
      if (!/MGRounds\s*&&\s*MGRounds\.end\(\)|MGRounds\?\.end\(\)|\.MGRounds\)\s*==\s*null\s*\|\|\s*\w+\.end\(\)/.test(text)) missing.push(`${g}: never calls MGRounds.end()`);
    }
    expect(missing, "see arcade/README.md 'Learning loop'").toEqual([]);
  });
  it("no game may open a parent-level API: games never call billing, parent or profile-management routes", () => {
    const forbidden = /\/api\/family\/(parent|billing|profiles|store\/review|household)/;
    const bad = games.filter((g) => files(path.join(ROOT, g)).some((f) => forbidden.test(fs.readFileSync(f, "utf8"))));
    expect(bad).toEqual([]);
  });
});
