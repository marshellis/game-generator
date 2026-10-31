// generator/src/manifest.ts
// The ONE list of games, derived from the registry and shipped to the site as site/src/data/games.json.
// The site reads it for anything that needs "which games exist" (completion allowlist, skill map checks),
// so adding a game never means remembering to edit a hardcoded list. A test fails if it drifts.
import { writeFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTRY } from "./registry";
import type { GameModule } from "./games/framework";

export interface ManifestEntry { id: string; title: string; emoji: string; skill: string; collection: string; grades: string[] }

export function buildManifest(registry: GameModule[] = REGISTRY): ManifestEntry[] {
  return registry.map((m) => ({ id: m.id, title: m.title, emoji: m.emoji, skill: m.skill, collection: basename(m.contentDir), grades: m.grades }));
}
export const manifestJson = (registry?: GameModule[]) => JSON.stringify(buildManifest(registry), null, 2) + "\n";

export const MANIFEST_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../site/src/data/games.json");

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  writeFileSync(MANIFEST_PATH, manifestJson());
  console.log(`wrote ${MANIFEST_PATH}`);
}
