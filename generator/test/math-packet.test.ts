import { describe, it, expect } from "vitest";
import { generatePacket } from "../src/games/math-packet/generate";
import { resolveGrade, GRADES } from "../src/games/math-packet/grades";
import { eligibleGens, evalOps, mysteryHolds } from "../src/games/math-packet/activities";
import { assembleActivities } from "../src/games/math-packet/assemble";
import { inBand } from "../src/games/math-packet/difficulty";
import { makeRng } from "../src/core/rng";
import type { Activity } from "../src/games/math-packet/types";

const MAG = { ones: 1, tens: 10, hundreds: 100, thousands: 1000 } as const;
const OPS3 = ["+", "−", "×"] as const;

/** Independently re-derive the count of op-assignments that hit the target. */
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

function evalSide(text: string): number {
  const t = text.trim().split(/\s+/);
  if (t.length === 1) return Number(t[0]);
  const [a, op, b] = [Number(t[0]), t[1], Number(t[2])];
  if (op === "+") return a + b;
  if (op === "×") return a * b;
  throw new Error(`unparsable side: ${text}`);
}

/** Assert every item in an activity has a correct, well-formed answer. */
function checkActivity(act: Activity): void {
  expect(act.items.length).toBeGreaterThan(0);
  switch (act.type) {
    case "findTheSum":
      for (const it of act.items) {
        const { numbers, answerIndex, op } = it;
        // exactly one number equals a distinct pair combined, and it's the marked one
        const magic: number[] = [];
        for (let i = 0; i < numbers.length; i++) {
          let hit = false;
          for (let j = 0; j < numbers.length && !hit; j++)
            for (let k = j + 1; k < numbers.length; k++) {
              if (j === i || k === i) continue;
              const v = op === "+" ? numbers[j]! + numbers[k]! : numbers[j]! * numbers[k]!;
              if (v === numbers[i]) { hit = true; break; }
            }
          if (hit) magic.push(i);
        }
        expect(magic).toEqual([answerIndex]);
      }
      break;
    case "makeTen":
      for (const it of act.items) expect(it.known + it.answer).toBe(it.target);
      break;
    case "numberBond":
      for (const it of act.items) expect(it.known + it.answer).toBe(it.total);
      break;
    case "missingNumber":
      for (const it of act.items) {
        const left = it.blank === "left" ? it.answer : it.left;
        const right = it.blank === "right" ? it.answer : it.right;
        const result = it.blank === "result" ? it.answer : it.result;
        const got = it.op === "+" ? left + right : it.op === "−" ? left - right : it.op === "×" ? left * right : left / right;
        expect(got).toBe(result);
      }
      break;
    case "orderOfOps":
      for (const it of act.items) {
        expect(it.ops.length).toBe(it.operands.length - 1);
        expect(evalOps(it.operands, it.ops)).toBe(it.target);
        expect(countSolutions(it.operands, it.target)).toBe(1);
      }
      break;
    case "placeValue":
      for (const it of act.items) {
        expect(MAG[it.place]).toBeDefined(); // guard: place must be a nameable place
        expect(Number.isFinite(it.answer)).toBe(true); // guard: no NaN (Object.is(NaN,NaN) hides it)
        const digit = Math.floor(it.number / MAG[it.place]) % 10;
        expect(digit * MAG[it.place]).toBe(it.answer);
      }
      break;
    case "rounding":
      for (const it of act.items) expect(Math.round(it.number / it.nearest) * it.nearest).toBe(it.answer);
      break;
    case "comparison":
      for (const it of act.items) {
        const l = evalSide(it.leftText), r = evalSide(it.rightText);
        expect(it.answer).toBe(l < r ? "<" : l > r ? ">" : "=");
      }
      break;
    case "pattern":
      for (const it of act.items) {
        const nullCount = it.sequence.filter((x) => x === null).length;
        expect(nullCount).toBe(1);
        const full = it.sequence.map((x) => (x === null ? it.answer : x)) as number[];
        const step = full[1]! - full[0]!;
        for (let i = 1; i < full.length; i++) expect(full[i]! - full[i - 1]!).toBe(step);
      }
      break;
    case "tenFrame":
      for (const it of act.items) {
        expect(it.answer).toBe(it.dots);
        expect(it.dots).toBeGreaterThanOrEqual(0);
        expect(it.dots).toBeLessThanOrEqual(10);
      }
      break;
    case "wordProblem":
      for (const it of act.items) {
        expect(Number.isInteger(it.answer)).toBe(true);
        expect(it.answer).toBeGreaterThanOrEqual(0);
        expect(it.text.length).toBeGreaterThan(10);
      }
      break;
    case "fraction":
      for (const it of act.items) {
        if (it.kind === "equiv") {
          expect(it.newDen % it.den).toBe(0);
          expect((it.num * it.newDen) / it.den).toBe(it.answer);
        } else {
          const l = it.aNum * it.bDen, r = it.bNum * it.aDen;
          expect(it.answer).toBe(l < r ? "<" : l > r ? ">" : "=");
        }
      }
      break;
    case "breakApart":
      for (const it of act.items) {
        expect(it.parts.reduce((a, b) => a + b, 0)).toBe(it.number); // parts sum to the number
        expect(it.parts.length).toBeGreaterThanOrEqual(2);
        expect(it.parts[it.blankIndex]).toBe(it.answer);
      }
      break;
    case "coinBubble":
      for (const it of act.items) {
        expect(it.coins.reduce((a, b) => a + b, 0)).toBe(it.answer);
        expect(it.coins.every((c) => [1, 5, 10, 25, 50, 100].includes(c))).toBe(true);
      }
      break;
    case "stdAlgorithm":
      for (const it of act.items) {
        const got = it.op === "+" ? it.a + it.b : it.op === "−" ? it.a - it.b : it.a * it.b;
        expect(got).toBe(it.answer);
        expect(it.answer).toBeGreaterThanOrEqual(0); // subtraction never negative
      }
      break;
    case "match":
      for (const it of act.items) {
        expect(it.options).toContain(it.answer); // the correct value is selectable
        expect(new Set(it.options).size).toBe(it.options.length); // distinct options
        if (it.prompt.kind === "tenFrame") expect(it.prompt.dots).toBe(it.answer);
        else expect(it.prompt.parts.reduce((a, b) => a + b, 0)).toBe(it.answer);
      }
      break;
    case "sumChain":
      for (const it of act.items) {
        // sub-cluster answers populate the final cluster
        const subAnswers = it.subClusters.map((c) => c.numbers[c.answerIndex]!);
        expect([...it.final.numbers].sort((a, b) => a - b)).toEqual([...subAnswers].sort((a, b) => a - b));
        // each sub-cluster is itself a valid single-magic find-the-sum
        for (const c of it.subClusters) {
          const m = c.numbers.filter((n, i) =>
            c.numbers.some((x, j) => c.numbers.some((y, k) => j < k && j !== i && k !== i && x + y === n)),
          );
          expect(m).toEqual([c.numbers[c.answerIndex]]);
        }
        // the final circled number = sum of the other two
        const others = it.final.numbers.filter((_, i) => i !== it.final.answerIndex);
        expect(others.reduce((a, b) => a + b, 0)).toBe(it.final.numbers[it.final.answerIndex]);
      }
      break;
    case "snake":
      for (const it of act.items) {
        expect(it.values.length).toBe(it.ops.length);
        let v = it.start;
        it.ops.forEach((step, k) => {
          v = step.op === "+" ? v + step.operand
            : step.op === "−" ? v - step.operand
            : step.op === "×" ? v * step.operand
            : v / step.operand;
          expect(Number.isInteger(v)).toBe(true); // chain stays integer
          expect(v).toBeGreaterThanOrEqual(0); // never goes negative
          expect(it.values[k]).toBe(v); // stored answer matches the running total
        });
      }
      break;
    case "makeTrue": {
      const apply = (a: number, op: string, b: number): number | null =>
        op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : b !== 0 && a % b === 0 ? a / b : null;
      for (const it of act.items) {
        // the stored sign is one of the offered signs and actually works
        expect(act.signs).toContain(it.answer);
        expect(apply(it.left, it.answer, it.right)).toBe(it.result);
        // and it is the ONLY offered sign that hits the result (single answer)
        const winners = act.signs.filter((op) => apply(it.left, op, it.right) === it.result);
        expect(winners).toEqual([it.answer]);
      }
      break;
    }
    case "mysteryNumber":
      for (const it of act.items) {
        const between = it.clues.find((c) => c.kind === "between");
        expect(between).toBeDefined();
        const { lo, hi } = between as { lo: number; hi: number };
        const sols: number[] = [];
        for (let n = lo; n <= hi; n++) if (it.clues.every((c) => mysteryHolds(c, n))) sols.push(n);
        expect(sols).toEqual([it.answer]); // exactly one number fits every clue
        expect(it.clues.length).toBeGreaterThanOrEqual(2);
      }
      break;
    case "shapeSums":
      for (const it of act.items) {
        expect(it.values.length).toBe(it.shapes.length);
        expect(it.values.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
        // every shape participates in at least one equation
        for (let s = 0; s < it.shapes.length; s++)
          expect(it.equations.some((e) => e.terms.includes(s))).toBe(true);
        // declared values satisfy every equation
        for (const e of it.equations)
          expect(e.terms.reduce((sum, t) => sum + it.values[t]!, 0)).toBe(e.sum);
        // brute-force: exactly one positive-integer assignment satisfies the system
        const M = Math.max(...it.values, ...it.equations.map((e) => e.sum));
        let count = 0;
        const assign: number[] = new Array(it.shapes.length).fill(0);
        const rec = (i: number): void => {
          if (i === it.shapes.length) {
            if (it.equations.every((e) => e.terms.reduce((s, t) => s + assign[t]!, 0) === e.sum)) count++;
            return;
          }
          for (let v = 0; v <= M; v++) { assign[i] = v; rec(i + 1); }
        };
        rec(0);
        expect(count).toBe(1); // unique solution
      }
      break;
    case "magicSquare":
      for (const it of act.items) {
        const grid = it.grid.map((row) => [...row]);
        // exactly one blank per row and per column → uniquely solvable by row sums
        for (let r = 0; r < 3; r++) expect(grid[r]!.filter((c) => c === null).length).toBe(1);
        for (let c = 0; c < 3; c++) expect(grid.filter((row) => row[c] === null).length).toBe(1);
        // fill the blanks in row-major order from answers, then check magic sums
        let k = 0;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (grid[r]![c] === null) grid[r]![c] = it.answers[k++]!;
        expect(k).toBe(it.answers.length);
        for (let r = 0; r < 3; r++) expect(grid[r]!.reduce((a: number, b) => a + (b as number), 0)).toBe(it.magic);
        for (let c = 0; c < 3; c++) expect(grid.reduce((a: number, row) => a + (row[c] as number), 0)).toBe(it.magic);
      }
      break;
  }
}

describe("math-packet generator", () => {
  const grades = Object.keys(GRADES);

  it("is deterministic for a given seed", () => {
    const a = generatePacket({ difficulty: "g4", seed: 7, date: "2026-06-04" });
    const b = generatePacket({ difficulty: "g4", seed: 7, date: "2026-06-04" });
    expect(a).toEqual(b);
  });

  it("produces distinct activity types led by findTheSum", () => {
    for (const grade of grades) {
      const p = generatePacket({ difficulty: grade, seed: 3, date: "2026-06-04" });
      const types = p.activities.map((a) => a.type);
      expect(new Set(types).size).toBe(types.length); // all distinct
      expect(types[0]).toBe("findTheSum");
      expect(p.activities.length).toBe(Math.min(resolveGrade(grade).blocks, eligibleGens(resolveGrade(grade)).length));
    }
  });

  it("every generated answer is provably correct, across grades and seeds", () => {
    for (const grade of grades) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = generatePacket({ difficulty: grade, seed, date: "2026-06-04" });
        for (const act of p.activities) checkActivity(act);
      }
    }
  });

  it("every eligible activity generator builds correctly in isolation", () => {
    for (const grade of grades) {
      const g = resolveGrade(grade);
      for (const gen of eligibleGens(g)) {
        for (let seed = 1; seed <= 25; seed++) {
          checkActivity(gen.generate(g, makeRng(seed * 131 + g.grade)));
        }
      }
    }
  });

  it("snake chains appear from g2 up and never below g1", () => {
    expect(eligibleGens(resolveGrade("g1")).some((a) => a.type === "snake")).toBe(false);
    expect(eligibleGens(resolveGrade("g4")).some((a) => a.type === "snake")).toBe(true);
  });

  it("assembleActivities never repeats a type within a packet", () => {
    for (const grade of grades) {
      const g = resolveGrade(grade);
      const acts = assembleActivities(g, makeRng(99));
      expect(new Set(acts.map((a) => a.type)).size).toBe(acts.length);
    }
  });
});

