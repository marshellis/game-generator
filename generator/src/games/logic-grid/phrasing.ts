import type { Category, Ref, StructuredClue } from "./types";

export interface PhraseContext {
  categories: Category[];
  readingLevel: string;
  themeBlurb: string;
}

export interface Phraser {
  phrase(clue: StructuredClue, ctx: PhraseContext): string;
}

function label(ctx: PhraseContext, ref: Ref): string {
  return ctx.categories[ref.cat]!.items[ref.item]!;
}

/** Deterministic, logic-faithful phrasing. Used in tests/CI and as the offline default. */
export class TemplatePhraser implements Phraser {
  phrase(clue: StructuredClue, ctx: PhraseContext): string {
    switch (clue.type) {
      case "is":
        return `${label(ctx, clue.a)} goes with ${label(ctx, clue.b)}.`;
      case "isNot":
        return `${label(ctx, clue.a)} does not go with ${label(ctx, clue.b)}.`;
      case "eitherOr":
        return `${label(ctx, clue.a)} goes with either ${label(ctx, clue.options[0])} or ${label(ctx, clue.options[1])}.`;
      case "comparative": {
        const catName = ctx.categories[clue.orderedCat]!.name;
        return `${label(ctx, clue.greater)} has a higher ${catName} than ${label(ctx, clue.lesser)}.`;
      }
    }
  }
}
