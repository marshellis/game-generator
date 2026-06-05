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
    seed: z.number(),
    createdAt: z.string(),
  }),
});

export const collections = { puzzles, packets };
