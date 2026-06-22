import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateManifest, loadArcadeGames, isNew, gameUrl, playUrl, ARCADE_DIR } from "../src/lib/arcade";

/**
 * Astro builds a page route `/x` to the static file `x/index.html`. So the
 * wrapper play route and the raw game file collide on disk unless their URLs
 * differ by more than a trailing slash. This mirrors that rule.
 */
function astroOutputPath(url: string): string {
  const clean = url.replace(/^\//, "").replace(/\/$/, "");
  return clean.endsWith(".html") ? clean : `${clean}/index.html`;
}

const VALID = {
  title: "Space Blaster",
  description: "Dodge the asteroids.",
  emoji: "🚀",
  author: "Theo",
  createdAt: "2026-06-22",
};

describe("validateManifest", () => {
  it("accepts a valid manifest and attaches the slug", () => {
    const g = validateManifest(VALID, "space-blaster");
    expect(g.slug).toBe("space-blaster");
    expect(g.title).toBe("Space Blaster");
    expect(g.tags).toEqual([]); // optional → defaults to empty
  });

  it("keeps tags when provided", () => {
    const g = validateManifest({ ...VALID, tags: ["shooter", "arcade"] }, "s");
    expect(g.tags).toEqual(["shooter", "arcade"]);
  });

  it.each(["title", "description", "emoji", "author", "createdAt"])(
    "rejects a missing %s",
    (field) => {
      const bad = { ...VALID } as Record<string, unknown>;
      delete bad[field];
      expect(() => validateManifest(bad, "s")).toThrow(field);
    },
  );

  it("rejects an empty required string", () => {
    expect(() => validateManifest({ ...VALID, title: "   " }, "s")).toThrow("title");
  });

  it("rejects a non-ISO createdAt", () => {
    expect(() => validateManifest({ ...VALID, createdAt: "June 6" }, "s")).toThrow("createdAt");
  });

  it("rejects an impossible date", () => {
    expect(() => validateManifest({ ...VALID, createdAt: "2026-13-40" }, "s")).toThrow("createdAt");
  });

  it("rejects non-string tags", () => {
    expect(() => validateManifest({ ...VALID, tags: ["ok", 3] }, "s")).toThrow("tags");
  });

  it("rejects a non-object manifest", () => {
    expect(() => validateManifest("nope", "s")).toThrow("object");
  });
});

describe("loadArcadeGames", () => {
  let tmp: string | undefined;
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  function game(dir: string, slug: string, manifest: object, withIndex = true) {
    const folder = path.join(dir, slug);
    fs.mkdirSync(folder, { recursive: true });
    if (withIndex) fs.writeFileSync(path.join(folder, "index.html"), "<!doctype html>");
    fs.writeFileSync(path.join(folder, "game.json"), JSON.stringify(manifest));
  }

  it("returns games newest-first and skips _-prefixed folders", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-"));
    game(tmp, "older", { ...VALID, title: "Older", createdAt: "2026-01-01" });
    game(tmp, "newer", { ...VALID, title: "Newer", createdAt: "2026-06-01" });
    game(tmp, "_template", { ...VALID, title: "Template" });

    const games = loadArcadeGames(tmp);
    expect(games.map((g) => g.slug)).toEqual(["newer", "older"]);
  });

  it("returns [] when the dir does not exist", () => {
    expect(loadArcadeGames(path.join(os.tmpdir(), "does-not-exist-arcade"))).toEqual([]);
  });

  it("throws (slug-prefixed) on a folder missing index.html", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-"));
    game(tmp, "broken", VALID, /* withIndex */ false);
    expect(() => loadArcadeGames(tmp)).toThrow("arcade/broken");
  });

  it("throws (slug-prefixed) on an invalid manifest", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-"));
    game(tmp, "broken", { ...VALID, emoji: "" });
    expect(() => loadArcadeGames(tmp)).toThrow("arcade/broken");
  });

  it("throws on malformed JSON", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-"));
    const folder = path.join(tmp, "broken");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "index.html"), "<!doctype html>");
    fs.writeFileSync(path.join(folder, "game.json"), "{ not json");
    expect(() => loadArcadeGames(tmp)).toThrow("arcade/broken");
  });
});

describe("play/game URL collision (regression: recursive iframe bug)", () => {
  it("the wrapper route never overwrites the raw game file on build", () => {
    for (const slug of ["minecraft-2d", "a", "space-blaster"]) {
      const game = astroOutputPath(gameUrl(slug)); // arcade/<slug>/index.html
      const play = astroOutputPath(playUrl(slug)); // arcade/<slug>/play/index.html
      expect(play).not.toBe(game);
      // The game file must not be a build target of the wrapper route.
      expect(play.startsWith(`arcade/${slug}/`)).toBe(true);
      expect(game).toBe(`arcade/${slug}/index.html`);
    }
  });

  it("the wrapper iframes the raw game, not itself", () => {
    // src === gameUrl, and gameUrl !== the wrapper's own URL → no recursion.
    const slug = "minecraft-2d";
    expect(gameUrl(slug)).toBe("/arcade/minecraft-2d/index.html");
    expect(playUrl(slug)).toBe("/arcade/minecraft-2d/play");
    expect(astroOutputPath(playUrl(slug))).not.toBe(astroOutputPath(gameUrl(slug)));
  });
});

describe("isNew", () => {
  it("is true within the window and false outside it", () => {
    const now = new Date("2026-06-22T00:00:00Z");
    expect(isNew("2026-06-20", now)).toBe(true);
    expect(isNew("2026-05-01", now)).toBe(false);
  });
  it("is false for future dates", () => {
    expect(isNew("2026-07-01", new Date("2026-06-22T00:00:00Z"))).toBe(false);
  });
});

describe("shipped arcade games", () => {
  it("every real game folder loads and validates", () => {
    // Points at site/public/arcade — the _template and any shipped games must
    // all satisfy the contract, or this fails CI before deploy.
    expect(() => loadArcadeGames(ARCADE_DIR)).not.toThrow();
  });

  it("the _template is itself a valid game (the worked example)", () => {
    const manifestPath = path.join(ARCADE_DIR, "_template", "game.json");
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(() => validateManifest(raw, "_template")).not.toThrow();
    expect(fs.existsSync(path.join(ARCADE_DIR, "_template", "index.html"))).toBe(true);
  });
});
