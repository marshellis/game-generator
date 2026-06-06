import { defineCollection, z } from "astro:content";

const ref = z.object({ cat: z.number(), item: z.number() });

const structured = z.discriminatedUnion("type", [
  z.object({ type: z.literal("is"), a: ref, b: ref }),
  z.object({ type: z.literal("isNot"), a: ref, b: ref }),
  z.object({ type: z.literal("eitherOr"), a: ref, options: z.tuple([ref, ref]) }),
  z.object({ type: z.literal("comparative"), greater: ref, lesser: ref, orderedCat: z.number() }),
]);

const puzzles = defineCollection({
  type: "data",
  schema: z.object({
    id: z.string(),
    title: z.string(),
    themeBlurb: z.string(),
    gameType: z.literal("logic-grid"),
    gradeLabel: z.string(),
    difficulty: z.string(),
    categories: z.array(z.object({
      name: z.string(),
      ordered: z.boolean().optional(),
      items: z.array(z.string()),
    })),
    solution: z.array(z.array(z.number())),
    clues: z.array(z.object({ id: z.string(), structured, text: z.string() })),
    seed: z.number(),
    createdAt: z.string(),
  }),
});

// --- Game 2: math packets ---------------------------------------------------

const sign = z.enum(["<", ">", "="]);
const cluster = z.object({ numbers: z.array(z.number()), answerIndex: z.number() });

const activity = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("findTheSum"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ numbers: z.array(z.number()), answerIndex: z.number(), op: z.enum(["+", "×"]) })),
  }),
  z.object({
    type: z.literal("makeTen"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ known: z.number(), target: z.number(), op: z.literal("+"), answer: z.number() })),
  }),
  z.object({
    type: z.literal("numberBond"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ total: z.number(), known: z.number(), answer: z.number() })),
  }),
  z.object({
    type: z.literal("missingNumber"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({
      left: z.number(), op: z.enum(["+", "−", "×", "÷"]), right: z.number(), result: z.number(),
      blank: z.enum(["left", "right", "result"]), answer: z.number(),
    })),
  }),
  z.object({
    type: z.literal("orderOfOps"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ operands: z.array(z.number()), ops: z.array(z.enum(["+", "−", "×"])), target: z.number() })),
  }),
  z.object({
    type: z.literal("placeValue"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ number: z.number(), place: z.enum(["ones", "tens", "hundreds", "thousands"]), answer: z.number() })),
  }),
  z.object({
    type: z.literal("rounding"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ number: z.number(), nearest: z.union([z.literal(10), z.literal(100), z.literal(1000)]), answer: z.number() })),
  }),
  z.object({
    type: z.literal("comparison"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ leftText: z.string(), rightText: z.string(), answer: sign })),
  }),
  z.object({
    type: z.literal("pattern"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ sequence: z.array(z.number().nullable()), answer: z.number() })),
  }),
  z.object({
    type: z.literal("tenFrame"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ dots: z.number(), answer: z.number() })),
  }),
  z.object({
    type: z.literal("wordProblem"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ text: z.string(), answer: z.number(), unit: z.string().optional() })),
  }),
  z.object({
    type: z.literal("fraction"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("equiv"), num: z.number(), den: z.number(), newDen: z.number(), answer: z.number() }),
      z.object({ kind: z.literal("compare"), aNum: z.number(), aDen: z.number(), bNum: z.number(), bDen: z.number(), answer: sign }),
    ])),
  }),
  z.object({
    type: z.literal("snake"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({
      start: z.number(),
      ops: z.array(z.object({ op: z.enum(["+", "−", "×", "÷"]), operand: z.number() })),
      values: z.array(z.number()),
    })),
  }),
  z.object({
    type: z.literal("breakApart"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ number: z.number(), parts: z.array(z.number()), blankIndex: z.number(), answer: z.number() })),
  }),
  z.object({
    type: z.literal("coinBubble"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ coins: z.array(z.number()), answer: z.number() })),
  }),
  z.object({
    type: z.literal("stdAlgorithm"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({ a: z.number(), op: z.enum(["+", "−", "×"]), b: z.number(), answer: z.number() })),
  }),
  z.object({
    type: z.literal("match"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({
      prompt: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("tenFrame"), dots: z.number() }),
        z.object({ kind: z.literal("expanded"), parts: z.array(z.number()) }),
      ]),
      options: z.array(z.number()),
      answer: z.number(),
    })),
  }),
  z.object({
    type: z.literal("sumChain"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({
      subClusters: z.array(cluster),
      final: cluster,
    })),
  }),
  z.object({
    type: z.literal("makeTrue"),
    title: z.string(),
    instructions: z.string(),
    signs: z.array(z.enum(["+", "−", "×", "÷"])),
    items: z.array(z.object({
      left: z.number(), right: z.number(), result: z.number(), answer: z.enum(["+", "−", "×", "÷"]),
    })),
  }),
  z.object({
    type: z.literal("mysteryNumber"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({
      clues: z.array(z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("between"), lo: z.number(), hi: z.number() }),
        z.object({ kind: z.literal("parity"), even: z.boolean() }),
        z.object({ kind: z.literal("gt"), n: z.number() }),
        z.object({ kind: z.literal("lt"), n: z.number() }),
        z.object({ kind: z.literal("digitSum"), s: z.number() }),
        z.object({ kind: z.literal("tensDigit"), d: z.number() }),
        z.object({ kind: z.literal("onesDigit"), d: z.number() }),
        z.object({ kind: z.literal("multipleOf"), m: z.number() }),
      ])),
      answer: z.number(),
    })),
  }),
  z.object({
    type: z.literal("shapeSums"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({
      shapes: z.array(z.string()),
      values: z.array(z.number()),
      equations: z.array(z.object({ terms: z.array(z.number()), sum: z.number() })),
    })),
  }),
  z.object({
    type: z.literal("magicSquare"),
    title: z.string(),
    instructions: z.string(),
    items: z.array(z.object({
      grid: z.array(z.array(z.number().nullable())),
      answers: z.array(z.number()),
      magic: z.number(),
    })),
  }),
]);

