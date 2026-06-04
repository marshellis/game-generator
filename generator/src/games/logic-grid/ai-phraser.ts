import Anthropic from "@anthropic-ai/sdk";
import type { Puzzle } from "./types";

/**
 * AI phrasing post-pass. The deterministic pipeline already produced logically
 * correct, person-anchored clue `text` (the TemplatePhraser output). This rewrites
 * each clue into fun, age-appropriate prose while preserving the EXACT logical
 * meaning. `structured` (the source of truth for the grid + answer key) is never
 * touched, so the rewrite cannot make a puzzle unsolvable — worst case is a
 * clumsy sentence, not a broken puzzle.
 *
 * Requires ANTHROPIC_API_KEY in the environment. Opt-in via `generate --ai`.
 */

const MODEL = "claude-opus-4-8";

const SYSTEM = `You rewrite logic-grid puzzle clues so they're fun and engaging for kids, while preserving their EXACT logical meaning. You are the "flavor" layer on top of a verified puzzle.

Hard rules — break any of these and the puzzle breaks:
1. Preserve the logic exactly. The relationship in each clue (a match, a non-match, an either/or, or a comparison like "older than") must mean precisely the same thing after your rewrite.
2. Keep every proper noun verbatim: kids' names, item names (Cat, Red, Pretzels), and numbers. Do not rename, translate, pluralize, or swap them.
3. Keep person-anchored references. A phrase like "the kid whose pet is the Cat" identifies a PERSON by a clue — keep it pointing at that same person. NEVER replace it with a bare object ("...than the Cat" is wrong; "...than the kid with the cat" is right). A kid is a who; a pet/color/snack is a what.
4. One sentence per clue. No new facts, no hedging, no ambiguity. The clue must still be solvable with certainty.

Style:
- Playful, vivid, a little silly — the kind of clue a kid grins at. Vary sentence structure across clues; don't start them all the same way.
- Match the reading level to the grade given. Younger = shorter words and sentences.
- It's fine to add tiny harmless color ("swears up and down", "absolutely refuses") as long as rule 1 holds.

Return your answer by calling the structured output with a "texts" array containing exactly one rewritten clue per input clue, in the same order.`;

interface AiPhraseOptions {
  model?: string;
  apiKey?: string;
}

export async function aiPhrasePuzzle(puzzle: Puzzle, opts: AiPhraseOptions = {}): Promise<Puzzle> {
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});

  const numbered = puzzle.clues.map((c, i) => `${i + 1}. ${c.text}`).join("\n");
  const categories = puzzle.categories.map((c) => `${c.name}: ${c.items.join(", ")}`).join("\n");

  const userText = `Theme: ${puzzle.title}\nSetup: ${puzzle.themeBlurb}\nReading level: ${puzzle.gradeLabel}\n\nCategories:\n${categories}\n\nRewrite these ${puzzle.clues.length} clues (keep the same order and count):\n${numbered}`;

  const response = await client.messages.create({
    model: opts.model ?? MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            texts: { type: "array", items: { type: "string" } },
          },
          required: ["texts"],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: "user", content: userText }],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("AI phraser: no text block in response");
  const parsed = JSON.parse(block.text) as { texts: string[] };
  if (!Array.isArray(parsed.texts) || parsed.texts.length !== puzzle.clues.length) {
    throw new Error(
      `AI phraser: expected ${puzzle.clues.length} rewritten clues, got ${parsed.texts?.length}`,
    );
  }

  return {
    ...puzzle,
    clues: puzzle.clues.map((c, i) => ({ ...c, text: parsed.texts[i]!.trim() })),
  };
}
