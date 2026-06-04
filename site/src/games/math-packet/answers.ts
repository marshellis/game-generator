import type { CollectionEntry } from "astro:content";

export type Activity = CollectionEntry<"packets">["data"]["activities"][number];

/** Human-readable correct answers for one activity, one string per item. */
export function keyForActivity(act: Activity): string[] {
  switch (act.type) {
    case "findTheSum":
      return act.items.map((it) => String(it.numbers[it.answerIndex]));
    case "makeTen":
    case "numberBond":
    case "missingNumber":
    case "placeValue":
    case "rounding":
    case "pattern":
    case "tenFrame":
      return act.items.map((it) => String(it.answer));
    case "orderOfOps":
      return act.items.map((it) => {
        const parts: string[] = [String(it.operands[0])];
        it.ops.forEach((op, k) => parts.push(op, String(it.operands[k + 1])));
        return `${parts.join(" ")} = ${it.target}`;
      });
    case "comparison":
      return act.items.map((it) => `${it.leftText} ${it.answer} ${it.rightText}`);
    case "wordProblem":
      return act.items.map((it) => `${it.answer}${it.unit ? " " + it.unit : ""}`);
    case "fraction":
      return act.items.map((it) =>
        it.kind === "equiv" ? `${it.num}/${it.den} = ${it.answer}/${it.newDen}` : `${it.aNum}/${it.aDen} ${it.answer} ${it.bNum}/${it.bDen}`,
      );
  }
}