const packets = defineCollection({
  type: "data",
  schema: z.object({
    id: z.string(),
    title: z.string(),
    blurb: z.string(),
    gameType: z.literal("math-packet"),
    gradeLabel: z.string(),
    difficulty: z.string(),
    activities: z.array(activity),
    load: z.object({ maxTier: z.number(), steps: z.number(), score: z.number(), stars: z.number() }),
    seed: z.number(),
    createdAt: z.string(),
  }),
});

const cell = z.object({ r: z.number(), c: z.number() });
const mazes = defineCollection({
  type: "data",
  schema: z.object({
    id: z.string(),
    title: z.string(),
    themeBlurb: z.string(),
    gameType: z.literal("maze"),
    gradeLabel: z.string(),
    difficulty: z.string(),
    cols: z.number(),
    rows: z.number(),
    open: z.array(z.array(z.number())),
    start: cell,
    end: cell,
    theme: z.object({ startIcon: z.string(), endIcon: z.string() }),
    solution: z.array(cell),
    difficultyRating: z.number(),
    seed: z.number(),
    createdAt: z.string(),
  }),
});

const sudokus = defineCollection({
  type: "data",
  schema: z.object({
    id: z.string(),
    title: z.string(),
    gameType: z.literal("sudoku"),
    gradeLabel: z.string(),
    difficulty: z.string(),
    size: z.number(),
    boxW: z.number(),
    boxH: z.number(),
    givens: z.array(z.array(z.number())),
    solution: z.array(z.array(z.number())),
    maxTier: z.number(),
    difficultyRating: z.number(),
    seed: z.number(),
    createdAt: z.string(),
  }),
});

export const collections = { puzzles, packets, mazes, sudokus };
