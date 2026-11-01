// Guests are first-class: every game plays with no account, no sign-in wall, no learning gate, nothing to create.
import { test, expect, type Page } from "@playwright/test";
import { arcadeSlugs } from "./helpers";

async function gameFrame(page: Page, slug: string) {
  for (let i = 0; i < 60; i++) { const f = page.frames().find((x) => x.url().includes(`/arcade/${slug}/index.html`)); if (f) return f; await page.waitForTimeout(250); }
  throw new Error(`no frame for ${slug}`);
}

test("a brand-new visitor can play Flappy as a guest: no overlay, says Guest, sign-up is one tap away", async ({ page }) => {
  await page.goto("/arcade/flappy/play");
  const frame = await gameFrame(page, "flappy");
  await expect(page.locator(".mg-ov")).toHaveCount(0);                              // no gate, no wall
  await expect(frame.locator(".mg-chip")).toContainText("Guest", { timeout: 10_000 });  // explicit, not implied
  await expect(frame.locator("#mg-account")).toBeHidden();                           // sign-up is folded away, not in the way
  await expect(frame.locator("canvas").first()).toBeVisible();                      // the game itself is on screen, ready to play
  await frame.locator(".mg-chip button").click();                                    // "Join leaderboard"
  await expect(frame.locator("#mg-account")).toBeVisible();
  await expect(frame.locator("#mg-account")).toContainText(/No account needed/i);
  await frame.locator(".mg-chip button").click();                                    // "Hide"
  await expect(frame.locator("#mg-account")).toBeHidden();
});

test("the site 'Sign in' dialog tells guests they don't need one and lets them back out", async ({ page }) => {
  await page.goto("/arcade/flappy/play");
  await page.getByRole("button", { name: /sign in/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/don't need an account to play/i);
  await dialog.getByRole("button", { name: /keep playing as a guest/i }).click();
  await expect(dialog).toHaveCount(0);
});

for (const slug of arcadeSlugs()) {
  test(`${slug}: loads for a guest with no sign-in wall`, async ({ page }) => {
    await page.goto(`/arcade/${slug}/play`);
    await expect(page.locator("#game-frame")).toHaveAttribute("src", new RegExp(`/arcade/${slug}/index.html`), { timeout: 15_000 });
    await expect(page.locator(".mg-ov")).toHaveCount(0); // a guest is never gated or blocked
  });
}

test("guest play is limited: when the guest allowance is used the game is blocked and a profile is offered; 'Not now' doesn't unblock it", async ({ page, context }) => {
  await page.goto("/arcade/flappy/play");
  await gameFrame(page, "flappy");
  await expect(page.locator(".mg-ov")).toHaveCount(0);              // at first: free to play
  const st0 = await (await context.request.get("/api/family/play/status")).json();
  expect(st0).toMatchObject({ ok: true, guest: true });
  expect(st0.remainingSec).toBeGreaterThan(14 * 60);

  // Use up the guest day (test-only endpoint; a real guest would play ~15 minutes)
  expect((await context.request.post("/api/e2e/guest-spend", { data: { seconds: 15 * 60 } })).ok()).toBe(true);
  await page.reload();
  const ov = page.locator(".mg-ov");
  await expect(ov).toContainText(/guest play time for today/i, { timeout: 15_000 });
  await expect(ov.getByRole("link", { name: /make a profile/i })).toHaveAttribute("href", "/profile");
  expect((await page.locator("#game-frame").getAttribute("src")) ?? "").toMatch(/^(about:blank)?$/);  // the game never loaded

  await ov.getByRole("button", { name: /not now/i }).click();
  await expect(ov).toHaveCount(0);
  expect((await page.locator("#game-frame").getAttribute("src")) ?? "").toMatch(/^(about:blank)?$/);  // still blocked
  expect((await (await context.request.get("/api/family/play/status")).json()).ok).toBe(false);

  // the offered way on works: a profile has no guest cap (it is a normal account)
  await context.request.post("/api/auth/signup", { data: { username: `g${Date.now().toString(36).slice(-6)}`, pin: "1234" } });
  await page.reload();
  await expect(page.locator("#game-frame")).toHaveAttribute("src", /flappy\/index\.html/, { timeout: 15_000 });
  await expect(page.locator(".mg-ov")).toHaveCount(0);
});

test("the guest cap is per browser, and a different visitor is unaffected", async ({ page, browser }) => {
  const other = await browser.newContext(); const op = await other.newPage();
  await page.goto("/arcade/bounce/play");
  await page.context().request.get("/api/family/play/status");
  await page.context().request.post("/api/e2e/guest-spend", { data: { seconds: 15 * 60 } });
  expect((await (await page.context().request.get("/api/family/play/status")).json()).ok).toBe(false);
  await op.goto("/arcade/bounce/play");
  expect((await (await other.request.get("/api/family/play/status")).json()).ok).toBe(true);
  await other.close();
});
