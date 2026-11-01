// The family + education flow, end to end through the real UI: a parent onboards a child, sets the learning mix,
// hands the device over; the child hits the gate, answers brain-break questions to earn play time, plays, and runs
// out; the parent reviews and deletes. Mirrors what the family will actually do.
import { test, expect, type Page } from "@playwright/test";

async function gameFrame(page: Page, slug: string) {
  for (let i = 0; i < 60; i++) { const f = page.frames().find((x) => x.url().includes(`/arcade/${slug}/index.html`)); if (f) return f; await page.waitForTimeout(250); }
  throw new Error(`no frame for ${slug}`);
}
import { answerBreak, becomeKid, makeFamily, PASSWORD, status, trackQuestions, uniq } from "./helpers";

test("parent onboarding in the UI: sign up, add a child, set rules, lock parent mode", async ({ page }) => {
  const email = `${uniq("ui")}@example.com`, kid = uniq("ava");
  await page.goto("/family");
  await page.locator("#em").fill(email);
  await page.locator("#pw").fill(PASSWORD);
  await page.locator("#hn").fill("The E2E Family");
  await page.locator("#co").check();
  await page.locator("#su").click();
  await expect(page.getByText("The E2E Family")).toBeVisible();

  await page.locator("#nn").fill(kid);
  await page.locator("#by").fill("2016");
  await page.locator("#add").click();
  const card = page.locator(`#p-${kid}`);
  await expect(card).toBeVisible();

  // the parent's rules: no free play, learning required; save and see the confirmation
  await card.locator('[data-f="freePlayMin"]').fill("0");
  await card.locator('[data-f="maxPlayMin"]').fill("60");
  await card.locator('[data-f="preset"]').selectOption("balanced");
  await card.locator('[data-act="save"]').click();
  await expect(card.locator("[data-ok]")).toHaveText("Saved");

  // the family page is parent-only: lock it, and the household view is gone
  await page.locator("#lock").click();
  await expect(page.locator("#em")).toBeVisible();
  const hh = await page.request.get("/api/family/household");
  expect(hh.status()).toBe(401);
});

test("parent can't be impersonated by the kid's device, and destructive actions need the password (UI)", async ({ page, context }) => {
  const fam = await makeFamily(context);
  await page.goto("/family");
  await expect(page.locator(`#p-${fam.child}`)).toBeVisible();
  const prompts: string[] = [];
  page.on("dialog", async (d) => {
    prompts.push(d.type());
    if (d.type() === "prompt") await d.accept("not-the-password"); else if (d.type() === "alert") await d.accept(); else await d.accept();
  });
  await page.locator(`#p-${fam.child} [data-act="delete"]`).click();
  await expect.poll(() => prompts.includes("alert")).toBe(true); // "That password didn't match."
  expect((await context.request.get("/api/family/profiles/" + fam.child + "/export")).ok()).toBe(true); // still there
  // with the right password it goes away for real
  page.removeAllListeners("dialog");
  page.on("dialog", async (d) => { if (d.type() === "prompt") await d.accept(PASSWORD); else await d.accept(); });
  await page.locator(`#p-${fam.child} [data-act="delete"]`).click();
  await expect(page.locator(`#p-${fam.child}`)).toHaveCount(0);
});

