// Real-browser smoke test against a deployed site (read-only: guest only, creates nothing).
//   cd site && npx --yes -p playwright node e2e/live-smoke.mjs [https://games.marshellis.com]
// (first time: npx playwright install chromium). Exit code 1 on any failed check. Complements the jsdom sim:
// the sim proves the logic, this proves the real browser/CSP/cross-origin plumbing on the real deployment.
import { chromium, firefox, webkit } from "playwright";

const BASE = process.argv[2] ?? "https://games.marshellis.com";
const SLUGS = ["flappy", "bounce", "hex-collapse"]; // SDK game + two compat-shim games
let failed = 0;
const check = (ok, what, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? "  — " + extra : ""}`); if (!ok) failed++; };

// BROWSER=webkit exercises the Safari engine (iPhone/iPad/Mac), firefox the Gecko one. Default chromium.
const engine = { chromium, firefox, webkit }[process.env.BROWSER ?? "chromium"];
const browser = await engine.launch();
for (const slug of SLUGS) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const problems = []; let errorsBeforeProbe;
  page.on("console", (m) => { if (m.type() === "error" && /refused|csp|blocked|cors/i.test(m.text())) problems.push(m.text().slice(0, 140)); });
  // Headless CI browsers have no GPU: a 3D game failing to create a WebGL context is the environment, not the site.
  page.on("pageerror", (e) => { if (!/WebGL context/i.test(e.message)) problems.push("pageerror: " + e.message.slice(0, 120)); });
  await page.goto(`${BASE}/arcade/${slug}/play`, { waitUntil: "load" });
  await page.waitForSelector("#game-frame", { timeout: 10000 });
  await page.waitForFunction(() => { const f = document.getElementById("game-frame"); return f && f.src && f.src !== "about:blank" && !!f.src; }, null, { timeout: 15000 });
  const src = await page.$eval("#game-frame", (f) => f.src);
  const findFrame = () => page.frames().find((f) => f.url().includes(`/arcade/${slug}/index.html`));
  for (let i = 0; i < 40 && !findFrame(); i++) await page.waitForTimeout(250);
  const frame = findFrame();
  await page.waitForTimeout(2500);
  const isolated = new URL(src).origin !== new URL(BASE).origin;
  check(!!frame, `${slug}: game frame loaded (frame-ancestors lets the wrapper embed it)`, src);
  if (process.env.EXPECT_ISOLATED !== "0") check(isolated, `${slug}: game runs on a different origin than the site`, new URL(src).origin);
  if (frame && isolated) {
    // The platform works THROUGH the relay: a guest can read a leaderboard (SDK games draw it; compat games fetch it).
    if (slug === "flappy") {
      const drawn = await frame.waitForFunction(() => /Global leaderboard/.test(document.body.innerText), null, { timeout: 8000 }).then(() => true, () => false);
      check(drawn, `${slug}: SDK drew the leaderboard through the host relay`);
    } else {
      const lb = await frame.evaluate(async (g) => { const r = await fetch(`/api/leaderboard?game=${g}&limit=3`); return { status: r.status, json: await r.json().catch(() => null) }; }, slug);
      check(lb.status === 200 && Array.isArray(lb.json?.top), `${slug}: compat shim relays fetch('/api/leaderboard')`, `status ${lb.status}`);
    }
    errorsBeforeProbe = problems.length;
    const probe = await frame.evaluate(async (base) => {
      const get = async (u, o) => { try { const r = await fetch(u, o); return r.status; } catch (e) { return "blocked"; } };
      return {
        cookie: document.cookie,
        household: await get("/api/family/household"),
        crossPost: await get(base + "/api/scores", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
        crossCancel: await get(base + "/api/family/billing/cancel", { method: "POST", credentials: "include" }),
      };
    }, BASE);
    check(probe.cookie === "", `${slug}: game sees no cookies`);
    check(probe.household !== 200, `${slug}: game cannot read the family API directly`, `status ${probe.household}`);
    check(probe.crossPost === "blocked" || probe.crossPost >= 400, `${slug}: game cannot POST to the site cross-origin`, `${probe.crossPost}`);
    check(probe.crossCancel === "blocked" || probe.crossCancel >= 400, `${slug}: game cannot hit billing cross-origin`, `${probe.crossCancel}`);
  }
  // (the console errors our own attack probes provoke are the EXPECTED outcome, so only count earlier ones)
  const unexpected = problems.slice(0, typeof errorsBeforeProbe === "number" ? errorsBeforeProbe : problems.length);
  check(unexpected.length === 0, `${slug}: no unexpected CSP/CORS/page errors`, unexpected.join(" | "));
  await ctx.close();
}
// the arcade index and the family page still work on the main origin
const ctx = await browser.newContext(); const page = await ctx.newPage();
const idx = await page.goto(`${BASE}/arcade`); check(idx.status() === 200, "arcade index 200");
const fam = await page.goto(`${BASE}/family`); check(fam.status() === 200, "family page 200");
const hdr = (await page.goto(`${BASE}/`)).headers();
check(/frame-ancestors 'self'/.test(hdr["content-security-policy"] ?? ""), "site sends frame-ancestors 'self'");
await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
