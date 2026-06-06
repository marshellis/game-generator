// generator/src/catalog.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REGISTRY } from "./registry";
import type { GameModule } from "./games/framework";

/** Stable-but-varying seed for (run, game, grade, index). FNV-1a over the inputs. */
export function deriveSeed(seedBase: number, gameId: string, grade: string, i: number): number {
  let h = (seedBase >>> 0) ^ 0x811c9dc5;
  const s = `${gameId}:${grade}:${i}`;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface CatalogOpts {
  perGrade: number;
  date: string;
  seedBase: number;
  /** Defaults to the full REGISTRY; injectable for tests. */
  registry?: GameModule[];
  /** Base dir that each module's contentDir resolves against (generator/ root in prod). */
  outputRoot: string;
}

export function generateCatalog(opts: CatalogOpts): { written: string[] } {
  const registry = opts.registry ?? REGISTRY;
  const written: string[] = [];
  for (const m of registry) {
    for (const grade of m.grades) {
      for (let i = 0; i < opts.perGrade; i++) {
        const seed = deriveSeed(opts.seedBase, m.id, grade, i);
        const item = m.generate({ difficulty: grade, seed, date: opts.date });
        const abs = resolve(opts.outputRoot, m.contentDir, `${item.id}.json`);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, JSON.stringify(item.data, null, 2) + "\n");
        written.push(abs);
      }
    }
  }
  return { written };
}
