/**
 * Measurable difficulty, per the platform grade-appropriateness framework
 * (docs/grade-appropriateness.md §3 & §5). For math the load levers are
 * number range, number of operands/steps, and operation tier — not "grid size".
 *
 * Every activity reports the same shape the logic grid does: the highest
 * reasoning TIER it requires, the number of sequential STEPS, and a composite
 * SCORE = tier weight + step depth + magnitude (number-range) load. A packet
 * aggregates these, and each grade targets a score BAND so "is this 4th-grade-
 * appropriate?" is a number, not a vibe.
 */
import type { Activity, Packet, Load } from "./types";

/**
 * Inherent reasoning tier of each mechanic, ordered by the P2-analog for math
 * (count/read < single-step add/sub < single-step ×/÷ or relational <
 * multi-representation/fraction < chained multi-step).
 */
export const TIER: Record<Activity["type"], number> = {
  tenFrame: 1,
  numberBond: 2,
  makeTen: 2,
  comparison: 2,
  pattern: 2,
  placeValue: 2,
  coinBubble: 2,
  match: 2,
  rounding: 3,
  missingNumber: 3,
  findTheSum: 3,
  wordProblem: 3,
  breakApart: 3,
  stdAlgorithm: 3,
  makeTrue: 3,
  fraction: 4,
  orderOfOps: 4,
  mysteryNumber: 4,
  shapeSums: 4,
  magicSquare: 4,
  snake: 5,
  sumChain: 5,
};

const digitsOf = (n: number): number => Math.abs(Math.trunc(n)).toString().length;

/** Largest number appearing anywhere in the activity → digit count (range load). */
function magnitudeLoad(act: Activity): number {
  let max = 0;
  const scan = (v: unknown): void => {
    if (typeof v === "number") max = Math.max(max, Math.abs(v));
    else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === "object") Object.values(v).forEach(scan);
  };
  scan(act.items);
  return max === 0 ? 1 : digitsOf(max);
}

/** Sequential cognitive steps the hardest item in the activity requires. */
function stepsFor(act: Activity): number {
  switch (act.type) {
    case "snake":
      return Math.max(...act.items.map((i) => i.ops.length));
    case "orderOfOps":
      return Math.max(...act.items.map((i) => i.ops.length)) + 1;
    case "sumChain":
      return Math.max(...act.items.map((i) => i.subClusters.length + 1));
    case "shapeSums":
      return Math.max(...act.items.map((i) => i.shapes.length));
    case "mysteryNumber":
      return Math.max(...act.items.map((i) => Math.min(i.clues.length, 3)));
    case "magicSquare":
      return 2;
    default:
      return 1;
  }
}

/** A stored, grade-independent 1–5 difficulty rating from the absolute score. */
export function starsFor(score: number): number {
  if (score <= 22) return 1;
  if (score <= 31) return 2;
  if (score <= 40) return 3;
  if (score <= 49) return 4;
  return 5;
}

export function scoreActivity(act: Activity): Load {
  const tier = TIER[act.type];
  const steps = stepsFor(act);
  const score = tier * 2 + steps + magnitudeLoad(act);
  return { maxTier: tier, steps, score, stars: starsFor(score) };
}

/** Aggregate over a packet: max tier, total steps, summed score, 1–5 stars. */
export function scorePacket(activities: Activity[]): Load {
  let maxTier = 0, steps = 0, score = 0;
  for (const act of activities) {
    const l = scoreActivity(act);
    maxTier = Math.max(maxTier, l.maxTier);
    steps += l.steps;
    score += l.score;
  }
  return { maxTier, steps, score, stars: starsFor(score) };
}

/**
 * Per-grade target score band. Bands are non-overlapping and monotonically
 * increasing so a packet's score alone places it in the right grade. Tuned to
 * what the current generators actually produce (see difficulty.test.ts, which
 * asserts each grade's packets land in band).
 */
export const GRADE_BANDS: Record<string, { min: number; max: number }> = {
  g1: { min: 16, max: 28 },
  g2: { min: 18, max: 36 },
  g3: { min: 30, max: 48 },
  g4: { min: 34, max: 52 },
  g5: { min: 36, max: 54 },
  g6: { min: 36, max: 56 },
  g7: { min: 40, max: 58 },
  g8: { min: 42, max: 62 },
};

export function inBand(gradeId: string, load: Load): boolean {
  const b = GRADE_BANDS[gradeId];
  return !!b && load.score >= b.min && load.score <= b.max;
}

/** How far a score sits outside its grade band (0 if inside). */
export function distanceToBand(gradeId: string, load: Load): number {
  const b = GRADE_BANDS[gradeId];
  if (!b) return 0;
  if (load.score < b.min) return b.min - load.score;
  if (load.score > b.max) return load.score - b.max;
  return 0;
}
