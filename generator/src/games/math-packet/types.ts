/**
 * A "packet" is one day's printable worksheet for a grade: a mix of 3–4
 * different mini-puzzle blocks, each block holding several items. Every item
 * carries its own correct `answer` so the printed answer key is guaranteed
 * right by construction (the math analog of the logic grid's single solution).
 */

export type ActivityType =
  | "findTheSum"
  | "makeTen"
  | "numberBond"
  | "missingNumber"
  | "orderOfOps"
  | "placeValue"
  | "rounding"
  | "comparison"
  | "pattern"
  | "tenFrame"
  | "wordProblem"
  | "fraction"
  | "snake"
  | "breakApart"
  | "coinBubble"
  | "stdAlgorithm"
  | "match"
  | "sumChain"
  | "makeTrue"
  | "mysteryNumber"
  | "shapeSums"
  | "magicSquare";

/** Find the one number in the cluster that equals two of the others combined. */
export interface FindTheSumItem {
  numbers: number[];
  answerIndex: number;
  op: "+" | "×";
}
/** known ○ ___ = target  (a make-ten / make-hundred style fill). */
export interface MakeTenItem {
  known: number;
  target: number;
  op: "+";
  answer: number;
}
/** A part-part-whole bond: total at top, one known part, one missing part. */
export interface NumberBondItem {
  total: number;
  known: number;
  answer: number; // the missing part
}
/** a ○ b = c with exactly one of the three slots blanked out. */
export interface MissingNumberItem {
  left: number;
  op: "+" | "−" | "×" | "÷";
  right: number;
  result: number;
  blank: "left" | "right" | "result";
  answer: number;
}
/** Insert + − × between the operands (in order) to hit the target. */
export interface OrderOfOpsItem {
  operands: number[];
  ops: ("+" | "−" | "×")[]; // the unique solution, length = operands.length - 1
  target: number;
}
/** Value of the digit in a named place, e.g. tens place of 472 → 70. */
export interface PlaceValueItem {
  number: number;
  place: "ones" | "tens" | "hundreds" | "thousands";
  answer: number;
}
export interface RoundingItem {
  number: number;
  nearest: 10 | 100 | 1000;
  answer: number;
}
/** Compare two (possibly tiny-expression) sides with < > =. */
export interface ComparisonItem {
  leftText: string;
  rightText: string;
  answer: "<" | ">" | "=";
}
/** Arithmetic sequence with exactly one blank slot. */
export interface PatternItem {
  sequence: (number | null)[];
  answer: number;
}
/** Subitize: how many dots are shown across two five-frames (0–10). */
export interface TenFrameItem {
  dots: number;
  answer: number;
}
export interface WordProblemItem {
  text: string;
  answer: number;
  unit?: string;
}
/**
 * A running-total chain (Snake): start value, then a sequence of operations.
 * The player fills each result box in order. values[i] = result after ops[i].
 */
export interface SnakeItem {
  start: number;
  ops: { op: "+" | "−" | "×" | "÷"; operand: number }[];
  values: number[]; // length === ops.length; values[i] is the answer after step i
}

/** Expanded-form decomposition: number = part + part + ... with one part blank. */
export interface BreakApartItem {
  number: number;
  parts: number[]; // nonzero place values, e.g. 364 → [300, 60, 4]
  blankIndex: number;
  answer: number;
}

/** Count the money: a handful of coins (values in cents); total them. */
export interface CoinBubbleItem {
  coins: number[]; // cent values, e.g. [25, 10, 10, 5, 1]
  answer: number; // total cents
}

/** Vertical column arithmetic (the standard algorithm), often with regrouping. */
export interface StdAlgoItem {
  a: number;
  op: "+" | "−" | "×";
  b: number;
  answer: number;
}

/**
 * Match the Value: a quantity shown in one representation (a ten-frame, or
 * expanded form), plus number options — tap the one with the same value.
 */
export interface MatchItem {
  prompt: { kind: "tenFrame"; dots: number } | { kind: "expanded"; parts: number[] };
  options: number[];
  answer: number; // the value the prompt represents (one of options)
}

/** A single find-the-sum cluster (also the building block of the nested one). */
export interface SumCluster {
  numbers: number[];
  answerIndex: number;
}

/**
 * Find the Sum Challenge (nested): solve several sub-clusters, then the cluster
 * built from their answers. Multi-step — the final depends on the sub-answers.
 */
export interface NestedSumItem {
  subClusters: SumCluster[];
  final: SumCluster; // final.numbers are the sub-clusters' answers
}

/**
 * Make It True: a ○ b = c where the operation sign is blank. Exactly one sign
 * (from the activity's offered `signs`) makes the equation true — fill it in.
 */
