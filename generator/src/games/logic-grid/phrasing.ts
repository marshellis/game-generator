import type { Category, Ref, StructuredClue } from "./types";

export interface PhraseContext {
  categories: Category[];
  readingLevel: string;
  themeBlurb: string;
  /** Index of the "people" category whose items are named directly in clues. */
  subjectCat: number;
  /** Per-ordered-category natural relation, e.g. { 4: "older than" }. */
  comparatives: Record<number, string>;
}

export interface Phraser {
  phrase(clue: StructuredClue, ctx: PhraseContext): string;
}

const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function nameOf(ctx: PhraseContext, ref: Ref): string {
  return ctx.categories[ref.cat]!.items[ref.item]!;
}

function attrOf(ctx: PhraseContext, ref: Ref): string {
  return ctx.categories[ref.cat]!.name.toLowerCase();
}

function subjectNoun(ctx: PhraseContext): string {
  return ctx.categories[ctx.subjectCat]!.name.toLowerCase();
}

/**
 * Refer to the entity (person) identified by `ref`:
 *  - a subject item is named directly:    "Cora"
 *  - any other item is a relative clause:  "the kid whose pet is the Cat"
 */
function entity(ctx: PhraseContext, ref: Ref): string {
  if (ref.cat === ctx.subjectCat) return nameOf(ctx, ref);
  return `the ${subjectNoun(ctx)} whose ${attrOf(ctx, ref)} is ${nameOf(ctx, ref)}`;
}

/** Deterministic, logic-faithful, subject-aware phrasing. Used in tests/CI and as the offline default. */
export class TemplatePhraser implements Phraser {
  phrase(clue: StructuredClue, ctx: PhraseContext): string {
    switch (clue.type) {
      case "is":
        return this.link(ctx, clue.a, clue.b, true);
      case "isNot":
        return this.link(ctx, clue.a, clue.b, false);
      case "eitherOr": {
        const optCat = clue.options[0].cat;
        const o1 = nameOf(ctx, clue.options[0]);
        const o2 = nameOf(ctx, clue.options[1]);
        if (optCat === ctx.subjectCat) {
          return `${cap(entity(ctx, clue.a))} is either ${o1} or ${o2}.`;
        }
        if (clue.a.cat === ctx.subjectCat) {
          return `${nameOf(ctx, clue.a)}'s ${attrOf(ctx, clue.options[0])} is either ${o1} or ${o2}.`;
        }
        return `The ${subjectNoun(ctx)} whose ${attrOf(ctx, clue.a)} is ${nameOf(ctx, clue.a)} has either ${o1} or ${o2} for their ${attrOf(ctx, clue.options[0])}.`;
      }
      case "comparative": {
        const rel = ctx.comparatives[clue.orderedCat];
        const g = cap(entity(ctx, clue.greater));
        const l = entity(ctx, clue.lesser);
        if (rel) return `${g} is ${rel} ${l}.`;
        return `${g} has a higher ${attrOf(ctx, { cat: clue.orderedCat, item: 0 })} than ${l}.`;
      }
    }
  }

  /** Phrase an is/isNot association between two refs, subject-aware. */
  private link(ctx: PhraseContext, a: Ref, b: Ref, positive: boolean): string {
    const isWord = positive ? "is" : "is not";
    // Name the subject side directly; describe the other as its attribute.
    if (a.cat === ctx.subjectCat) {
      return `${nameOf(ctx, a)}'s ${attrOf(ctx, b)} ${isWord} ${nameOf(ctx, b)}.`;
    }
    if (b.cat === ctx.subjectCat) {
      return `${cap(entity(ctx, a))} ${isWord} ${nameOf(ctx, b)}.`;
    }
    // Neither side is the subject: identify the person by one attribute, state the other.
    const verb = positive ? "has" : "does not have";
    return `The ${subjectNoun(ctx)} whose ${attrOf(ctx, a)} is ${nameOf(ctx, a)} ${verb} ${nameOf(ctx, b)} for their ${attrOf(ctx, b)}.`;
  }
}
