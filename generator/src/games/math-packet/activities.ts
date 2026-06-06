import type { Rng } from "../../core/rng";
import { shuffle } from "../../core/rng";
import type { GradeConfig } from "./grades";
import { randInt, pick, distinctInts } from "./util";
import type {
  Activity,
  ActivityType,
  FindTheSumItem,
  OrderOfOpsItem,
  SnakeItem,
  BreakApartItem,
  CoinBubbleItem,
  StdAlgoItem,
  MatchItem,
  NestedSumItem,
  SumCluster,
  MakeTrueItem,
  MysteryClue,
  MysteryNumberItem,
  ShapeSumsItem,
  MagicSquareItem,
} from "./types";

export interface ActivityGen {
  type: ActivityType;
  eligible: (g: GradeConfig) => boolean;
  generate: (g: GradeConfig, rng: Rng) => Activity;
}

// ---------------------------------------------------------------------------
// Find the Sum — circle the number that equals two others combined.
// ---------------------------------------------------------------------------

/** Indices that equal some other distinct pair combined under `op`. */
function magicIndices(nums: number[], op: "+" | "×"): number[] {
  const out: number[] = [];
  for (let i = 0; i < nums.length; i++) {
    let hit = false;
    for (let j = 0; j < nums.length && !hit; j++) {
      for (let k = j + 1; k < nums.length; k++) {
        if (j === i || k === i) continue;
        const v = op === "+" ? nums[j]! + nums[k]! : nums[j]! * nums[k]!;
        if (v === nums[i]) { hit = true; break; }
      }
    }
    if (hit) out.push(i);
  }
  return out;
}

function makeFindTheSum(g: GradeConfig, rng: Rng): FindTheSumItem {
  const useProduct = g.grade >= 3 && rng() < 0.4;
  const op: "+" | "×" = useProduct ? "×" : "+";
  const size = g.grade < 3 ? 4 : 5;
  const sumMax = [9, 9, 12, 15, 20, 25, 30, 40, 50][g.grade]!;

  for (let attempt = 0; attempt < 500; attempt++) {
    let a: number, b: number, ans: number;
    if (op === "×") {
      a = randInt(rng, 2, 9);
      b = randInt(rng, 2, 9);
      ans = a * b;
    } else {
      a = randInt(rng, 1, sumMax);
      b = randInt(rng, 1, sumMax);
      ans = a + b;
    }
    const set = new Set<number>([a, b, ans]);
    if (set.size < 3) continue; // a===b or a+b collided
    let guard = 0;
    while (set.size < size && guard++ < 100) {
      set.add(randInt(rng, 1, Math.max(ans - 1, 2)));
    }
    if (set.size < size) continue;
    const numbers = shuffle([...set], rng);
    const magic = magicIndices(numbers, op);
    if (magic.length !== 1) continue;
    return { numbers, answerIndex: magic[0]!, op };
  }
  throw new Error("findTheSum: could not build a unique cluster");
}

