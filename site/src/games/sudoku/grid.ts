/** Returns the set of "r,c" keys whose digit duplicates within its row, column, or box. */
export function conflicts(grid: number[][], size: number, boxW: number, boxH: number): Set<string> {
  const bad = new Set<string>();
  const scan = (cells: { r: number; c: number }[]) => {
    const byVal = new Map<number, { r: number; c: number }[]>();
    for (const { r, c } of cells) {
      const v = grid[r]![c]!;
      if (v === 0) continue;
      (byVal.get(v) ?? byVal.set(v, []).get(v)!).push({ r, c });
    }
    for (const list of byVal.values()) if (list.length > 1) for (const { r, c } of list) bad.add(`${r},${c}`);
  };
  for (let r = 0; r < size; r++) scan(Array.from({ length: size }, (_, c) => ({ r, c })));
  for (let c = 0; c < size; c++) scan(Array.from({ length: size }, (_, r) => ({ r, c })));
  for (let br = 0; br < size / boxH; br++) for (let bc = 0; bc < size / boxW; bc++) {
    const cells: { r: number; c: number }[] = [];
    for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) cells.push({ r: br * boxH + dr, c: bc * boxW + dc });
    scan(cells);
  }
  return bad;
}
