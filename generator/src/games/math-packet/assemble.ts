import type { Rng } from "../../core/rng";
import { shuffle } from "../../core/rng";
import type { GradeConfig } from "./grades";
import { eligibleGens } from "./activities";
import type { Activity } from "./types";

/**
 * Choose a varied mix of `g.blocks` distinct activity types and generate one
 * block of each. "findTheSum" is the signature puzzle, so it always leads;
 * the rest are a shuffled spread of whatever else is eligible at this grade.
 */
export function assembleActivities(g: GradeConfig, rng: Rng): Activity[] {
  const gens = eligibleGens(g);
  const hero = gens.find((a) => a.type === "findTheSum")!;
  const rest = shuffle(gens.filter((a) => a.type !== "findTheSum"), rng);
  const chosen = [hero, ...rest].slice(0, Math.min(g.blocks, gens.length));
  return chosen.map((a) => a.generate(g, rng));
}
