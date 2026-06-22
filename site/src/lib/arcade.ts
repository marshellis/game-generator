/**
 * Arcade — static-game discovery.
 *
 * Each arcade game is a self-contained folder under `public/arcade/<slug>/`
 * holding an `index.html`, its assets, and a `game.json` manifest. This module
 * reads those manifests at build time so the Arcade index and play routes
 * generate themselves — a contributor's AI ships a game by dropping in one
 * folder and opening a PR; no shared code is edited.
 *
 * Discovery logic lives here only; `arcade/index.astro` and `arcade/[slug].astro`
 * both consume `loadArcadeGames()`.
 */
import fs from "node:fs";
import path from "node:path";

export interface ArcadeGame {
  /** Folder name under public/arcade — also the URL slug (/arcade/<slug>). */
  slug: string;
  title: string;
  description: string;
  /** Single emoji shown on the card. */
  emoji: string;
  author: string;
  /** YYYY-MM-DD — drives the "NEW" badge; arcade games are not daily. */
  createdAt: string;
  tags: string[];
}

/** Default location of game folders, relative to the site/ working dir. */
export const ARCADE_DIR = path.resolve(process.cwd(), "public/arcade");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const REQUIRED_STRINGS = ["title", "description", "emoji", "author", "createdAt"] as const;

/**
 * Validate one parsed manifest and return a typed game. Throws a descriptive
 * Error on any problem — callers prefix the slug so CI failures point at the
 * offending folder.
 */
export function validateManifest(raw: unknown, slug: string): ArcadeGame {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("game.json must be a JSON object");
  }
  const m = raw as Record<string, unknown>;

  for (const key of REQUIRED_STRINGS) {
    const v = m[key];
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`"${key}" is required and must be a non-empty string`);
    }
  }

  const createdAt = m.createdAt as string;
  if (!ISO_DATE.test(createdAt) || Number.isNaN(Date.parse(createdAt))) {
    throw new Error(`"createdAt" must be a valid YYYY-MM-DD date (got "${createdAt}")`);
  }

  let tags: string[] = [];
  if (m.tags !== undefined) {
    if (!Array.isArray(m.tags) || m.tags.some((t) => typeof t !== "string")) {
      throw new Error(`"tags" must be an array of strings`);
    }
    tags = m.tags as string[];
  }

  return {
    slug,
    title: m.title as string,
    description: m.description as string,
    emoji: m.emoji as string,
    author: m.author as string,
    createdAt,
    tags,
  };
}

/** True for folders that hold a real game (skip `_template`, dotfiles). */
function isGameFolder(name: string): boolean {
  return !name.startsWith("_") && !name.startsWith(".");
}

/**
 * Read, validate, and return every arcade game in `dir`, newest first.
 * Each folder must contain `index.html` and a valid `game.json`. Throws with
 * the slug prefixed on the first invalid game so a bad PR fails CI loudly.
 */
export function loadArcadeGames(dir: string = ARCADE_DIR): ArcadeGame[] {
  if (!fs.existsSync(dir)) return [];

  const games: ArcadeGame[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isGameFolder(entry.name)) continue;
    const slug = entry.name;
    const folder = path.join(dir, slug);

    if (!fs.existsSync(path.join(folder, "index.html"))) {
      throw new Error(`arcade/${slug}: missing index.html`);
    }

    const manifestPath = path.join(folder, "game.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`arcade/${slug}: missing game.json`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (err) {
      throw new Error(`arcade/${slug}: game.json is not valid JSON — ${(err as Error).message}`);
    }

    try {
      games.push(validateManifest(parsed, slug));
    } catch (err) {
      throw new Error(`arcade/${slug}: ${(err as Error).message}`);
    }
  }

  // Slugs are folder names, so collisions are impossible on disk; sort newest first.
  return games.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Days since createdAt; used by the index to show a "NEW" badge. */
export function isNew(createdAt: string, now: Date, withinDays = 14): boolean {
  const age = (now.getTime() - Date.parse(createdAt)) / 86_400_000;
  return age >= 0 && age <= withinDays;
}

/**
 * URL of the raw, self-contained game file (served from public/). This is what
 * the wrapper iframes and the "fullscreen" link targets.
 */
export function gameUrl(slug: string): string {
  return `/arcade/${slug}/index.html`;
}

/**
 * URL of the wrapper play page (site chrome + iframed game). It MUST live one
 * segment deeper than the game folder: Astro builds a page route `/x` to the
 * file `x/index.html`, so a wrapper at `/arcade/<slug>` would overwrite the
 * static game at `arcade/<slug>/index.html`. The trailing `/play` segment keeps
 * the wrapper's output (`arcade/<slug>/play/index.html`) clear of the game.
 */
export function playUrl(slug: string): string {
  return `/arcade/${slug}/play`;
}
