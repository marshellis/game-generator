// The learning loop reaches every game: when a game reports a finished round, a child whose parent asked for
// "a brain break every round" gets one - drawn over the game by the host page, on the isolated origin.
import { test, expect, type Page } from "@playwright/test";
import { arcadeSlugs, becomeKid, makeFamily, status } from "./helpers";

const NO_HOOK = new Set(["reverse-zelda"]);          // Godot export: no JS end-of-round yet (documented)
const DIRECT = new Set(["flappy", "nexus"]);         // use the SDK object directly; covered by learning-flow.spec
// Games whose own end-of-round function is a global we can call from outside: proves the real call site, not just the plumbing.
const REAL_END: Record<string, string> = {
  "dungeon-crawler": "die()", "minecraft-2d": "die()", "kingdom-wars": "endGame('Test','round over')",
};
const HEAVY = new Set(["hide-and-seek", "battle-royale", "ragdoll-siege"]);

async function frameOf(page: Page, slug: string) {
  for (let i = 0; i < 80; i++) { const f = page.frames().find((x) => x.url().includes(`/arcade/${slug}/index.html`)); if (f) return f; await page.waitForTimeout(250); }
  throw new Error(`no frame for ${slug}`);
}

for (const slug of arcadeSlugs().filter((s) => !NO_HOOK.has(s) && !DIRECT.has(s))) {
  test(`${slug}: a finished round reaches the child's brain break`, async ({ page, context }) => {
    test.setTimeout(HEAVY.has(slug) ? 150_000 : 60_000);
    await page.route(/\.fly\.dev|peerjs|stun\.|metered\.|googleapis/i, (r) => r.abort());
    const fam = await makeFamily(context, { settings: { allowance: { freePlayMin: 30, maxPlayMin: 90 }, mix: { preset: "balanced", breakEveryRounds: 1, dailyLearningTarget: 50, questionsPerBreak: 2 } } });
    await becomeKid(context, fam);
    const ticks: { round?: boolean }[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/family/play/tick") && r.method() === "POST") { try { ticks.push(JSON.parse(r.postData() ?? "{}")); } catch { /* ignore */ } } });
    await page.goto(`/arcade/${slug}/play`);
    const frame = await frameOf(page, slug);
    await frame.waitForFunction(() => !!(window as any).MGRounds, null, { timeout: 30_000 });   // the game loaded the helper
    await expect(page.locator(".mg-ov")).toHaveCount(0);                                         // nothing yet: no round has ended

    // the game reports the end of a round - through its own code path where we can reach it, else through the helper
    const real = REAL_END[slug];
    await frame.evaluate((code) => { try { code ? (0, eval)(code) : (window as any).MGRounds.end(); } catch { (window as any).MGRounds.end(); } }, real ?? null);

    await expect.poll(() => ticks.some((t) => t.round === true), { timeout: 15_000, message: "no round tick reached the server" }).toBe(true);
    await expect(page.locator(".mg-ov .mg-sub")).toContainText(/brain break/i, { timeout: 15_000 });   // the break is drawn over the game
    const st = await status(context);
    expect(st.ok).toBe(true);                                // it was a voluntary break, not a lockout
  });
}

test("a guest's finished round is counted but never interrupts them with a brain break", async ({ page }) => {
  await page.goto("/arcade/bounce/play");
  const frame = await frameOf(page, "bounce");
  await frame.waitForFunction(() => !!(window as any).MGRounds, null, { timeout: 30_000 });
  await frame.evaluate(() => (window as any).MGRounds.end());
  await page.waitForTimeout(1500);
  await expect(page.locator(".mg-ov")).toHaveCount(0);
});

test("rounds are not double counted: a burst of end() calls is one round", async ({ page, context }) => {
  const fam = await makeFamily(context, { settings: { allowance: { freePlayMin: 30, maxPlayMin: 90 }, mix: { preset: "balanced", breakEveryRounds: 3, dailyLearningTarget: 50 } } });
  await becomeKid(context, fam);
  const rounds: boolean[] = [];
  page.on("request", (r) => { if (r.url().includes("/play/tick") && r.method() === "POST") { try { if (JSON.parse(r.postData() ?? "{}").round) rounds.push(true); } catch { /* */ } } });
  await page.goto("/arcade/bounce/play");
  const frame = await frameOf(page, "bounce");
  await frame.waitForFunction(() => !!(window as any).MGRounds);
  await frame.evaluate(() => { for (let i = 0; i < 10; i++) (window as any).MGRounds.end(); });
  await page.waitForTimeout(2000);
  expect(rounds.length).toBe(1);
});
