/** Re-verify the arithmetic of every worksheet item we can recompute from the item itself. */
export function validateMathPacket(data: unknown): string[] {
  const p: string[] = [];
  const packet = data as { activities?: { type: string; items?: any[] }[] };
  for (const a of packet.activities ?? []) for (const it of a.items ?? []) {
    if ("known" in it && "target" in it && "answer" in it && it.known + it.answer !== it.target) p.push(`${a.type}: ${it.known} + ${it.answer} != ${it.target}`);
    if ("total" in it && "known" in it && "answer" in it && it.known + it.answer !== it.total) p.push(`${a.type}: bond ${it.known} + ${it.answer} != ${it.total}`);
    if ("left" in it && "right" in it && "result" in it && "op" in it) {
      const v = it.op === "+" ? it.left + it.right : it.op === "-" || it.op === "−" ? it.left - it.right : it.op === "×" || it.op === "*" ? it.left * it.right : it.op === "÷" || it.op === "/" ? it.left / it.right : NaN;
      if (!Number.isNaN(v) && v !== it.result) p.push(`${a.type}: ${it.left} ${it.op} ${it.right} = ${it.result}?`);
    }
    if (Array.isArray(it.numbers) && typeof it.answerIndex === "number") {
      const target = it.numbers[it.answerIndex], rest = it.numbers.filter((_: number, i: number) => i !== it.answerIndex);
      const ok = rest.some((x: number, i: number) => rest.some((y: number, j: number) => i < j && (it.op === "×" ? x * y : x + y) === target));
      if (!ok) p.push(`${a.type}: ${target} is not the ${it.op} of two of ${rest.join(", ")}`);
    }
    if ("answer" in it && typeof it.answer === "number" && !Number.isFinite(it.answer)) p.push(`${a.type}: non-finite answer`);
  }
  return p;
}
