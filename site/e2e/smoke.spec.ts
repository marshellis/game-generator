import { test, expect } from "@playwright/test";
test("site boots with in-memory storage", async ({ page, request }) => {
  const r = await request.get("/api/leaderboard?game=flappy&limit=3");
  expect(r.status()).toBe(200);
  await page.goto("/arcade");
  await expect(page.locator("body")).toContainText("Arcade");
});
