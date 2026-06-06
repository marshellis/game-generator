// generator/src/games/kenken/generate.ts
import { makeRng, shuffle, type Rng } from "../../core/rng";
import { resolveDifficulty } from "./difficulty";
import { countSolutions } from "./solver";
import type { Cage, Cell, KenKen, Op } from "./types";

function buildLatin(size: number, rng: Rng): number[][] {
  const grid: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const bt = (pos: number): boolean => {
    if (pos === size * size) return true;
    const r = Math.floor(pos / size), c = pos % size;
    const opts = shuffle(Array.from({ length: size }, (_, i) => i + 1), rng).filter((v) => {
      for (let k = 0; k < size; k++) { if (grid[r]![k] === v || grid[k]![c] === v) return false; }
      return true;
    });
    for (const v of opts) { grid[r]![c] = v; if (bt(pos + 1)) return true; grid[r]![c] = 0; }
    return false;
  };
  bt(0);
  return grid;
}

const NB = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

function partition(size: number, maxCageSize: number, rng: Rng): Cell[][] {
  const cageOf: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  const cages: Cell[][] = [];
  const all: Cell[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) all.push({ r, c });
  for (const start of shuffle(all.slice(), rng)) {
    if (cageOf[start.r]![start.c] !== -1) continue;
    const want = 1 + Math.floor(rng() * maxCageSize);
    const cage: Cell[] = [start];
    cageOf[start.r]![start.c] = cages.length;
    while (cage.length < want) {
      const front: Cell[] = [];
      for (const { r, c } of cage) for (const [dr, dc] of NB) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && cageOf[nr]![nc] === -1) front.push({ r: nr, c: nc });
      }
      if (front.length === 0) break;
      const pick = front[Math.floor(rng() * front.length)]!;
      if (cageOf[pick.r]![pick.c] !== -1) continue;
      cageOf[pick.r]![pick.c] = cages.length;
      cage.push(pick);
    }
    cages.push(cage);
  }
  return cages;
}

function assignCage(cells: Cell[], solution: number[][], ops: Op[], rng: Rng): { op: Op; target: number } {
  const vals = cells.map(({ r, c }) => solution[r]![c]!);
  if (cells.length === 1) return { op: "=", target: vals[0]! };
  const pick = (cs: Op[]): Op => cs[Math.floor(rng() * cs.length)]!;
  if (cells.length === 2) {
    const hi = Math.max(vals[0]!, vals[1]!), lo = Math.min(vals[0]!, vals[1]!);
    const choices: Op[] = [];
    if (ops.includes("+")) choices.push("+");
    if (ops.includes("*")) choices.push("*");
    if (ops.includes("-")) choices.push("-");
    if (ops.includes("/") && lo !== 0 && hi % lo === 0) choices.push("/");
    const op = pick(choices);
    if (op === "+") return { op, target: vals[0]! + vals[1]! };
    if (op === "*") return { op, target: vals[0]! * vals[1]! };
    if (op === "-") return { op, target: hi - lo };
    return { op, target: hi / lo };
  }
  // size >= 3: + or *
  const choices: Op[] = [];
  if (ops.includes("+")) choices.push("+");
  if (ops.includes("*")) choices.push("*");
  const op = choices.length ? pick(choices) : "+";
  return op === "*"
    ? { op, target: vals.reduce((a, b) => a * b, 1) }
    : { op: "+", target: vals.reduce((a, b) => a + b, 0) };
}

const OP_TIER: Record<Op, number> = { "=": 0, "+": 1, "-": 2, "*": 3, "/": 4 };

export interface GenerateKenKenOptions { difficulty: string; seed: number; date: string; }

export function generateKenKen(opts: GenerateKenKenOptions): KenKen {
  const d = resolveDifficulty(opts.difficulty);
  const size = d.size;
  const rng = makeRng(opts.seed);
  const solution = buildLatin(size, rng);

  let cages: Cage[] | null = null;
  for (let attempt = 0; attempt < 200 && !cages; attempt++) {
    const parts = partition(size, d.maxCageSize, rng);
    const candidate = parts.map((cells) => {
      const { op, target } = assignCage(cells, solution, d.ops, rng);
      return { cells, op, target };
    });
    if (countSolutions(size, candidate, 2) === 1) cages = candidate;
  }
  if (!cages) {
    // fallback: all single-cell givens (always unique)
    cages = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cages.push({ cells: [{ r, c }], op: "=", target: solution[r]![c]! });
  }

  const maxTier = Math.max(...cages.map((cg) => OP_TIER[cg.op]));
  const avgCage = cages.reduce((a, cg) => a + cg.cells.length, 0) / cages.length;
  const difficultyRating = Math.min(5, Math.max(1, Math.round((size - 2) + maxTier / 2 + avgCage / 3)));

  return {
    id: `${opts.date}-kenken-${d.id}-${opts.seed}`,
    title: "KenKen",
    gameType: "kenken",
    gradeLabel: d.readingLevel,
    difficulty: d.id,
    size, cages, solution,
    difficultyRating,
    seed: opts.seed,
    createdAt: `${opts.date}T00:00:00.000Z`,
  };
}
