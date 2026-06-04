import { shuffle, type Rng } from "../../core/rng";
import type { Solution } from "./types";

export function generateSolution(C: number, M: number, rng: Rng): Solution {
  const sol: Solution = [];
  const identity = Array.from({ length: M }, (_, i) => i);
  sol.push([...identity]); // anchor
  for (let c = 1; c < C; c++) {
    sol.push(shuffle([...identity], rng));
  }
  return sol;
}
