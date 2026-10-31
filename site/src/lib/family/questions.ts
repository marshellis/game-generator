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

// Bank questions: [prompt, answer, ...wrong answers]. Grade band is the bank's tier (1,3,5,7 like WORDS).
type Bank = Record<number, [string, string, ...string[]][]>;
const VOCAB: Bank = {
  3: [["Which word means the same as “big”?", "large", "tiny", "quiet", "slow"], ["Which word means the opposite of “hot”?", "cold", "warm", "dry", "loud"],
      ["Which word means “very happy”?", "joyful", "sleepy", "angry", "hungry"], ["Which word means “to look at closely”?", "examine", "ignore", "carry", "whisper"],
      ["Which word means the opposite of “ancient”?", "modern", "heavy", "narrow", "silent"], ["A “brave” person is…", "not afraid", "very tired", "always late", "quite loud"]],
  5: [["“Enormous” means…", "extremely large", "very old", "quite funny", "hard to see"], ["To “hesitate” is to…", "pause before acting", "run very fast", "speak loudly", "give a gift"],
      ["Which word means “to make something better”?", "improve", "damage", "borrow", "repeat"], ["A “fragile” object is easily…", "broken", "found", "washed", "stretched"],
      ["“Reluctant” means…", "unwilling", "excited", "thankful", "confused"], ["To “conceal” is to…", "hide", "show", "count", "build"]],
  7: [["“Ambiguous” means…", "open to more than one meaning", "very clear", "extremely rare", "easily broken"], ["To “scrutinize” is to…", "examine very carefully", "forget quickly", "praise loudly", "move away"],
      ["“Benevolent” means…", "kind and generous", "dishonest", "forgetful", "easily angered"], ["A “meticulous” person is…", "very careful about details", "often late", "easily bored", "very loud"],
      ["“Inevitable” means…", "certain to happen", "very unlikely", "already finished", "hard to explain"], ["To “mitigate” is to…", "make less severe", "make larger", "make up", "make fun of"]],
};
const SCIENCE: Bank = {
  1: [["Which animal gives us milk?", "cow", "snake", "eagle", "shark"], ["What do plants need to grow?", "sunlight and water", "only candy", "only sand", "only ice"],
      ["Which one is a liquid?", "water", "rock", "wood", "brick"], ["What do we use our ears for?", "hearing", "smelling", "tasting", "seeing"]],
  3: [["What do we call frozen water?", "ice", "steam", "fog", "dew"], ["Which planet do we live on?", "Earth", "Mars", "Venus", "Jupiter"],
      ["What is a baby frog called?", "tadpole", "calf", "cub", "foal"], ["Which is a mammal?", "dolphin", "trout", "lizard", "parrot"], ["What force pulls things down to the ground?", "gravity", "magnetism", "friction", "wind"]],
  5: [["What gas do plants take in from the air?", "carbon dioxide", "helium", "nitrogen only", "hydrogen"], ["What is the center of an atom called?", "nucleus", "orbit", "cell", "crust"],
      ["Which layer of Earth do we live on?", "crust", "core", "mantle", "inner core"], ["What do we call animals that eat only plants?", "herbivores", "carnivores", "omnivores", "predators"],
      ["Which organ pumps blood around the body?", "heart", "lungs", "stomach", "kidney"]],
  7: [["What is the chemical symbol for water?", "H2O", "CO2", "O2", "NaCl"], ["What part of the cell holds the DNA?", "nucleus", "membrane", "vacuole", "wall"],
      ["What is the process plants use to make food from light?", "photosynthesis", "respiration", "evaporation", "digestion"], ["Which is a unit of force?", "newton", "volt", "kelvin", "meter"],
      ["What is the most common gas in Earth's atmosphere?", "nitrogen", "oxygen", "argon", "carbon dioxide"]],
};
function fromBank(bank: Bank, g: number, r: Rand): Raw {
  const tier = [7, 5, 3, 1].find((t) => g >= t && bank[t]) ?? Math.min(...Object.keys(bank).map(Number));
  const [prompt, answer, ...distractors] = pick(r, bank[tier]);
  return { prompt, answer, distractors };
}
const NAMES = ["Maya", "Leo", "Zoe", "Sam", "Ava", "Noah", "Mia", "Eli"];
const THINGS = ["apples", "stickers", "marbles", "cards", "cookies", "coins"];

const GEN: Record<string, (r: Rand, g: number) => Raw> = {
  "math.word": (r, g) => {
    const n = pick(r, NAMES), t = pick(r, THINGS), hi = g <= 2 ? 10 : g <= 4 ? 40 : 120;
    const kind = int(r, 0, g >= 3 ? 3 : 1);
    if (kind === 0) { const a = int(r, 3, hi), b = int(r, 2, hi); return { prompt: `${n} has ${a} ${t} and gets ${b} more. How many ${t} now?`, answer: String(a + b), distractors: numChoices(r, a + b, 3) }; }
    if (kind === 1) { const a = int(r, 6, hi), b = int(r, 1, a - 1); return { prompt: `${n} has ${a} ${t} and gives away ${b}. How many are left?`, answer: String(a - b), distractors: numChoices(r, a - b, 3) }; }
    if (kind === 2) { const a = int(r, 2, 9), b = int(r, 2, g >= 5 ? 12 : 9); return { prompt: `${n} has ${a} bags with ${b} ${t} in each. How many ${t} in all?`, answer: String(a * b), distractors: numChoices(r, a * b, Math.max(3, a)) }; }
    const b = int(r, 2, 9), q = int(r, 2, 12); return { prompt: `${n} shares ${b * q} ${t} equally among ${b} friends. How many does each friend get?`, answer: String(q), distractors: numChoices(r, q, 3) };
  },
  "math.place": (r, g) => {
    const digits = g <= 2 ? 2 : g <= 3 ? 3 : 4, num = int(r, 10 ** (digits - 1), 10 ** digits - 1), s = String(num);
    const idx = int(r, 0, digits - 1), names = ["ones", "tens", "hundreds", "thousands"], place = names[digits - 1 - idx];
    return { prompt: `In ${num}, which digit is in the ${place} place?`, answer: s[idx], distractors: [...new Set([...s].filter((c) => c !== s[idx]).concat(["0", "7", "3", "9"].filter((c) => c !== s[idx])))].slice(0, 3) };
  },
  "language.vocab": (r, g) => fromBank(VOCAB, g, r),
  "science.facts": (r, g) => fromBank(SCIENCE, g, r),
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