const findTheSum: ActivityGen = {
  type: "findTheSum",
  eligible: () => true,
  generate: (g, rng) => {
    const items: FindTheSumItem[] = [];
    for (let i = 0; i < 3; i++) items.push(makeFindTheSum(g, rng));
    return {
      type: "findTheSum",
      title: "Find the Sum",
      instructions:
        "In each group, one number equals two of the others " +
        (g.grade >= 3 ? "added or multiplied" : "added") +
        " together. Circle it.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Make Ten / Make Hundred — known + ___ = target.
// ---------------------------------------------------------------------------

const makeTen: ActivityGen = {
  type: "makeTen",
  eligible: (g) => g.grade <= 3,
  generate: (g, rng) => {
    const target = g.grade >= 3 ? 100 : pick(rng, [10, 20]);
    const items = Array.from({ length: 6 }, () => {
      const known = randInt(rng, 1, target - 1);
      return { known, target, op: "+" as const, answer: target - known };
    });
    return {
      type: "makeTen",
      title: `Make ${target}`,
      instructions: `Fill in the number that makes ${target}.`,
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Number Bonds — total at top, one part known, one part missing.
// ---------------------------------------------------------------------------

const numberBond: ActivityGen = {
  type: "numberBond",
  eligible: (g) => g.grade <= 2,
  generate: (g, rng) => {
    const max = g.grade === 1 ? 10 : 20;
    const items = Array.from({ length: 6 }, () => {
      const total = randInt(rng, 3, max);
      const known = randInt(rng, 1, total - 1);
      return { total, known, answer: total - known };
    });
    return {
      type: "numberBond",
      title: "Number Bonds",
      instructions: "Find the missing part of each bond.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Missing Number — a ○ b = c with one slot blank.
// ---------------------------------------------------------------------------

const missingNumber: ActivityGen = {
  type: "missingNumber",
  eligible: (g) => g.grade >= 2,
  generate: (g, rng) => {
    const items = Array.from({ length: 6 }, () => {
      const op = pick(rng, g.ops);
      let left: number, right: number, result: number;
      if (op === "+") {
        const cap = Math.min(g.maxNumber, g.grade <= 3 ? 100 : 1000);
        left = randInt(rng, 1, cap);
        right = randInt(rng, 1, cap);
        result = left + right;
      } else if (op === "−") {
        const cap = Math.min(g.maxNumber, g.grade <= 3 ? 100 : 1000);
        left = randInt(rng, 2, cap);
        right = randInt(rng, 1, left);
        result = left - right;
      } else if (op === "×") {
        left = randInt(rng, 2, g.grade <= 4 ? 9 : 12);
        right = randInt(rng, 2, g.grade <= 4 ? 9 : 12);
        result = left * right;
      } else {
        right = randInt(rng, 2, 9);
        result = randInt(rng, 2, 9);
        left = right * result; // exact division
      }
      const blank = pick(rng, ["left", "right", "result"] as const);
      const answer = blank === "left" ? left : blank === "right" ? right : result;
      return { left, op, right, result, blank, answer };
    });
    return {
      type: "missingNumber",
      title: "Missing Number",
      instructions: "Find the number that makes each equation true.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Order of Operations — insert + − × to hit the target (unique solution).
// ---------------------------------------------------------------------------

const OPS3 = ["+", "−", "×"] as const;

/** Evaluate operands with ops, × binding before + and −. */
export function evalOps(operands: number[], ops: readonly ("+" | "−" | "×")[]): number {
  const n = [...operands];
  const o = [...ops];
  for (let i = 0; i < o.length; ) {
    if (o[i] === "×") {
      n[i] = n[i]! * n[i + 1]!;
      n.splice(i + 1, 1);
      o.splice(i, 1);
    } else i++;
  }
  let acc = n[0]!;
  for (let i = 0; i < o.length; i++) acc = o[i] === "+" ? acc + n[i + 1]! : acc - n[i + 1]!;
  return acc;
}

/** Count op-assignments to `operands` that evaluate to `target`. */
function countSolutions(operands: number[], target: number): number {
  const slots = operands.length - 1;
  let count = 0;
  for (let mask = 0; mask < 3 ** slots; mask++) {
    const ops: ("+" | "−" | "×")[] = [];
    let m = mask;
    for (let s = 0; s < slots; s++) {
      ops.push(OPS3[m % 3]!);
      m = Math.floor(m / 3);
    }
    if (evalOps(operands, ops) === target) count++;
  }
  return count;
}

function makeOrderOfOps(g: GradeConfig, rng: Rng): OrderOfOpsItem {
  const n = g.grade <= 4 ? 3 : g.grade <= 6 ? 4 : 4 + (rng() < 0.5 ? 1 : 0);
  for (let attempt = 0; attempt < 500; attempt++) {
    const operands = Array.from({ length: n }, () => randInt(rng, 1, 9));
    const ops = Array.from({ length: n - 1 }, () => pick(rng, OPS3));
    const target = evalOps(operands, ops);
    if (target < 0 || target > 200) continue;
    if (countSolutions(operands, target) !== 1) continue;
    return { operands, ops, target };
  }
  throw new Error("orderOfOps: could not build a unique puzzle");
}

const orderOfOps: ActivityGen = {
  type: "orderOfOps",
  eligible: (g) => g.grade >= 3,
  generate: (g, rng) => {
    const items = Array.from({ length: 4 }, () => makeOrderOfOps(g, rng));
    return {
      type: "orderOfOps",
      title: "Hit the Target",
      instructions: "Write + − × in the boxes so each row equals the target. (× before + and −.)",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Place Value — value of the digit in a named place.
// ---------------------------------------------------------------------------

const PLACES = ["ones", "tens", "hundreds", "thousands"] as const;
const MAG = { ones: 1, tens: 10, hundreds: 100, thousands: 1000 } as const;

const placeValue: ActivityGen = {
  type: "placeValue",
  eligible: (g) => g.grade >= 2 && g.grade <= 6,
  generate: (g, rng) => {
    const digits = Math.min(g.grade, 5); // g2→2 … g5→5, g6→5
    const lo = 10 ** (digits - 1);
    const hi = 10 ** digits - 1;
    const items = Array.from({ length: 5 }, () => {
      const number = randInt(rng, lo, hi);
      // PLACES only goes up to "thousands"; never ask about a place we can't name.
      const place = PLACES[randInt(rng, 0, Math.min(digits - 1, PLACES.length - 1))]!;
      const digit = Math.floor(number / MAG[place]) % 10;
      return { number, place, answer: digit * MAG[place] };
    });
    return {
      type: "placeValue",
      title: "Place Value",
      instructions: "Write the value of the underlined place for each number.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Rounding — round to the nearest 10 / 100 / 1000.
// ---------------------------------------------------------------------------

const rounding: ActivityGen = {
  type: "rounding",
  eligible: (g) => g.grade >= 3 && g.grade <= 6,
  generate: (g, rng) => {
    const nearest = (g.grade === 3 ? 10 : g.grade === 4 ? 100 : 1000) as 10 | 100 | 1000;
    const hi = Math.min(g.maxNumber, nearest * 99);
    const items = Array.from({ length: 6 }, () => {
      const number = randInt(rng, nearest, hi);
      return { number, nearest, answer: Math.round(number / nearest) * nearest };
    });
    return {
      type: "rounding",
      title: `Round to the Nearest ${nearest}`,
      instructions: `Round each number to the nearest ${nearest}.`,
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Comparison — < > = between numbers (or small expressions at higher grades).
// ---------------------------------------------------------------------------

const cmp = (a: number, b: number): "<" | ">" | "=" => (a < b ? "<" : a > b ? ">" : "=");

const comparison: ActivityGen = {
  type: "comparison",
  eligible: (g) => g.grade <= 6,
  generate: (g, rng) => {
    const cap = Math.min(g.maxNumber, g.grade <= 2 ? 100 : 1000);
    const items = Array.from({ length: 6 }, () => {
      if (g.grade >= 3 && rng() < 0.5) {
        // expression vs number, so it doubles as a fluency check
        const a = randInt(rng, 1, 12);
        const b = randInt(rng, 1, 12);
        const useMul = g.grade >= 3 && rng() < 0.5;
        const lv = useMul ? a * b : a + b;
        const leftText = `${a} ${useMul ? "×" : "+"} ${b}`;
        // pick a right value near lv so the answer isn't always obvious
        const rv = lv + randInt(rng, -3, 3);
        return { leftText, rightText: `${rv}`, answer: cmp(lv, rv) };
      }
      const l = randInt(rng, 1, cap);
      // bias toward close values
      const r = rng() < 0.25 ? l : l + randInt(rng, -Math.ceil(cap / 10), Math.ceil(cap / 10));
      return { leftText: `${l}`, rightText: `${Math.max(0, r)}`, answer: cmp(l, Math.max(0, r)) };
    });
    return {
      type: "comparison",
      title: "Greater, Less, or Equal",
      instructions: "Write < , > , or = between each pair.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Pattern — fill the missing term in an arithmetic sequence.
// ---------------------------------------------------------------------------

const pattern: ActivityGen = {
  type: "pattern",
  eligible: (g) => g.grade <= 5,
  generate: (g, rng) => {
    const items = Array.from({ length: 4 }, () => {
      const steps = g.grade <= 1 ? [1, 2, 5, 10] : g.grade <= 3 ? [2, 3, 5, 10, 25] : [3, 6, 9, 25, 50, 100];
      const step = pick(rng, steps) * (g.grade >= 2 && rng() < 0.35 ? -1 : 1);
      const len = 5;
      const start = step > 0 ? randInt(rng, 0, 10) : randInt(rng, step * -(len - 1) + 1, step * -(len - 1) + 30);
      const full = Array.from({ length: len }, (_, i) => start + step * i);
      const blank = randInt(rng, 1, len - 1);
      const sequence: (number | null)[] = full.map((v, i) => (i === blank ? null : v));
      return { sequence, answer: full[blank]! };
    });
    return {
      type: "pattern",
      title: "What Comes Next?",
      instructions: "Find the rule and fill in the missing number.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Ten Frame — subitize: how many dots? (two five-frames, 0–10).
// ---------------------------------------------------------------------------

const tenFrame: ActivityGen = {
  type: "tenFrame",
  eligible: (g) => g.grade <= 2,
  generate: (_g, rng) => {
    const items = Array.from({ length: 4 }, () => {
      const dots = randInt(rng, 1, 10);
      return { dots, answer: dots };
    });
    return {
      type: "tenFrame",
      title: "How Many?",
      instructions: "Write how many dots are filled in each ten-frame.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Word Problems — short generated story problems, single numeric answer.
// ---------------------------------------------------------------------------

const NAMES = ["Mara", "Theo", "Ivy", "Sam", "Lena", "Noah", "Ruby", "Eli", "Zoe", "Omar"];
const OBJECTS = ["apples", "stickers", "marbles", "books", "cookies", "pencils", "shells", "coins"];

const wordProblem: ActivityGen = {
  type: "wordProblem",
  eligible: () => true,
  generate: (g, rng) => {
    const items = Array.from({ length: 3 }, () => {
      const A = pick(rng, NAMES);
      let B = pick(rng, NAMES);
      while (B === A) B = pick(rng, NAMES);
      const obj = pick(rng, OBJECTS);
      const op = pick(rng, g.ops);
      const cap = g.grade <= 2 ? 20 : g.grade <= 4 ? 50 : 200;
      if (op === "+") {
        const x = randInt(rng, 1, cap), y = randInt(rng, 1, cap);
        return { text: `${A} has ${x} ${obj}. ${B} gives ${A} ${y} more. How many does ${A} have now?`, answer: x + y, unit: obj };
      }
      if (op === "−") {
        const x = randInt(rng, 5, cap), y = randInt(rng, 1, x);
        return { text: `${A} had ${x} ${obj}. ${A} gave ${y} to ${B}. How many are left?`, answer: x - y, unit: obj };
      }
      if (op === "×") {
        const x = randInt(rng, 2, 9), y = randInt(rng, 2, 9);
        return { text: `${A} has ${x} bags with ${y} ${obj} in each bag. How many ${obj} in all?`, answer: x * y, unit: obj };
      }
      const y = randInt(rng, 2, 9), each = randInt(rng, 2, 9), x = y * each;
      return { text: `${A} shares ${x} ${obj} equally among ${y} friends. How many does each friend get?`, answer: each, unit: obj };
    });
    return {
      type: "wordProblem",
      title: "Story Problems",
      instructions: "Read each problem and write the answer.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Fractions — fill an equivalent fraction, or compare two fractions.
// ---------------------------------------------------------------------------

const fraction: ActivityGen = {
  type: "fraction",
  eligible: (g) => g.grade >= 4,
  generate: (_g, rng) => {
    const items = Array.from({ length: 5 }, () => {
      if (rng() < 0.5) {
        const den = pick(rng, [2, 3, 4, 5, 6]);
        const num = randInt(rng, 1, den - 1);
        const k = randInt(rng, 2, 4);
        return { kind: "equiv" as const, num, den, newDen: den * k, answer: num * k };
      }
      const [aNum, aDen] = [randInt(rng, 1, 5), pick(rng, [2, 3, 4, 5, 6, 8])];
      const [bNum, bDen] = [randInt(rng, 1, 5), pick(rng, [2, 3, 4, 5, 6, 8])];
      return { kind: "compare" as const, aNum, aDen, bNum, bDen, answer: cmp(aNum * bDen, bNum * aDen) };
    });
    return {
      type: "fraction",
      title: "Fraction Workout",
      instructions: "Fill the equal fraction, or write < , > , = between the two fractions.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Number Path — a running-total chain. Start at the first number, apply each
// step in order, write the result. The final number is shown (a checkpoint to
// land on). Numbers stay small/age-appropriate: caps and per-step jumps are
// tight so the whole chain is mental-math friendly. Always integer,
// non-negative, single forward-computed answer.
// ---------------------------------------------------------------------------

const SNAKE_LEN = [0, 3, 4, 4, 5, 5, 6, 6, 7];
// Largest value allowed anywhere on the path (kept small so it's doable in head).
const SNAKE_CAP = [0, 20, 20, 36, 50, 80, 100, 120, 144];
// Largest +/− jump per step.
const SNAKE_ADD = [0, 9, 9, 12, 15, 18, 20, 24, 30];

function makeSnake(g: GradeConfig, rng: Rng): SnakeItem {
  const length = SNAKE_LEN[g.grade]!;
  const cap = SNAKE_CAP[g.grade]!;
  const addMax = SNAKE_ADD[g.grade]!;
  const factorMax = g.grade <= 4 ? 4 : 5;
  for (let attempt = 0; attempt < 300; attempt++) {
    const start = randInt(rng, 1, Math.min(9, cap));
    let value = start;
    const chain: SnakeItem["ops"] = [];
    const values: number[] = [];
    let ok = true;
    for (let i = 0; i < length; i++) {
      let applied = false;
      for (const op of shuffle([...g.ops], rng)) {
        if (op === "+") {
          const room = cap - value;
          if (room < 1) continue;
          const operand = randInt(rng, 1, Math.min(room, addMax));
          value += operand; chain.push({ op, operand }); values.push(value); applied = true; break;
        } else if (op === "−") {
          if (value < 2) continue;
          const operand = randInt(rng, 1, Math.min(value, addMax));
          value -= operand; chain.push({ op, operand }); values.push(value); applied = true; break;
        } else if (op === "×") {
          const maxFactor = Math.floor(cap / Math.max(value, 1));
          if (value < 1 || maxFactor < 2) continue;
          const operand = randInt(rng, 2, Math.min(maxFactor, factorMax));
          value *= operand; chain.push({ op, operand }); values.push(value); applied = true; break;
        } else {
          const divs: number[] = [];
          for (let d = 2; d <= 9; d++) if (value % d === 0) divs.push(d);
          if (!divs.length) continue;
          const operand = pick(rng, divs);
          value /= operand; chain.push({ op, operand }); values.push(value); applied = true; break;
        }
      }
      if (!applied) {
        if (value < cap) { value += 1; chain.push({ op: "+", operand: 1 }); values.push(value); }
        else if (value > 1) { value -= 1; chain.push({ op: "−", operand: 1 }); values.push(value); }
        else { ok = false; break; }
      }
    }
    if (ok && chain.length === length) return { start, ops: chain, values };
  }
  throw new Error("number-path: could not build a valid chain");
}

const snake: ActivityGen = {
  type: "snake",
  eligible: (g) => g.grade >= 2,
  generate: (g, rng) => ({
    type: "snake",
    title: "Number Path",
    instructions: "Start at the first number. Do each step in order and fill the boxes. The last number is given — make sure you land on it!",
    items: [makeSnake(g, rng), makeSnake(g, rng)],
  }),
};

// ---------------------------------------------------------------------------
// Break Apart — write a number in expanded form with one part missing.
// ---------------------------------------------------------------------------

const breakApart: ActivityGen = {
  type: "breakApart",
  eligible: (g) => g.grade >= 2 && g.grade <= 6,
  generate: (g, rng) => {
    const digits = Math.min(g.grade, 5); // g2→2 … g5→5, g6→5
    const lo = 10 ** (digits - 1);
    const hi = 10 ** digits - 1;
    const items: BreakApartItem[] = Array.from({ length: 5 }, () => {
      let number = randInt(rng, lo, hi);
      // build place-value parts; keep only nonzero so there's always a real blank
      let parts = String(number).split("").map((d, i, arr) => Number(d) * 10 ** (arr.length - 1 - i)).filter((p) => p > 0);
      if (parts.length < 2) { number = lo + randInt(rng, 1, 8) * (lo / 10 || 1); parts = String(number).split("").map((d, i, arr) => Number(d) * 10 ** (arr.length - 1 - i)).filter((p) => p > 0); }
      const blankIndex = randInt(rng, 0, parts.length - 1);
      return { number, parts, blankIndex, answer: parts[blankIndex]! };
    });
    return {
      type: "breakApart",
      title: "Break Apart",
      instructions: "Write the missing part of each number.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Coin Bubble — count the coins (values in cents) and write the total.
// ---------------------------------------------------------------------------

const COINS_LOW = [1, 5, 10, 25];
const COINS_HIGH = [1, 5, 10, 25, 50, 100];

const coinBubble: ActivityGen = {
  type: "coinBubble",
  eligible: (g) => g.grade >= 1 && g.grade <= 4,
  generate: (g, rng) => {
    const values = g.grade >= 3 ? COINS_HIGH : COINS_LOW;
    const count = g.grade <= 1 ? 3 : g.grade === 2 ? 4 : 5;
    const items: CoinBubbleItem[] = Array.from({ length: 4 }, () => {
      const coins = Array.from({ length: count }, () => pick(rng, values));
      return { coins, answer: coins.reduce((a, b) => a + b, 0) };
    });
    return {
      type: "coinBubble",
      title: "Count the Money",
      instructions: "Add up the coins and write the total in cents.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Standard Algorithm — vertical column arithmetic (the regrouping load lever).
// ---------------------------------------------------------------------------

const stdAlgorithm: ActivityGen = {
  type: "stdAlgorithm",
  eligible: (g) => g.grade >= 2,
  generate: (g, rng) => {
    const items: StdAlgoItem[] = Array.from({ length: 4 }, () => {
      const cap = [0, 0, 99, 999, 9999, 99999, 999999, 999999, 999999][g.grade]!;
      const pool = g.ops.filter((o) => o === "+" || o === "−" || o === "×");
      const op = pick(rng, pool.length ? pool : (["+"] as const));
      if (op === "×") {
        const a = randInt(rng, 12, g.grade <= 4 ? 99 : 999);
        const b = randInt(rng, 2, g.grade <= 4 ? 9 : 99);
        return { a, op, b, answer: a * b };
      }
      const lo = Math.max(10, Math.floor(cap / 10));
      if (op === "−") {
        const a = randInt(rng, lo, cap);
        const b = randInt(rng, lo, a);
        return { a, op, b, answer: a - b };
      }
      const a = randInt(rng, lo, cap);
      const b = randInt(rng, lo, cap);
      return { a, op, b, answer: a + b };
    });
    return {
      type: "stdAlgorithm",
      title: "Line It Up",
      instructions: "Solve each one. Line up the digits and regroup when you need to.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Match the Value — a quantity shown one way (ten-frame / expanded form); tap
// the matching number. (Representation matching.)
// ---------------------------------------------------------------------------

function threeOptions(rng: Rng, answer: number, lo: number, hi: number): number[] {
  const span = Math.max(2, Math.floor(answer * 0.25));
  const set = new Set<number>([answer]);
  let guard = 0;
  while (set.size < 3 && guard++ < 200) {
    const d = answer + randInt(rng, -span, span);
    if (d >= lo && d <= hi && d !== answer) set.add(d);
  }
  while (set.size < 3) set.add(answer + set.size); // fallback
  return shuffle([...set], rng);
}

const expand = (n: number): number[] =>
  String(n).split("").map((d, i, a) => Number(d) * 10 ** (a.length - 1 - i)).filter((p) => p > 0);

const match: ActivityGen = {
  type: "match",
  eligible: (g) => g.grade <= 6,
  generate: (g, rng) => {
    const items: MatchItem[] = Array.from({ length: 4 }, () => {
      if (g.grade <= 2) {
        const dots = randInt(rng, 1, 10);
        return { prompt: { kind: "tenFrame" as const, dots }, options: threeOptions(rng, dots, 0, 10), answer: dots };
      }
      const digits = Math.min(g.grade, 4);
      const lo = 10 ** (digits - 1), hi = 10 ** digits - 1;
      const number = randInt(rng, lo, hi);
      return { prompt: { kind: "expanded" as const, parts: expand(number) }, options: threeOptions(rng, number, lo, hi), answer: number };
    });
    return {
      type: "match",
      title: "Match the Value",
      instructions: "Tap the number that matches each picture.",
      items,
    };
  },
};

// ---------------------------------------------------------------------------
// Find the Sum Challenge — nested: solve the sub-clusters, then the cluster
// built from their answers. Multi-step (tier 5).
// ---------------------------------------------------------------------------

/** Build a +-cluster of `size` whose unique sum-number equals `target`. */
function makeClusterWithAnswer(rng: Rng, target: number, size: number): SumCluster {
  for (let attempt = 0; attempt < 500; attempt++) {
    const a = randInt(rng, 1, target - 1);
    const b = target - a;
    if (a === b) continue;
    const set = new Set<number>([a, b, target]);
    if (set.size < 3) continue;
    let guard = 0;
    while (set.size < size && guard++ < 100) set.add(randInt(rng, 1, target + 4));
    if (set.size < size) continue;
    const numbers = shuffle([...set], rng);
    const magic = magicIndices(numbers, "+");
    if (magic.length === 1 && numbers[magic[0]!] === target) return { numbers, answerIndex: magic[0]! };
  }
  throw new Error("makeClusterWithAnswer: could not build a unique cluster");
}

function makeNestedSum(rng: Rng): NestedSumItem {
  for (let attempt = 0; attempt < 200; attempt++) {
    const v1 = randInt(rng, 5, 20);
    let v2 = randInt(rng, 5, 20);
    let guard = 0;
    while (v2 === v1 && guard++ < 20) v2 = randInt(rng, 5, 20);
    if (v2 === v1) continue;
    const target = v1 + v2;
    const subClusters = [
      makeClusterWithAnswer(rng, v1, 4),
      makeClusterWithAnswer(rng, v2, 4),
      makeClusterWithAnswer(rng, target, 4),
    ];
    const finalNumbers = shuffle([v1, v2, target], rng);
    const magic = magicIndices(finalNumbers, "+");
    if (magic.length !== 1) continue; // safety: exactly one sum-number
    return { subClusters, final: { numbers: finalNumbers, answerIndex: magic[0]! } };
  }
  throw new Error("makeNestedSum: could not build a nested puzzle");
}

const sumChain: ActivityGen = {
  type: "sumChain",
  eligible: (g) => g.grade >= 4,
  generate: (_g, rng) => ({
    type: "sumChain",
    title: "Find the Sum Challenge",
    instructions: "Circle the sum-number in each small group. Then circle the sum-number in the final group made of your answers.",
    items: [makeNestedSum(rng), makeNestedSum(rng)],
  }),
};

// ---------------------------------------------------------------------------
// Make It True — fill the sign that makes a ○ b = c true (unique among signs).
// ---------------------------------------------------------------------------

type Op = "+" | "−" | "×" | "÷";

/** Apply an operation; returns null when ÷ would not be a whole number. */
function applyOp(a: number, op: Op, b: number): number | null {
  if (op === "+") return a + b;
  if (op === "−") return a - b;
  if (op === "×") return a * b;
  return b !== 0 && a % b === 0 ? a / b : null;
}

function makeMakeTrue(g: GradeConfig, rng: Rng, signs: Op[]): MakeTrueItem {
  const cap = Math.min(g.maxNumber, g.grade <= 2 ? 20 : 100);
  const factorMax = g.grade <= 4 ? 9 : 12;
  for (let attempt = 0; attempt < 800; attempt++) {
    const op = pick(rng, signs);
    let left: number, right: number, result: number;
    if (op === "÷") {
      right = randInt(rng, 2, factorMax);
      result = randInt(rng, 2, factorMax);
      left = right * result;
    } else if (op === "×") {
      left = randInt(rng, 2, factorMax);
      right = randInt(rng, 2, factorMax);
      result = left * right;
    } else if (op === "−") {
      left = randInt(rng, 2, cap);
      right = randInt(rng, 1, left - 1);
      result = left - right;
    } else {
      left = randInt(rng, 1, cap);
      right = randInt(rng, 1, cap);
      result = left + right;
    }
    const winners = signs.filter((s) => applyOp(left, s, right) === result);
    if (winners.length === 1 && winners[0] === op) return { left, right, result, answer: op };
  }
  throw new Error("makeTrue: could not build a single-sign item");
}

const makeTrue: ActivityGen = {
  type: "makeTrue",
  eligible: () => true,
  generate: (g, rng) => {
    const signs = [...g.ops] as Op[];
    return {
      type: "makeTrue",
      title: "Make It True",
      instructions: `Write the sign ( ${signs.join("  ")} ) that makes each equation true.`,
      signs,
      items: Array.from({ length: 6 }, () => makeMakeTrue(g, rng, signs)),
    };
  },
};

// ---------------------------------------------------------------------------
// Mystery Number — deduce the one number in a range that fits every clue.
// ---------------------------------------------------------------------------

const digitSum = (n: number): number => String(Math.abs(n)).split("").reduce((a, d) => a + Number(d), 0);

/** Whether a structured clue is true of n. Shared by the generator and tests. */
export function mysteryHolds(c: MysteryClue, n: number): boolean {
  switch (c.kind) {
    case "between": return n >= c.lo && n <= c.hi;
    case "parity": return (n % 2 === 0) === c.even;
    case "gt": return n > c.n;
    case "lt": return n < c.n;
    case "digitSum": return digitSum(n) === c.s;
    case "tensDigit": return Math.floor(n / 10) % 10 === c.d;
    case "onesDigit": return n % 10 === c.d;
    case "multipleOf": return n % c.m === 0;
  }
}

/** Count (capped at 2) how many numbers in [lo,hi] satisfy every clue. */
function countFits(clues: MysteryClue[], lo: number, hi: number): { count: number; last: number } {
  let count = 0, last = -1;
  for (let n = lo; n <= hi; n++) {
    if (clues.every((c) => mysteryHolds(c, n))) { count++; last = n; if (count > 1) break; }
  }
  return { count, last };
}

function makeMystery(g: GradeConfig, rng: Rng): MysteryNumberItem {
  const lo = 10; // two digits up, so tens/ones-digit clues always make sense
  const hi = g.grade <= 2 ? 50 : g.grade <= 3 ? 99 : g.grade <= 5 ? 200 : 500;
  for (let attempt = 0; attempt < 600; attempt++) {
    const secret = randInt(rng, lo, hi);
    const pool: MysteryClue[] = [
      { kind: "parity", even: secret % 2 === 0 },
      { kind: "gt", n: Math.max(lo - 1, secret - randInt(rng, 6, 20)) },
      { kind: "lt", n: Math.min(hi + 1, secret + randInt(rng, 6, 20)) },
      { kind: "onesDigit", d: secret % 10 },
      { kind: "tensDigit", d: Math.floor(secret / 10) % 10 },
    ];
    if (g.grade >= 3) {
      pool.push({ kind: "digitSum", s: digitSum(secret) });
      for (const m of [3, 4, 5]) if (secret % m === 0) pool.push({ kind: "multipleOf", m });
    }
    const clues: MysteryClue[] = [{ kind: "between", lo, hi }];
    for (const cl of shuffle(pool, rng)) {
      clues.push(cl);
      if (countFits(clues, lo, hi).count === 1) break;
      if (clues.length >= 6) break;
    }
    const { count, last } = countFits(clues, lo, hi);
    if (count === 1 && last === secret) return { clues, answer: secret };
  }
  throw new Error("mysteryNumber: could not isolate a unique number");
}

const mysteryNumber: ActivityGen = {
  type: "mysteryNumber",
  eligible: (g) => g.grade >= 2,
  generate: (g, rng) => ({
    type: "mysteryNumber",
    title: "Mystery Number",
    instructions: "Use all the clues together to find the one number that fits.",
    items: Array.from({ length: g.grade <= 3 ? 2 : 3 }, () => makeMystery(g, rng)),
  }),
};

// ---------------------------------------------------------------------------
// Shape Sums — each shape is a hidden number; chained sums pin every one down.
// ---------------------------------------------------------------------------

const SHAPE_POOL = ["🔺", "🟦", "🟢", "🟧", "⭐", "🔷", "❤️", "🟣"];

function makeShapeSums(g: GradeConfig, rng: Rng): ShapeSumsItem {
  const nShapes = g.grade <= 3 ? 2 : 3;
  const hi = g.grade <= 3 ? 9 : 12;
  const values = Array.from({ length: nShapes }, () => randInt(rng, 1, hi));
  const shapes = shuffle([...SHAPE_POOL], rng).slice(0, nShapes);
  // eq0 doubles shape 0 (solves it); each later eq adds exactly one new unknown.
  const equations: { terms: number[]; sum: number }[] = [
    { terms: [0, 0], sum: values[0]! * 2 },
  ];
  for (let k = 1; k < nShapes; k++) {
    equations.push({ terms: [k - 1, k], sum: values[k - 1]! + values[k]! });
  }
  return { shapes, values, equations };
}

const shapeSums: ActivityGen = {
  type: "shapeSums",
  eligible: (g) => g.grade >= 2,
  generate: (g, rng) => ({
    type: "shapeSums",
    title: "Shape Sums",
    instructions: "Each shape stands for a number. Use the clues to find what every shape is worth.",
    items: Array.from({ length: 2 }, () => makeShapeSums(g, rng)),
  }),
};

// ---------------------------------------------------------------------------
// Number Square — a 3×3 magic square with one blank per row and per column.
// ---------------------------------------------------------------------------

const LO_SHU = [[2, 7, 6], [9, 5, 1], [4, 3, 8]];

/** Rotate a square 90° clockwise. */
function rotate(s: number[][]): number[][] {
  return s[0]!.map((_, c) => s.map((row) => row[c]!).reverse());
}

function makeMagicSquare(g: GradeConfig, rng: Rng): MagicSquareItem {
  let base = LO_SHU.map((r) => [...r]);
  const turns = randInt(rng, 0, 3);
  for (let i = 0; i < turns; i++) base = rotate(base);
  if (rng() < 0.5) base = base.map((r) => [...r].reverse());

  const scale = g.grade <= 3 ? 1 : g.grade <= 4 ? randInt(rng, 1, 3) : randInt(rng, 2, 6);
  const shift = g.grade <= 3 ? randInt(rng, 0, 5) : randInt(rng, 0, 30);
  const full = base.map((r) => r.map((v) => v * scale + shift));
  const magic = 15 * scale + 3 * shift;

  // Blank a permutation of columns (one per row → also one per column): the
  // grid stays uniquely solvable from row sums alone.
  const perm = shuffle([0, 1, 2], rng);
  const grid: (number | null)[][] = full.map((r) => [...r]);
  for (let r = 0; r < 3; r++) grid[r]![perm[r]!] = null;

  const answers: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (grid[r]![c] === null) answers.push(full[r]![c]!);
  return { grid, answers, magic };
}

const magicSquare: ActivityGen = {
  type: "magicSquare",
  eligible: (g) => g.grade >= 3,
  generate: (g, rng) => ({
    type: "magicSquare",
    title: "Number Square",
    instructions: "Fill the empty squares so every row and every column adds up to the number shown.",
    items: Array.from({ length: 2 }, () => makeMagicSquare(g, rng)),
  }),
};

/** All generators, in a stable display order. */
export const ACTIVITY_GENS: ActivityGen[] = [
  findTheSum,
  tenFrame,
  makeTen,
  numberBond,
  missingNumber,
  comparison,
  pattern,
  placeValue,
  rounding,
  breakApart,
  coinBubble,
  stdAlgorithm,
  match,
  makeTrue,
  orderOfOps,
  mysteryNumber,
  shapeSums,
  magicSquare,
  snake,
  sumChain,
  fraction,
  wordProblem,
];

export function eligibleGens(g: GradeConfig): ActivityGen[] {
  return ACTIVITY_GENS.filter((a) => a.eligible(g));
}
