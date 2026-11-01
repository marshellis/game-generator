// Every arcade game, in a real browser, on the isolated origin. Cannot check game RULES (they are the kids' own
// code) but does catch the failures that matter most: game won't load, throws on start, renders nothing, dies on
// input, escapes its sandbox, or ignores the parent's time limit.
import { test, expect, type Page } from "@playwright/test";
import { arcadeSlugs, becomeKid, makeFamily } from "./helpers";
import { ORIGINS } from "../playwright.config";

// Multiplayer servers live on the public internet; a test must never create rooms on them. The game has to cope.
const blockRealtime = (page: Page) => page.route(/\.fly\.dev|peerjs|stun\.|metered\.|googleapis/i, (r) => r.abort());
// Headless CI has no GPU; 3D games log this and nothing else is wrong.
const ENV_NOISE = /WebGL|webgl|GPU|AudioContext|autoplay|Failed to load resource|net::ERR|WebSocket|ERR_BLOCKED|Pointer ?lock|requestPointerLock|fullscreen/i;

// Software-rendered 3D / wasm engines can starve the main thread on a CI box; load + one click is the honest check there.
const HEAVY = new Set(["hide-and-seek", "reverse-zelda", "battle-royale", "nexus"]);

for (const slug of arcadeSlugs()) {
  test.describe(slug, () => {
    test("loads on the isolated origin, renders, survives input, stays inside its sandbox", async ({ page }) => {
      test.setTimeout(HEAVY.has(slug) ? 180_000 : 90_000);
      const errors: string[] = [];
      page.on("pageerror", (e) => { if (!ENV_NOISE.test(e.message)) errors.push(e.message.slice(0, 160)); });
      await blockRealtime(page);
      await page.goto(`/arcade/${slug}/play`);
      const frameEl = page.locator("#game-frame");
      await expect(frameEl).toHaveAttribute("src", new RegExp(`^${ORIGINS.PLAY}/arcade/${slug}/index.html`), { timeout: 15_000 });
      const frame = page.frames().find((f) => f.url().includes(`/arcade/${slug}/index.html`)) ?? await (async () => { await page.waitForEvent("framenavigated"); return page.frames().find((f) => f.url().includes(slug))!; })();
      // 1. isolation first, while the page is still responsive (a software-rendered 3D/wasm game can starve the main thread)
      const probe = await frame.evaluate(async (site) => {
        const st = async (u: string, o?: RequestInit) => { try { return (await fetch(u, o)).status; } catch { return "blocked"; } };
        return { cookie: document.cookie, cross: await st(site + "/api/family/household", { credentials: "include" }) };
      }, ORIGINS.SITE);
      expect(probe.cookie).toBe("");
      expect(probe.cross === "blocked" || probe.cross >= 400).toBe(true);

      await page.waitForTimeout(2500);
      const box = (await frameEl.boundingBox())!;
      if (HEAVY.has(slug)) {
        // honest minimum for heavy engines: it started, nothing blew up while it ran for a while
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
        await page.waitForTimeout(4000);
      } else {
        // 2. it drew something (a blank/failed game is a tiny, near-uniform PNG)
        const before = await frameEl.screenshot();
        expect(before.length, "frame looks blank").toBeGreaterThan(4000);
        // 3. generic input: click the middle, mash keys, move the mouse (menus start, characters move, canvases animate)
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        for (const k of ["Enter", "Space", "ArrowRight", "ArrowUp", "KeyW", "KeyD", "Space"]) { await page.keyboard.press(k); await page.waitForTimeout(150); }
        await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
        await page.waitForTimeout(1500);
        const after = await frameEl.screenshot();
        expect(after.length).toBeGreaterThan(4000);
        test.info().annotations.push({ type: "alive", description: before.equals(after) ? "static after input (menu/idle?)" : "changed after input" });
      }

      expect(errors, `uncaught errors in ${slug}`).toEqual([]);
    });

    test("a child with no play time left never gets the game (host enforces, game can't opt out)", async ({ page, context }) => {
      const fam = await makeFamily(context, { settings: { allowance: { freePlayMin: 0, maxPlayMin: 0 }, enforcement: "hard" } });
      await becomeKid(context, fam);
      await blockRealtime(page);
      await page.goto(`/arcade/${slug}/play`);
      await expect(page.locator(".mg-ov")).toContainText(/all the play time for today/i, { timeout: 15_000 });
      const src = await page.locator("#game-frame").getAttribute("src");
      expect(src === null || src === "" || src === "about:blank", `game loaded anyway: ${src}`).toBe(true);
    });
  });
}
