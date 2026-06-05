import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePuzzle } from "./games/logic-grid/generate";
import type { Difficulty } from "./games/logic-grid/difficulty";
import { generatePacket } from "./games/math-packet/generate";

export interface CliArgs {
  game: "logic-grid" | "math-packet";
  difficulty: string;
  seed: number;
  date: string;
  gradeLabel?: string;
  overrides?: Partial<Difficulty>;
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
    difficulty: get("--difficulty") ?? (game === "math-packet" ? "g3" : "g5"),
    seed: Number(get("--seed") ?? "1"),
    date: get("--date") ?? new Date().toISOString().slice(0, 10),
    gradeLabel: get("--grade"),
    overrides: Object.keys(overrides).length ? overrides : undefined,
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

function main(): void {
  // here = generator/src; generatorRoot = generator/; rel = ../site/...
  // resolve(generatorRoot, "../site/...") => <repo>/site/...
  const here = dirname(fileURLToPath(import.meta.url)); // generator/src
  const generatorRoot = resolve(here, ".."); // generator/
  const args = parseArgs(process.argv.slice(2));

  if (args.game === "math-packet") {
    const packet = generatePacket(args);
    const abs = resolve(generatorRoot, packetOutputPathFor(packet.id));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, JSON.stringify(packet, null, 2) + "\n");
    console.log(`Wrote ${abs}`);
    console.log(`Title: ${packet.title} — ${packet.activities.length} activities — difficulty ${packet.difficulty}`);
    return;
  }

  const puzzle = generatePuzzle(args);
  const rel = outputPathFor(puzzle.id); // ../site/src/content/puzzles/<id>.json
  const abs = resolve(generatorRoot, rel); // <repo>/site/src/content/puzzles/<id>.json
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(puzzle, null, 2) + "\n");
  console.log(`Wrote ${abs}`);
  console.log(`Title: ${puzzle.title} — ${puzzle.clues.length} clues — difficulty ${puzzle.difficulty}`);
  console.log("Clues use plain template phrasing. Rewrite the text fields in-session for theme-flavored, funny wording (keep `structured` unchanged).");
}

// Run only when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
