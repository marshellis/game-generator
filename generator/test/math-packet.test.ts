import { describe, it, expect } from "vitest";
import { generatePacket } from "../src/games/math-packet/generate";
import { resolveGrade, GRADES } from "../src/games/math-packet/grades";
import { eligibleGens, evalOps } from "../src/games/math-packet/activities";
import { assembleActivities } from "../src/games/math-packet/assemble";
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

  it("assembleActivities never repeats a type within a packet", () => {
    for (const grade of grades) {
      const g = resolveGrade(grade);
      const acts = assembleActivities(g, makeRng(99));
      expect(new Set(acts.map((a) => a.type)).size).toBe(acts.length);
    }
  });
});
