// Quick multiple-choice question generators. Pure: (skill, grade, rand) -> a question. Answers are
// never stored; each item carries an HMAC of its correct answer, so checking is stateless.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type Rand = () => number;
export interface Raw { prompt: string; answer: string; distractors: string[] }
export interface Item { id: string; skill: string; prompt: string; choices: string[]; token: string }

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: Rand, a: T[]) => a[Math.floor(r() * a.length)];

function numChoices(r: Rand, ans: number, spread: number): string[] {
  const set = new Set<number>();
  let guard = 0;
  while (set.size < 3 && guard++ < 50) {
    const d = int(r, 1, spread) * (r() < 0.5 ? -1 : 1);
    if (ans + d !== ans && ans + d >= 0) set.add(ans + d);
  }
  let n = 1; while (set.size < 3) set.add(ans + spread + n++);
  return [...set].map(String);
}
const WORDS: Record<number, string[]> = {
  1: ["cat", "dog", "sun", "hat", "frog", "milk", "tree", "book"],
  3: ["planet", "garden", "rabbit", "pencil", "castle", "bridge", "island", "winter"],
  5: ["adventure", "mountain", "triangle", "library", "yesterday", "beautiful", "kingdom", "gravity"],
  7: ["necessary", "knowledge", "environment", "separate", "government", "independent", "temperature", "restaurant"],
};
function scramble(r: Rand, w: string): string {
  for (let k = 0; k < 20; k++) { const s = [...w].sort(() => r() - 0.5).join(""); if (s !== w) return s; }
  return [...w].reverse().join("");
}

const GEN: Record<string, (r: Rand, g: number) => Raw> = {
  "math.add": (r, g) => {
    const max = g <= 1 ? 10 : g === 2 ? 50 : g === 3 ? 500 : 5000;
    const a = int(r, 1, max), b = int(r, 1, max), ans = a + b;
    return { prompt: `${a} + ${b} = ?`, answer: String(ans), distractors: numChoices(r, ans, Math.max(2, Math.round(max / 10))) };
  },
  "math.sub": (r, g) => {
    const max = g <= 1 ? 10 : g === 2 ? 50 : g === 3 ? 500 : 5000;
    const a = int(r, Math.ceil(max / 4), max), b = int(r, 1, a), ans = a - b;
    return { prompt: `${a} − ${b} = ?`, answer: String(ans), distractors: numChoices(r, ans, Math.max(2, Math.round(max / 10))) };
  },
  "math.mul": (r, g) => {
    const a = int(r, 2, g <= 3 ? 9 : 12), b = int(r, 2, g >= 5 ? 25 : g === 4 ? 12 : 9), ans = a * b;
    return { prompt: `${a} × ${b} = ?`, answer: String(ans), distractors: numChoices(r, ans, Math.max(3, a)) };
  },
  "math.div": (r, g) => {
    const b = int(r, 2, g <= 3 ? 9 : 12), q = int(r, 2, g >= 5 ? 20 : 12), a = b * q;
    return { prompt: `${a} ÷ ${b} = ?`, answer: String(q), distractors: numChoices(r, q, 3) };
  },
  "math.frac": (r) => {
    let a: number, b: number, c: number, d: number;
    do { b = int(r, 2, 9); d = int(r, 2, 9); a = int(r, 1, b - 1); c = int(r, 1, d - 1); } while (a * d === c * b);
    const left = a * d > c * b;
    return { prompt: `Which is larger: ${a}/${b} or ${c}/${d}?`, answer: left ? `${a}/${b}` : `${c}/${d}`, distractors: [left ? `${c}/${d}` : `${a}/${b}`, "They are equal", "Cannot tell"] };
  },
  "math.pct": (r) => {
    const p = pick(r, [10, 20, 25, 50, 75]), base = pick(r, [20, 40, 60, 80, 120, 200]), ans = (p * base) / 100;
    return { prompt: `What is ${p}% of ${base}?`, answer: String(ans), distractors: numChoices(r, ans, Math.max(2, Math.round(ans / 4))) };
  },
  "math.eq": (r, g) => {
    if (g >= 7 && r() < 0.5) { const k = int(r, 2, 9), x = int(r, 2, 12); return { prompt: `${k}x = ${k * x}. What is x?`, answer: String(x), distractors: numChoices(r, x, 3) }; }
    const a = int(r, 2, 30), x = int(r, 1, 30);
    return { prompt: `x + ${a} = ${x + a}. What is x?`, answer: String(x), distractors: numChoices(r, x, 4) };
  },
  "logic.seq": (r, g) => {
    if (g >= 5 && r() < 0.4) { const s = int(r, 1, 4), k = int(r, 2, 3), seq = [0, 1, 2, 3].map((i) => s * k ** i); const ans = s * k ** 4; return { prompt: `What comes next? ${seq.join(", ")}, …`, answer: String(ans), distractors: numChoices(r, ans, s * k) }; }
    const s = int(r, 1, 20), step = int(r, 2, g >= 4 ? 12 : 5), seq = [0, 1, 2, 3].map((i) => s + step * i), ans = s + step * 4;
    return { prompt: `What comes next? ${seq.join(", ")}, …`, answer: String(ans), distractors: numChoices(r, ans, step) };
  },
  "language.unscramble": (r, g) => {
    const tier = g >= 7 ? 7 : g >= 5 ? 5 : g >= 3 ? 3 : 1, list = WORDS[tier], w = pick(r, list);
    const others = list.filter((x) => x !== w).sort(() => r() - 0.5).slice(0, 3);
    return { prompt: `Unscramble the word: ${scramble(r, w).toUpperCase()}`, answer: w, distractors: others };
  },
};

export const askable = (skill: string) => skill in GEN;
const sign = (secret: string, id: string, answer: string) => createHmac("sha256", secret).update(`${id}|${answer}`).digest("base64url");

export function makeItem(skill: string, grade: number, rand: Rand, secret: string): Item {
  const raw = GEN[skill](rand, grade);
  const id = `${skill}~${randomBytes(6).toString("hex")}`;
  const choices = [raw.answer, ...raw.distractors.slice(0, 3)].sort(() => rand() - 0.5);
  return { id, skill, prompt: raw.prompt, choices, token: sign(secret, id, raw.answer) };
}

export function checkAnswer(secret: string, id: string, token: string, choice: string): boolean {
  const a = Buffer.from(sign(secret, id, String(choice))), b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}
