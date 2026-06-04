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

export const collections = { puzzles };
