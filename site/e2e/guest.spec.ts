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
