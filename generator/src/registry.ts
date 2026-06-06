// generator/src/registry.ts
import type { GameModule } from "./games/framework";
import { logicGridModule } from "./games/logic-grid/module";
import { mathPacketModule } from "./games/math-packet/module";
import { mazeModule } from "./games/maze/module";
import { sudokuModule } from "./games/sudoku/module";
import { wordSearchModule } from "./games/word-search/module";

export const REGISTRY: GameModule[] = [logicGridModule, mathPacketModule, mazeModule, sudokuModule, wordSearchModule];

export function getModule(id: string): GameModule {
  const m = REGISTRY.find((x) => x.id === id);
  if (!m) throw new Error(`unknown game module: ${id}`);
  return m;
}
