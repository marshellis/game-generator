// WebRTC co-op with a host-authoritative simulation: the host runs the world, the guest streams aim/fire and renders the host's state.
import { test, expect, joinAsKid, gameFrame, type Kid } from "./harness";

const until = (f: import("@playwright/test").Frame, expr: string, timeout = 120_000) => f.waitForFunction(expr, null, { timeout, polling: 500 });
const click = (f: import("@playwright/test").Frame, id: string) => f.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);

async function open(kid: Kid) {
  await kid.page.setViewportSize({ width: 900, height: 800 });
  await kid.page.goto("/arcade/ragdoll-siege/play");
  const f = await gameFrame(kid.page, "ragdoll-siege");
  await until(f, "!!document.getElementById('coopBtn') && !document.getElementById('coopBtn').disabled", 90_000);   // co-op needs the game to know who the kid is
  await click(f, "coopBtn");
  return f;
}

test("ragdoll-siege: one kid hosts a room, a friend joins by code, both are in the same co-op world", async ({ browser }) => {
  const a = await joinAsKid(browser), b = await joinAsKid(browser);
  const fa = await open(a), fb = await open(b);
  await click(fa, "hostBtn");
  await until(fa, "/^[A-Z0-9]{3,6}$/.test(document.getElementById('lobbyCode').innerText.trim())", 90_000);
  const code = ((await fa.evaluate("document.getElementById('lobbyCode').innerText")) as string).trim();

  await fb.evaluate(`document.getElementById('codeInput').value = ${JSON.stringify(code)}; document.getElementById('joinBtn').click()`);
  // the lobby closes on both sides when the world starts
  await until(fa, "document.getElementById('lobby').hidden === true");
  await until(fb, "document.getElementById('lobby').hidden === true");
  // both are on the signalling broker; the world itself is exchanged directly between the two browsers
  for (const k of [a, b]) expect(k.net.sockets.some((s) => s.host === "0.peerjs.com")).toBe(true);
  await a.context.close(); await b.context.close();
});

test("ragdoll-siege: a no-time child never reaches the broker", async ({ browser }) => {
  const kid = await joinAsKid(browser, { allowance: { freePlayMin: 0, maxPlayMin: 0 }, enforcement: "hard" });
  await kid.page.goto("/arcade/ragdoll-siege/play");
  await expect(kid.page.locator(".mg-ov")).toContainText(/all the play time for today/i, { timeout: 30_000 });
  expect(kid.net.sockets.filter((s) => s.host === "0.peerjs.com")).toHaveLength(0);
  await kid.context.close();
});
