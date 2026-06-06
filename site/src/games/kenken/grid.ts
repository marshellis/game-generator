// site/src/games/kenken/grid.ts
export type Op = "+" | "-" | "*" | "/" | "=";
export interface Cell { r: number; c: number; }
export interface Cage { cells: Cell[]; op: Op; target: number; }

/** Row/col duplicate cells (ignores blanks=0). */
export function conflicts(grid: number[][], size: number): Set<string> {
  const bad = new Set<string>();
  const scan = (cells: Cell[]) => {
    const byVal = new Map<number, Cell[]>();
    for (const { r, c } of cells) { const v = grid[r]![c]!; if (v === 0) continue; (byVal.get(v) ?? byVal.set(v, []).get(v)!).push({ r, c }); }
    for (const list of byVal.values()) if (list.length > 1) for (const { r, c } of list) bad.add(`${r},${c}`);
  };
  for (let r = 0; r < size; r++) scan(Array.from({ length: size }, (_, c) => ({ r, c })));
  for (let c = 0; c < size; c++) scan(Array.from({ length: size }, (_, r) => ({ r, c })));
  return bad;
}

export function cageSatisfied(cage: Cage, grid: number[][]): boolean {
  const vals = cage.cells.map(({ r, c }) => grid[r]![c]!);
  if (vals.some((v) => v === 0)) return false;
  switch (cage.op) {
    case "=": return vals[0] === cage.target;
    case "+": return vals.reduce((a, b) => a + b, 0) === cage.target;
    case "*": return vals.reduce((a, b) => a * b, 1) === cage.target;
    case "-": return vals.length === 2 && Math.abs(vals[0]! - vals[1]!) === cage.target;
    case "/": { const hi = Math.max(...vals), lo = Math.min(...vals); return vals.length === 2 && lo !== 0 && hi % lo === 0 && hi / lo === cage.target; }
  }
}
