// npm run new-game -- <id> "<Title>" <emoji> <skill-id>
// Scaffolds a game module that already satisfies the GameModule contract (and fails conformance until you
// make generate/validate real), registers it, and regenerates games.json. Then follow docs/adding-a-game.md.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [id, title, emoji, skill] = process.argv.slice(2);
if (!id || !title || !emoji || !skill || !/^[a-z][a-z0-9-]+$/.test(id)) {
  console.error('usage: npm run new-game -- <kebab-id> "<Title>" <emoji> <skill-id>   e.g. crossword "Crossword" 📝 language.crossword');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "src/games", id);
if (existsSync(dir)) { console.error(`${dir} already exists`); process.exit(1); }
mkdirSync(dir, { recursive: true });
const camel = id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
const Pascal = camel[0]!.toUpperCase() + camel.slice(1);
const collection = `${id}s`;

writeFileSync(resolve(dir, "types.ts"), `export interface ${Pascal} {
  id: string;
  title: string;
  gameType: "${id}";
  gradeLabel: string;
  difficulty: string;
  difficultyRating: number; // 1-5
  seed: number;
  createdAt: string;
  // TODO: the puzzle itself AND its solution
}
`);
writeFileSync(resolve(dir, "generate.ts"), `import { makeRng } from "../../core/rng";
import type { ${Pascal} } from "./types";

export function generate${Pascal}(o: { difficulty: string; seed: number; date: string }): ${Pascal} {
  const rng = makeRng(o.seed);
  void rng; // TODO: build a puzzle from rng + the grade's knobs (see ../../grades.ts)
  return {
    id: \`\${o.date}-${id}-\${o.difficulty}-\${o.seed}\`, title: "${title}", gameType: "${id}",
    gradeLabel: o.difficulty, difficulty: o.difficulty, difficultyRating: 1, seed: o.seed, createdAt: o.date,
  };
}
`);
writeFileSync(resolve(dir, "validate.ts"), `import type { ${Pascal} } from "./types";

/** Re-verify from the OUTPUT alone: solvable, unique, consistent. Return problems; [] = good. */
export function validate${Pascal}(data: unknown): string[] {
  const p: string[] = [];
  const d = data as ${Pascal};
  if (d.gameType !== "${id}") p.push("wrong gameType");
  // TODO: independent solver / checker. Do NOT reuse the generator's bookkeeping.
  return p;
}
`);
writeFileSync(resolve(dir, "module.ts"), `import { GRADES } from "../../grades";
import { generate${Pascal} } from "./generate";
import { validate${Pascal} } from "./validate";
import type { GameModule } from "../framework";

export const ${camel}Module: GameModule = {
  id: "${id}",
  title: "${title}",
  emoji: "${emoji}",
  skill: "${skill}",
  grades: GRADES,
  contentDir: "../site/src/content/${collection}",
  difficultyFor: (grade) => ({ grade }), // TODO: map the grade to this game's knobs
  generate: ({ difficulty, seed, date }) => {
    const p = generate${Pascal}({ difficulty, seed, date });
    return { id: p.id, data: p };
  },
  validate: validate${Pascal},
};
`);
mkdirSync(resolve(root, "../site/src/content", collection), { recursive: true });
writeFileSync(resolve(root, "../site/src/content", collection, ".gitkeep"), "");

const regPath = resolve(root, "src/registry.ts");
let reg = readFileSync(regPath, "utf8");
reg = reg.replace(/\n\nexport const REGISTRY/, `\nimport { ${camel}Module } from "./games/${id}/module";\n\nexport const REGISTRY`);
reg = reg.replace(/(REGISTRY: GameModule\[\] = \[[^\]]*)\]/, `$1, ${camel}Module]`);
writeFileSync(regPath, reg);
console.log(`Scaffolded ${id}. Next: docs/adding-a-game.md (steps 2-6): implement generate+validate, \`npm run manifest\`, add the skill to site/src/lib/family/skills.ts, the zod collection in site/src/content/config.ts, then the site pages.`);
