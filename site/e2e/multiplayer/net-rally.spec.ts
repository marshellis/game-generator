// WebRTC co-op: one kid hosts and shows a code, a friend types it, the rally starts the moment they connect (needs both to be signed in).
import { test, expect, joinAsKid, gameFrame, type Kid } from "./harness";

const until = (f: import("@playwright/test").Frame, expr: string, timeout = 90_000) => f.waitForFunction(expr, null, { timeout, polling: 500 });
const click = (f: import("@playwright/test").Frame, id: string) => f.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
const menuText = (f: import("@playwright/test").Frame) => f.evaluate("document.getElementById('menu').innerText") as Promise<string>;

async function open(kid: Kid) {
  await kid.page.setViewportSize({ width: 900, height: 800 });
  await kid.page.goto("/arcade/net-rally/play");
  const f = await gameFrame(kid.page, "net-rally");
  await until(f, "!!document.getElementById('mFriend') && !document.getElementById('mFriend').disabled");   // enabled only once the game knows who this kid is
  await click(f, "mFriend");
  return f;
}

test("net-rally: one kid hosts a rally, a friend joins by code, both are in the same game over a direct connection", async ({ browser }) => {
  const a = await joinAsKid(browser), b = await joinAsKid(browser);
  const fa = await open(a), fb = await open(b);
  await click(fa, "hostBtn");
  await until(fa, "!!document.querySelector('.code-box') && document.querySelector('.code-box').innerText.trim().length >= 3");
  const code = ((await fa.evaluate("document.querySelector('.code-box').innerText")) as string).trim();
  expect(code).toMatch(/^[A-Z0-9]{3,6}$/);

  await click(fb, "joinBtn");
  await until(fb, "!!document.getElementById('codeInput')");
  await fb.evaluate(`document.getElementById('codeInput').value = ${JSON.stringify(code)}; document.getElementById('goJoin').click()`);

  // The rally starts the moment they connect and, with nobody playing, ends on its own ("Missed it"). The end screen names the partner:
  // each side shows the OTHER kid's real nickname, which only arrives through the direct WebRTC channel.
  const over = (name: string) => `/RALLY WITH ${name.toUpperCase()}/.test(document.getElementById('menu').innerText)`;
  await a.page.waitForTimeout(20_000);
  console.log("A menu:", JSON.stringify(await menuText(fa)), "| B menu:", JSON.stringify(await menuText(fb)), "| want", a.fam.child, b.fam.child);
  await until(fa, over(b.fam.child), 150_000);
  await until(fb, over(a.fam.child), 150_000);
  expect(a.net.sockets.some((s) => s.host === "0.peerjs.com")).toBe(true);     // they found each other through the signalling broker...
  expect(b.net.sockets.some((s) => s.host === "0.peerjs.com")).toBe(true);     // ...and the game traffic itself was direct browser-to-browser
  await a.context.close(); await b.context.close();
});

test("net-rally: a wrong code is refused with a message instead of hanging", async ({ browser }) => {
  const b = await joinAsKid(browser);
  const fb = await open(b);
  await click(fb, "joinBtn");
  await until(fb, "!!document.getElementById('codeInput')");
  await fb.evaluate(`document.getElementById('codeInput').value = 'ZZZZZ'; document.getElementById('goJoin').click()`);
  await until(fb, "!!document.querySelector('.menu-err') || /not|couldn|no game|can.?t/i.test(document.getElementById('menu').innerText)", 60_000);
  await b.context.close();
});