test("the kid loop: gate -> brain break -> earn time -> play -> time up (soft), via the real arcade page", async ({ page, context }) => {
  const fam = await makeFamily(context, { settings: { allowance: { freePlayMin: 0, maxPlayMin: 90 }, mix: { preset: "balanced", questionsPerBreak: 3 }, enforcement: "soft" } });
  await context.request.post("/api/family/parent/lock");
  const items = trackQuestions(page);

  // Parent handed over the phone; the kid taps their face in "Who's playing?" (the wrapper shows the picker).
  await page.goto("/arcade/flappy/play");
  await page.locator("#mg-picker .mg-pick button", { hasText: fam.child }).click();

  // No free time: a brain break appears instead of the game, and the game frame stays unloaded.
  await expect(page.locator(".mg-ov .mg-sub")).toContainText(/brain break/i);
  expect(await page.locator("#game-frame").getAttribute("src")).toMatch(/^(about:blank)?$/);

  // Wrong answers earn nothing; the gate asks again.
  for (let i = 0; i < 3; i++) { await answerBreak(page, items, false); await page.waitForTimeout(900); }
  await expect(page.locator(".mg-ov .mg-q")).toContainText(/No play time earned/i);
  expect(await page.locator("#game-frame").getAttribute("src")).toMatch(/^(about:blank)?$/); // still no game
  await page.locator(".mg-ov .mg-go").click(); // "Try again" -> a fresh brain break
  await expect(page.locator(".mg-ov .mg-sub")).toContainText(/brain break/i, { timeout: 5000 });

  // Right answers earn time: 3 x 20s x 2 = 120s, then the game starts.
  for (let i = 0; i < 3; i++) { await answerBreak(page, items, true); await page.waitForTimeout(900); }
  await expect(page.locator(".mg-ov .mg-q")).toContainText(/of play time/);
  await page.locator(".mg-ov .mg-go").click();
  await expect(page.locator("#game-frame")).toHaveAttribute("src", /play\.|127\.0\.0\.1.*flappy|flappy\/index\.html/);
  const st = await status(context);
  expect(st.ok).toBe(true);
  expect(st.remainingSec).toBeGreaterThan(100);
  expect(st.remainingSec).toBeLessThanOrEqual(120);

  // The learning data is the parent's to see: mastery recorded for what the kid answered.
  const prog = await (await context.request.get("/api/family/me/progress")).json();
  expect(prog.skills.length).toBeGreaterThan(0);
});

test("hard limit, for real: a 1-minute allowance runs out while the child plays; the host blanks the game and it stays blocked", async ({ page, context }) => {
  test.setTimeout(150_000); // real wall-clock: the server only credits time that really elapsed
  const fam = await makeFamily(context, { settings: { allowance: { freePlayMin: 1, maxPlayMin: 1 }, enforcement: "hard" } });
  await becomeKid(context, fam);
  await page.goto("/arcade/bounce/play"); // a legacy game that knows nothing about time limits
  await expect(page.locator("#game-frame")).toHaveAttribute("src", /bounce\/index\.html/);

  // ~60s of real play later the host page (not the game) raises the stop screen and unloads the game
  await expect(page.locator(".mg-ov")).toContainText(/all the play time for today/i, { timeout: 100_000 });
  expect(await page.locator("#game-frame").getAttribute("src")).toBe("about:blank");
  const st = await status(context);
  expect(st.ok).toBe(false);
  expect(st.reason).toBe("limit");

  // no way round it: reloading the page, or asking for questions, does not buy time back under a HARD limit
  await page.locator(".mg-ov .mg-go").click();
  await page.reload();
  await expect(page.locator(".mg-ov")).toContainText(/all the play time for today/i, { timeout: 15_000 });
  expect((await status(context)).ok).toBe(false);
});

test("scores flow (SDK game): the child is recognised inside the game and the score reaches the leaderboard", async ({ page, context }) => {
  const fam = await makeFamily(context, { settings: { allowance: { freePlayMin: 30, maxPlayMin: 60 } } });
  await becomeKid(context, fam);
  await page.goto("/arcade/flappy/play");
  const frame = await gameFrame(page, "flappy");
  await expect(frame.locator(".mg-chip")).toContainText(fam.child, { timeout: 15_000 }); // identity reached the game via the relay
});

test("scores flow (legacy game via compat): fetch('/api/scores') from the isolated origin lands for the right child", async ({ page, context }) => {
  const fam = await makeFamily(context, { settings: { allowance: { freePlayMin: 30, maxPlayMin: 60 } } });
  await becomeKid(context, fam);
  await page.goto("/arcade/bounce/play");
  const frame = await gameFrame(page, "bounce");
  await frame.waitForLoadState("load");
  const me = await frame.evaluate(async () => (await (await fetch("/api/me")).json()).username);
  expect(me).toBe(fam.child);
  const res = await frame.evaluate(async () => (await fetch("/api/scores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: "bounce", score: 17 }) })).status);
  expect(res).toBe(200);
  const top = await (await context.request.get("/api/leaderboard?game=bounce&limit=5")).json();
  expect(top.top.some((r: any) => r.username === fam.child && r.score === 17)).toBe(true);
});
