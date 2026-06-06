// generator/src/registry.ts
import type { GameModule } from "./games/framework";
import { logicGridModule } from "./games/logic-grid/module";
import { mathPacketModule } from "./games/math-packet/module";
import { mazeModule } from "./games/maze/module";

export const REGISTRY: GameModule[] = [logicGridModule, mathPacketModule, mazeModule];

export function getModule(id: string): GameModule {
  const m = REGISTRY.find((x) => x.id === id);
  if (!m) throw new Error(`unknown game module: ${id}`);
  return m;
}
