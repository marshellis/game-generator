/**
 * Per-grade knobs. Each activity generator reads what it needs and decides
 * whether it is eligible at this grade. Keeping the curve gentle: ranges grow
 * slowly and harder mechanics (×, order-of-ops, fractions) phase in by grade.
 */
export interface GradeConfig {
  /** "g1".."g8" */
  id: string;
  grade: number; // 1..8
  /** Largest whole number a kid at this grade should comfortably handle. */
  maxNumber: number;
  /** Operations that may appear in arithmetic activities. */
  ops: ("+" | "−" | "×" | "÷")[];
  /** How many activity blocks make up one daily packet. */
  blocks: number;
}

const O_ADD = ["+", "−"] as const;
const O_MUL = ["+", "−", "×"] as const;
const O_ALL = ["+", "−", "×", "÷"] as const;

export const GRADES: Record<string, GradeConfig> = {
  g1: { id: "g1", grade: 1, maxNumber: 20, ops: [...O_ADD], blocks: 3 },
  g2: { id: "g2", grade: 2, maxNumber: 100, ops: [...O_ADD], blocks: 3 },
  g3: { id: "g3", grade: 3, maxNumber: 1000, ops: [...O_MUL], blocks: 4 },
  g4: { id: "g4", grade: 4, maxNumber: 10000, ops: [...O_ALL], blocks: 4 },
  g5: { id: "g5", grade: 5, maxNumber: 100000, ops: [...O_ALL], blocks: 4 },
  g6: { id: "g6", grade: 6, maxNumber: 1000000, ops: [...O_ALL], blocks: 4 },
  g7: { id: "g7", grade: 7, maxNumber: 1000000, ops: [...O_ALL], blocks: 4 },
  g8: { id: "g8", grade: 8, maxNumber: 1000000, ops: [...O_ALL], blocks: 4 },
};

export function resolveGrade(id: string): GradeConfig {
  const g = GRADES[id];
  if (!g) throw new Error(`unknown grade preset: ${id}`);
  return g;
}
