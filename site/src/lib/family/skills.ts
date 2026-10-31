// The skill map: what can be learned, for which grades, and what must come first.
// Data, not logic - add a row to add a skill. `ask: true` means a generator in questions.ts can
// serve it as a quick multiple-choice question; the rest are fed only by puzzle completions.
export type Subject = "math" | "logic" | "language" | "spatial" | "science";

export interface Skill {
  id: string;
  subject: Subject;
  label: string;
  grades: [number, number]; // inclusive g1-g8 band where this skill is taught
  prereqs: string[];
  ask: boolean;
  /** Existing puzzle game that exercises it (completions of that game count toward it). */
  game?: string;
}

export const SKILLS: Skill[] = [
  { id: "math.add", subject: "math", label: "Addition", grades: [1, 4], prereqs: [], ask: true },
  { id: "math.sub", subject: "math", label: "Subtraction", grades: [1, 4], prereqs: ["math.add"], ask: true },
  { id: "math.mul", subject: "math", label: "Multiplication", grades: [3, 6], prereqs: ["math.add"], ask: true },
  { id: "math.div", subject: "math", label: "Division", grades: [3, 6], prereqs: ["math.mul"], ask: true },
  { id: "math.frac", subject: "math", label: "Comparing fractions", grades: [4, 7], prereqs: ["math.div"], ask: true },
  { id: "math.pct", subject: "math", label: "Percentages", grades: [6, 8], prereqs: ["math.frac"], ask: true },
  { id: "math.eq", subject: "math", label: "Solving for x", grades: [5, 8], prereqs: ["math.sub"], ask: true },
  { id: "math.place", subject: "math", label: "Place value", grades: [2, 4], prereqs: [], ask: true },
  { id: "math.word", subject: "math", label: "Word problems", grades: [2, 6], prereqs: ["math.add"], ask: true },
  { id: "math.worksheet", subject: "math", label: "Math worksheets", grades: [1, 8], prereqs: [], ask: false, game: "math-packet" },
  { id: "logic.seq", subject: "logic", label: "Number patterns", grades: [2, 8], prereqs: ["math.add"], ask: true },
  { id: "logic.grid", subject: "logic", label: "Logic grids", grades: [1, 8], prereqs: [], ask: false, game: "logic-grid" },
  { id: "logic.sudoku", subject: "logic", label: "Sudoku", grades: [1, 8], prereqs: [], ask: false, game: "sudoku" },
  { id: "logic.kenken", subject: "logic", label: "KenKen", grades: [3, 8], prereqs: ["math.mul"], ask: false, game: "kenken" },
  { id: "language.unscramble", subject: "language", label: "Spelling", grades: [1, 8], prereqs: [], ask: true },
  { id: "language.vocab", subject: "language", label: "Vocabulary", grades: [3, 8], prereqs: [], ask: true },
  { id: "science.facts", subject: "science", label: "Science", grades: [1, 8], prereqs: [], ask: true },
  { id: "language.wordsearch", subject: "language", label: "Word search", grades: [1, 8], prereqs: [], ask: false, game: "word-search" },
  { id: "spatial.maze", subject: "spatial", label: "Mazes", grades: [1, 8], prereqs: [], ask: false, game: "maze" },
];

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
export const SKILL_FOR_GAME = new Map(SKILLS.filter((s) => s.game).map((s) => [s.game!, s.id]));
