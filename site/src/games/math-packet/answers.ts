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
    case "snake":
      return act.items.map((it) => [String(it.start), ...it.values.map(String)].join(" → "));
    case "breakApart":
      return act.items.map((it) => `${it.number} = ${it.parts.join(" + ")}`);
    case "coinBubble":
      return act.items.map((it) => `${it.answer}¢`);
    case "stdAlgorithm":
      return act.items.map((it) => `${it.a} ${it.op} ${it.b} = ${it.answer}`);
    case "match":
      return act.items.map((it) => String(it.answer));
    case "sumChain":
      return act.items.map((it) => {
        const subs = it.subClusters.map((c) => c.numbers[c.answerIndex]).join(", ");
        return `${subs} → ${it.final.numbers[it.final.answerIndex]}`;
      });
    case "makeTrue":
      return act.items.map((it) => `${it.left} ${it.answer} ${it.right} = ${it.result}`);
    case "mysteryNumber":
      return act.items.map((it) => String(it.answer));
    case "shapeSums":
      return act.items.map((it) => it.shapes.map((s, i) => `${s} = ${it.values[i]}`).join(",  "));
    case "magicSquare":
      return act.items.map((it) => it.answers.join(", "));
  }
}