describe("difficulty calibration (grade-appropriateness framework §3)", () => {
  const grades = Object.keys(GRADES);
  // Measure once: per-grade median score, % in band, and max tier observed.
  const STATS = grades.map((g) => {
    const scores: number[] = [];
    let inCount = 0, maxTier = 0;
    const N = 60;
    for (let s = 1; s <= N; s++) {
      const p = generatePacket({ difficulty: g, seed: s, date: "2026-06-04" });
      scores.push(p.load.score);
      if (inBand(g, p.load)) inCount++;
      maxTier = Math.max(maxTier, p.load.maxTier);
    }
    scores.sort((a, b) => a - b);
    return { g, median: scores[Math.floor(scores.length / 2)]!, inFrac: inCount / N, maxTier };
  });

  it("band-targeting lands ≥90% of packets in their grade band", () => {
    for (const s of STATS) expect(s.inFrac).toBeGreaterThanOrEqual(0.9);
  });

  it("median difficulty score increases monotonically with grade", () => {
    let prev = -Infinity;
    for (const s of STATS) { expect(s.median).toBeGreaterThanOrEqual(prev); prev = s.median; }
  });

  it("max reasoning tier is non-decreasing with grade", () => {
    let prev = 0;
    for (const s of STATS) { expect(s.maxTier).toBeGreaterThanOrEqual(prev); prev = s.maxTier; }
  });

  it("each grade's median score lands inside its own band", () => {
    for (const s of STATS) expect(inBand(s.g, { maxTier: 0, steps: 0, score: s.median, stars: 0 })).toBe(true);
  });
});
