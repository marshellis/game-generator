import type { Ref } from "./types";

export type Cell = -1 | 0 | 1;

export class Contradiction extends Error {
  constructor() {
    super("logic-grid contradiction");
    this.name = "Contradiction";
  }
}

interface Comparative {
  greater: Ref;
  lesser: Ref;
  orderedCat: number;
}

export class Board {
  readonly C: number;
  readonly M: number;
  private state = new Map<number, Int8Array>();
  private comparatives: Comparative[] = [];
  private changed = false;

  constructor(C: number, M: number) {
    this.C = C;
    this.M = M;
    for (let a = 0; a < C; a++) {
      for (let b = a + 1; b < C; b++) {
        this.state.set(a * C + b, new Int8Array(M * M));
      }
    }
  }

  private locate(a: number, ai: number, b: number, bi: number): [number, number] {
    if (a < b) return [a * this.C + b, ai * this.M + bi];
    return [b * this.C + a, bi * this.M + ai];
  }

  get(a: number, ai: number, b: number, bi: number): Cell {
    const [k, idx] = this.locate(a, ai, b, bi);
    return this.state.get(k)![idx] as Cell;
  }

  clone(): Board {
    const nb = new Board(this.C, this.M);
    for (const [k, arr] of this.state) nb.state.set(k, arr.slice());
    nb.comparatives = this.comparatives.slice();
    return nb;
  }

  addComparative(c: Comparative): void {
    this.comparatives.push(c);
  }

  /** Set a cell and cascade local consequences (bijection elimination + transitivity). */
  set(a: number, ai: number, b: number, bi: number, val: 1 | -1): void {
    const cur = this.get(a, ai, b, bi);
    if (cur === val) return;
    if (cur !== 0) throw new Contradiction();
    const [k, idx] = this.locate(a, ai, b, bi);
    this.state.get(k)![idx] = val;
    this.changed = true;

    if (val === 1) {
      for (let j = 0; j < this.M; j++) if (j !== bi) this.set(a, ai, b, j, -1);
      for (let i = 0; i < this.M; i++) if (i !== ai) this.set(a, i, b, bi, -1);
      for (let c = 0; c < this.C; c++) {
        if (c === a || c === b) continue;
        for (let ci = 0; ci < this.M; ci++) {
          const ac = this.get(a, ai, c, ci);
          if (ac === 1) this.set(b, bi, c, ci, 1);
          else if (ac === -1) this.set(b, bi, c, ci, -1);
          const bc = this.get(b, bi, c, ci);
          if (bc === 1) this.set(a, ai, c, ci, 1);
          else if (bc === -1) this.set(a, ai, c, ci, -1);
        }
      }
    } else {
      for (let c = 0; c < this.C; c++) {
        if (c === a || c === b) continue;
        for (let ci = 0; ci < this.M; ci++) {
          if (this.get(a, ai, c, ci) === 1) this.set(c, ci, b, bi, -1);
          if (this.get(b, bi, c, ci) === 1) this.set(c, ci, a, ai, -1);
        }
      }
    }
  }

  /** Run all global inference rules to a fixpoint. Throws Contradiction if unsatisfiable. */
  propagate(): void {
    do {
      this.changed = false;
      for (let a = 0; a < this.C; a++) {
        for (let b = a + 1; b < this.C; b++) this.inferBijection(a, b);
      }
      for (const c of this.comparatives) this.processComparative(c);
    } while (this.changed);
  }

  private inferBijection(a: number, b: number): void {
    for (let ai = 0; ai < this.M; ai++) {
      let open = 0, openJ = -1, hasYes = false;
      for (let bj = 0; bj < this.M; bj++) {
        const v = this.get(a, ai, b, bj);
        if (v === 1) hasYes = true;
        else if (v === 0) { open++; openJ = bj; }
      }
      if (!hasYes && open === 0) throw new Contradiction();
      if (!hasYes && open === 1) this.set(a, ai, b, openJ, 1);
    }
    for (let bi = 0; bi < this.M; bi++) {
      let open = 0, openI = -1, hasYes = false;
      for (let aj = 0; aj < this.M; aj++) {
        const v = this.get(a, aj, b, bi);
        if (v === 1) hasYes = true;
        else if (v === 0) { open++; openI = aj; }
      }
      if (!hasYes && open === 0) throw new Contradiction();
      if (!hasYes && open === 1) this.set(a, openI, b, bi, 1);
    }
  }

  private processComparative(c: Comparative): void {
    const O = c.orderedCat;
    const g = c.greater;
    const l = c.lesser;
    const gFeas: number[] = [];
    const lFeas: number[] = [];
    for (let r = 0; r < this.M; r++) {
      if (this.get(g.cat, g.item, O, r) !== -1) gFeas.push(r);
      if (this.get(l.cat, l.item, O, r) !== -1) lFeas.push(r);
    }
    if (gFeas.length === 0 || lFeas.length === 0) throw new Contradiction();
    const minL = Math.min(...lFeas);
    const maxG = Math.max(...gFeas);
    // greater must outrank some feasible lesser → greater's rank > minL
    for (let r = 0; r <= minL; r++) {
      if (this.get(g.cat, g.item, O, r) !== -1) this.set(g.cat, g.item, O, r, -1);
    }
    // lesser must be below some feasible greater → lesser's rank < maxG
    for (let r = maxG; r < this.M; r++) {
      if (this.get(l.cat, l.item, O, r) !== -1) this.set(l.cat, l.item, O, r, -1);
    }
  }
}