export interface MakeTrueItem {
  left: number;
  right: number;
  result: number;
  answer: "+" | "−" | "×" | "÷"; // the unique sign that works
}

/** A single structured clue about the mystery number (display text is derived). */
export type MysteryClue =
  | { kind: "between"; lo: number; hi: number }
  | { kind: "parity"; even: boolean }
  | { kind: "gt"; n: number }
  | { kind: "lt"; n: number }
  | { kind: "digitSum"; s: number }
  | { kind: "tensDigit"; d: number }
  | { kind: "onesDigit"; d: number }
  | { kind: "multipleOf"; m: number };

/**
 * Mystery Number: a list of clues that exactly one number in the stated range
 * satisfies. The first clue is always a `between` framing the search range.
 */
export interface MysteryNumberItem {
  clues: MysteryClue[];
  answer: number;
}

/**
 * Shape Sums: each shape stands for a hidden number. A few addition equations
 * pin every shape down uniquely; the player reports each shape's value.
 * `equations[i].terms` are indices into `shapes`; they sum to `equations[i].sum`.
 */
export interface ShapeSumsItem {
  shapes: string[]; // emoji, one per unknown
  values: number[]; // the value of each shape (the answers), aligned to `shapes`
  equations: { terms: number[]; sum: number }[];
}

/**
 * Number Square (magic square): a 3×3 grid where every row and column adds to
 * `magic`. Some cells are blank (`null`); `answers` lists the missing values in
 * row-major order. Exactly one blank per row and per column guarantees a unique
 * solution by the row sums alone.
 */
export interface MagicSquareItem {
  grid: (number | null)[][];
  answers: number[];
  magic: number;
}

/** Either fill an equivalent fraction or compare two fractions. */
export type FractionItem =
  | { kind: "equiv"; num: number; den: number; newDen: number; answer: number }
  | { kind: "compare"; aNum: number; aDen: number; bNum: number; bDen: number; answer: "<" | ">" | "=" };

interface ActivityBase {
  title: string;
  instructions: string;
}
export type Activity =
  | (ActivityBase & { type: "findTheSum"; items: FindTheSumItem[] })
  | (ActivityBase & { type: "makeTen"; items: MakeTenItem[] })
  | (ActivityBase & { type: "numberBond"; items: NumberBondItem[] })
  | (ActivityBase & { type: "missingNumber"; items: MissingNumberItem[] })
  | (ActivityBase & { type: "orderOfOps"; items: OrderOfOpsItem[] })
  | (ActivityBase & { type: "placeValue"; items: PlaceValueItem[] })
  | (ActivityBase & { type: "rounding"; items: RoundingItem[] })
  | (ActivityBase & { type: "comparison"; items: ComparisonItem[] })
  | (ActivityBase & { type: "pattern"; items: PatternItem[] })
  | (ActivityBase & { type: "tenFrame"; items: TenFrameItem[] })
  | (ActivityBase & { type: "wordProblem"; items: WordProblemItem[] })
  | (ActivityBase & { type: "fraction"; items: FractionItem[] })
  | (ActivityBase & { type: "snake"; items: SnakeItem[] })
  | (ActivityBase & { type: "breakApart"; items: BreakApartItem[] })
  | (ActivityBase & { type: "coinBubble"; items: CoinBubbleItem[] })
  | (ActivityBase & { type: "stdAlgorithm"; items: StdAlgoItem[] })
  | (ActivityBase & { type: "match"; items: MatchItem[] })
  | (ActivityBase & { type: "sumChain"; items: NestedSumItem[] })
  | (ActivityBase & { type: "makeTrue"; signs: ("+" | "−" | "×" | "÷")[]; items: MakeTrueItem[] })
  | (ActivityBase & { type: "mysteryNumber"; items: MysteryNumberItem[] })
  | (ActivityBase & { type: "shapeSums"; items: ShapeSumsItem[] })
  | (ActivityBase & { type: "magicSquare"; items: MagicSquareItem[] });

/**
 * Measured difficulty of a packet (per the grade-appropriateness framework):
 * highest reasoning tier required, total sequential steps, and a composite
 * score. Lets "is this grade-appropriate?" be a number, not a vibe.
 */
export interface Load {
  maxTier: number;
  steps: number;
  score: number;
  /** Stored 1–5 difficulty rating (grade-independent), for sorting/labels. */
  stars: number;
}

export interface Packet {
  id: string;
  title: string;
  blurb: string;
  gameType: "math-packet";
  gradeLabel: string;
  difficulty: string; // "g1".."g8"
  activities: Activity[];
  /** Measured difficulty (grade-appropriateness framework §3). */
  load: Load;
  seed: number;
  createdAt: string;
}
