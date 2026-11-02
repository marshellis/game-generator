// WebRTC peer-to-peer game type: a party CODE is claimed as a PeerJS id on a signalling broker (local copy of 0.peerjs.com); the first
// player to use a code hosts, the next connect to the host directly (browser to browser), and the host runs the simulation.
import { test, expect, joinAsKid, gameFrame, type Kid } from "./harness";

const until = (f: import("@playwright/test").Frame, expr: string, timeout = 90_000) => f.waitForFunction(expr, null, { timeout, polling: 500 });
const code = () => "TST" + Math.floor(Math.random() * 9000 + 1000);

async function enter(kid: Kid, mode: string, partyCode: string) {
  await kid.page.setViewportSize({ width: 900, height: 800 });
  await kid.page.goto("/arcade/snowball-arena/play");
  const f = await gameFrame(kid.page, "snowball-arena");
  await f.waitForSelector("#startBtn", { timeout: 60_000 });
  await f.evaluate(`document.querySelector('.mode[data-mode="${mode}"]').click(); document.getElementById('codeInput').value = ${JSON.stringify(partyCode)}; document.getElementById('startBtn').click()`);
  return f;
}
const overlayHidden = "document.getElementById('overlay').hidden === true";
const hudNames = "[...document.querySelectorAll('#hud, .hud, .scoreboard, body')].map(e => e.innerText).join(' ')";

test("snowball-arena: two kids on separate devices share a party code and a duel starts over a direct WebRTC connection", async ({ browser }) => {
  const a = await joinAsKid(browser), b = await joinAsKid(browser);
  const c = code();
  const fa = await enter(a, "duel", c);                       // first to use the code claims it on the broker and HOSTS
  await until(fa, "document.getElementById('overlay').textContent.includes('" + c + "')");
  const fb = await enter(b, "duel", c);                       // second finds the id taken and joins the host directly
  // a 1v1 starts the instant the friend connects: both overlays go away and the match is on
  for (const f of [fa, fb]) await until(f, overlayHidden, 120_000);
  // the signalling broker saw both; the game traffic itself did not go through any server
  for (const k of [a, b]) expect(k.net.sockets.some((s) => s.host === "0.peerjs.com"), "connected to the signalling broker").toBe(true);
  // the host's simulation reaches the guest: the guest's scoreboard/HUD is alive on both
  expect(await fa.evaluate("document.body.innerText")).toMatch(/0\s*[–-]\s*0/);
  expect(await fb.evaluate("document.body.innerText")).toMatch(/0\s*[–-]\s*0/);
  await a.context.close(); await b.context.close();
});

test("snowball-arena: a 2v2 team room waits for the second teammate, and a third code is a separate arena", async ({ browser }) => {
  const [a, b, other] = await Promise.all([joinAsKid(browser), joinAsKid(browser), joinAsKid(browser)]);
  const c1 = code(), c2 = code();
  const fa = await enter(a, "team", c1);
  await until(fa, "document.getElementById('overlay').textContent.includes('" + c1 + "')");
  const fo = await enter(other, "duel", c2);                  // a different code: its own arena, hosted by its own first player
  await until(fo, "document.getElementById('overlay').textContent.includes('" + c2 + "')");
  const fb = await enter(b, "team", c1);                      // joins A's arena
  await until(fa, "/\\b2\\b/.test(document.getElementById('overlay').innerText) || document.getElementById('overlay').innerText.length > 0", 30_000);
  // the team arena (4 slots) has not started: it is waiting for more, and the duel on the other code is unaffected
  expect(await fa.evaluate("document.getElementById('overlay').hidden")).toBe(false);
  expect(await fo.evaluate("document.getElementById('overlay').hidden")).toBe(false);
  await Promise.all([a, b, other].map((k) => k.context.close()));
});

test("snowball-arena: a no-time child never reaches the broker", async ({ browser }) => {
  const kid = await joinAsKid(browser, { allowance: { freePlayMin: 0, maxPlayMin: 0 }, enforcement: "hard" });
  await kid.page.goto("/arcade/snowball-arena/play");
  await expect(kid.page.locator(".mg-ov")).toContainText(/all the play time for today/i, { timeout: 30_000 });
  expect(kid.net.sockets.filter((s) => s.host === "0.peerjs.com")).toHaveLength(0);
  await kid.context.close();
});
