// Educational puzzle games, played to completion through the real UI by a managed child.
// For each game and several grades: open the puzzle, solve it like a kid would (clicks, typing, dragging, arrow
// keys), expect the win celebration, then check the whole learning loop: completion recorded, skill progress
// updated, and play time earned for the parent's ratio.
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { becomeKid, CONTENT_DIR, makeFamily, status } from "./helpers";

type Json = any;
const load = (dir: string): Json[] => fs.readdirSync(path.join(CONTENT_DIR, dir)).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, dir, f), "utf8")));
// One puzzle per grade band we care about (first of each), so difficulty extremes get exercised, not just g1.
const pick = (dir: string, grades = ["g1", "g4", "g8"]) => grades.map((g) => load(dir).find((p) => p.difficulty === g)).filter(Boolean) as Json[];

// Tall viewport: a drag needs both ends of a word on screen at once.
test.use({ viewport: { width: 1280, height: 1500 } });

const win = (page: Page) => page.locator('[role="dialog"]');

async function solveSudokuOrKenken(page: Page, root: string, cell: string, p: Json) {
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) {
    const el = page.locator(`${root} ${cell}[data-r="${r}"][data-c="${c}"]`);
    if ((await el.getAttribute("data-given")) === "1") continue;
    await el.click();
    await page.keyboard.press(String(p.solution[r][c]));
  }
}

const SOLVERS: Record<string, { path: string; collection: string; solve: (page: Page, p: Json) => Promise<void> }> = {
  sudoku: { path: "sudoku", collection: "sudokus", solve: (page, p) => solveSudokuOrKenken(page, ".sudoku", ".sudoku-cell", p) },
  kenken: { path: "kenken", collection: "kenkens", solve: (page, p) => solveSudokuOrKenken(page, ".kenken", ".kenken-cell", p) },
  maze: {
    path: "maze", collection: "mazes",
    async solve(page, p) {
      await page.locator(".maze svg.maze-svg").click({ position: { x: 5, y: 5 } }).catch(() => {}); // focus the page, harmless
      for (let i = 1; i < p.solution.length; i++) {
        const a = p.solution[i - 1], b = p.solution[i];
        await page.keyboard.press(b.r < a.r ? "ArrowUp" : b.r > a.r ? "ArrowDown" : b.c < a.c ? "ArrowLeft" : "ArrowRight");
      }
    },
  },
  "word-search": {
    path: "word-search", collection: "wordsearches",
    async solve(page, p) {
      for (const w of p.words) {
        const a = page.locator(`.ws-cell[data-r="${w.start.r}"][data-c="${w.start.c}"]`), b = page.locator(`.ws-cell[data-r="${w.end.r}"][data-c="${w.end.c}"]`);
        await a.scrollIntoViewIfNeeded();
        const A = (await a.boundingBox())!, B = (await b.boundingBox())!;
        await page.mouse.move(A.x + A.width / 2, A.y + A.height / 2);
        await page.mouse.down();
        await page.mouse.move(B.x + B.width / 2, B.y + B.height / 2, { steps: 6 });
        await page.mouse.up();
      }
    },
  },
  "logic-grid": {
    path: "puzzle", collection: "puzzles",
    async solve(page, p) {
      const cells = page.locator("td.cell");
      const n = await cells.count();
      for (let i = 0; i < n; i++) {
        const c = cells.nth(i);
        const [a, ai, b, bi] = await Promise.all(["data-a", "data-ai", "data-b", "data-bi"].map(async (k) => Number(await c.getAttribute(k))));
        const same = p.solution[a].indexOf(ai) === p.solution[b].indexOf(bi);
        await c.click(); if (same) await c.click(); // cycle: blank -> ✗ -> ○
      }
    },
  },
  "math-packet": {
    path: "packet", collection: "packets",
    async solve(page) {
      // numeric answers
      const inputs = page.locator("input[data-answer]");
      for (let i = 0; i < await inputs.count(); i++) { const el = inputs.nth(i); await el.fill(String(await el.getAttribute("data-answer"))); }
      // multiple-choice / sign groups: click the button whose value is the group's answer
      const groups = page.locator("[data-answer]:has(button[data-val])");
      for (let i = 0; i < await groups.count(); i++) {
        const g = groups.nth(i), ans = await g.getAttribute("data-answer");
        await g.locator(`button[data-val="${ans}"]`).first().click();
      }
      // "circle the one" clusters
      const clusters = page.locator(".js-cluster");
      for (let i = 0; i < await clusters.count(); i++) {
        const cl = clusters.nth(i);
        await cl.locator("button.chip").nth(Number(await cl.getAttribute("data-answer-index"))).click();
      }
      await page.locator("#check").click();
    },
  },
};

for (const [game, s] of Object.entries(SOLVERS)) {
  for (const p of pick(s.collection)) {
    test(`${game} ${p.difficulty}: a child solves it, is celebrated, and earns play time`, async ({ page, context }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
      const fam = await makeFamily(context, { settings: { allowance: { freePlayMin: 0, maxPlayMin: 90 }, mix: { preset: "balanced" } } });
      await becomeKid(context, fam);
      expect((await status(context)).remainingSec).toBe(0);

      await page.goto(`/${s.path}/${p.id}`);
      await expect(page.locator("#profile-chip, [data-chip]").first()).toBeVisible({ timeout: 10_000 }); // signed in as the kid
      await s.solve(page, p);
      await expect(win(page)).toBeVisible({ timeout: 10_000 });

      // the learning loop closed: recorded, earned time (3 correct-answers' worth at 2:1 = 120s), skill progress shown
      await expect.poll(async () => (await status(context)).remainingSec, { timeout: 10_000 }).toBe(120);
      const comps = await (await context.request.get("/api/me/completions")).json();
      expect(comps.completions.some((c: Json) => c.puzzleId === p.id && c.game === game), "completion recorded").toBe(true);
      const prog = await (await context.request.get("/api/family/me/progress")).json();
      expect(prog.skills.length, "mastery updated").toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }
}

test("a wrong answer is not celebrated and earns nothing (sudoku)", async ({ page, context }) => {
  const p = pick("sudokus", ["g1"])[0];
  const fam = await makeFamily(context, { settings: { allowance: { freePlayMin: 0, maxPlayMin: 90 } } });
  await becomeKid(context, fam);
  await page.goto(`/sudoku/${p.id}`);
  // fill every blank with a value that is wrong in the first blank cell
  let first = true;
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) {
    const el = page.locator(`.sudoku-cell[data-r="${r}"][data-c="${c}"]`);
    if ((await el.getAttribute("data-given")) === "1") continue;
    await el.click();
    const v = p.solution[r][c];
    await page.keyboard.press(String(first ? (v % p.size) + 1 : v)); first = false;
  }
  await page.locator("#check").click();
  await expect(win(page)).toHaveCount(0);
  expect((await status(context)).remainingSec).toBe(0);
});
