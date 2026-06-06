import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Difficulty } from "./games/logic-grid/difficulty";
import { generateCatalog } from "./catalog";
import { getModule } from "./registry";

export interface CliArgs {
  game: "logic-grid" | "math-packet" | "maze";
  difficulty: string;
  seed: number;
  date: string;
  gradeLabel?: string;
  overrides?: Partial<Difficulty>;
  all: boolean;
  perGrade: number;
  seedBase?: number;
}

export function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const overrides: Partial<Difficulty> = {};
  const cats = get("--categories");
  const items = get("--items");
  if (cats) overrides.categories = Number(cats);
  if (items) overrides.items = Number(items);

  const game = (get("--game") ?? "logic-grid") as CliArgs["game"];
  return {
    game,
    difficulty: get("--difficulty") ?? (game === "math-packet" ? "g3" : game === "maze" ? "g3" : "g5"),
    seed: Number(get("--seed") ?? "1"),
    date: get("--date") ?? new Date().toISOString().slice(0, 10),
    gradeLabel: get("--grade"),
    overrides: Object.keys(overrides).length ? overrides : undefined,
    all: argv.includes("--all"),
    perGrade: Number(get("--per-grade") ?? "1"),
    seedBase: get("--seed-base") !== undefined ? Number(get("--seed-base")) : undefined,
  };
}

/** Path (relative to generator/) of the JSON file for a given puzzle id. */
export function outputPathFor(id: string): string {
  return `../site/src/content/puzzles/${id}.json`;
}

/** Path (relative to generator/) of the JSON file for a given packet id. */
export function packetOutputPathFor(id: string): string {
  return `../site/src/content/packets/${id}.json`;
}

/** Path (relative to generator/) of the JSON file for a given maze id. */
export function mazeOutputPathFor(id: string): string {
  return `../site/src/content/mazes/${id}.json`;
}

function main(): void {
  // here = generator/src; generatorRoot = generator/; rel = ../site/...
  // resolve(generatorRoot, "../site/...") => <repo>/site/...
  const here = dirname(fileURLToPath(import.meta.url)); // generator/src
  const generatorRoot = resolve(here, ".."); // generator/
  const args = parseArgs(process.argv.slice(2));

  if (args.all) {
    const seedBase = args.seedBase ?? Date.now();
    const { written } = generateCatalog({
      perGrade: args.perGrade,
      date: args.date,
      seedBase,
      outputRoot: generatorRoot,
    });
    console.log(`Catalog: wrote ${written.length} items across ${args.perGrade} per grade (seedBase ${seedBase}).`);
    return;
  }

  // Single-game generation, routed through the registry so a new game needs no CLI edit
  // (just a module.ts + registry entry). Game-specific override flags are not applied here.
  const mod = getModule(args.game);
  const item = mod.generate({ difficulty: args.difficulty, seed: args.seed, date: args.date });
  const abs = resolve(generatorRoot, mod.contentDir, `${item.id}.json`);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(item.data, null, 2) + "\n");
  console.log(`Wrote ${abs}`);
  console.log(`Game: ${mod.title} — id ${item.id} — difficulty ${args.difficulty}`);
}

// Run only when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
