import type { Board } from "./board";
import type { StructuredClue } from "./types";

export function applyClue(board: Board, clue: StructuredClue): void {
  switch (clue.type) {
    case "is":
      board.set(clue.a.cat, clue.a.item, clue.b.cat, clue.b.item, 1);
      break;
    case "isNot":
      board.set(clue.a.cat, clue.a.item, clue.b.cat, clue.b.item, -1);
      break;
    case "eitherOr": {
      const optCat = clue.options[0].cat;
      const keep = new Set(clue.options.map((o) => o.item));
      for (let i = 0; i < board.M; i++) {
        if (!keep.has(i)) board.set(clue.a.cat, clue.a.item, optCat, i, -1);
      }
      break;
    }
    case "comparative":
      board.addComparative({ greater: clue.greater, lesser: clue.lesser, orderedCat: clue.orderedCat });
      break;
  }
}

export function applyClues(board: Board, clues: StructuredClue[]): void {
  for (const c of clues) applyClue(board, c);
}
