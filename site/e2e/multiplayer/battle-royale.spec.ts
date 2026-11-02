// Colyseus game type: matchmaking by party code -> a lobby -> the leader starts a match -> everyone is seated in the same room.
import { test, expect, joinAsKid, gameFrame, type Kid } from "./harness";

const FRAME = "battle-royale";
const until = (f: import("@playwright/test").Frame, expr: string, timeout = 90_000) => f.waitForFunction(expr, null, { timeout, polling: 500 });
const click = (f: import("@playwright/test").Frame, id: string) => f.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);

async function open(kid: Kid) {
  await kid.page.goto(`/arcade/${FRAME}/play`);
  const f = await gameFrame(kid.page, FRAME);
  await until(f, "!!document.getElementById('btnParty')");
  await click(f, "btnParty");
  return f;
}

async function partyOfTwo(browser: import("@playwright/test").Browser) {
  const a = await joinAsKid(browser), b = await joinAsKid(browser);
  const fa = await open(a), fb = await open(b);
  await click(fa, "btnCreateParty");
  await until(fa, "document.getElementById('partyCodeDisplay') && document.getElementById('partyCodeDisplay').textContent.trim().length >= 4");
  const code = (await fa.evaluate("document.getElementById('partyCodeDisplay').textContent.trim()")) as string;
  await fb.evaluate(`document.getElementById('joinCodeInput').value = ${JSON.stringify(code)}`);
  await click(fb, "btnJoinParty");
  for (const f of [fa, fb]) await until(f, "document.querySelectorAll('#partyMemberList li').length === 2");
  return { a, b, fa, fb, code };
}

test("battle-royale: a kid creates a party, a friend joins by its code, both are listed by their real nicknames", async ({ browser }) => {
  const { a, b, fa, fb, code } = await partyOfTwo(browser);
  expect(code).toMatch(/^[A-Z0-9]{4,6}$/);
  for (const f of [fa, fb]) {
    const names = (await f.evaluate("[...document.querySelectorAll('#partyMemberList li')].map(li => li.textContent.replace('★ ', '').trim())")) as string[];
    expect(names.sort()).toEqual([a.fam.child, b.fam.child].sort());   // the server took the names from the signed passes
  }
  await a.context.close(); await b.context.close();
});

test("battle-royale: the party leader starts the match and both kids are seated in the same match room", async ({ browser }) => {
  const { a, b, fa, fb } = await partyOfTwo(browser);
  await click(fa, "btnStartMatch");
  for (const f of [fa, fb]) await until(f, "typeof matchClient !== 'undefined' && matchClient && matchClient.sessionId && state.partyMatch === true", 120_000);
  const ids = await Promise.all([fa, fb].map((f) => f.evaluate("matchClient.roomId") as Promise<string>));
  expect(ids[0]).toBeTruthy();
  expect(ids[0]).toBe(ids[1]);                                       // one shared room, not two separate ones
  // the server holds both kids as players (bots fill the rest)
  for (const f of [fa, fb]) await until(f, "matchClient.state.players && matchClient.state.players.size >= 2", 60_000);
  await a.context.close(); await b.context.close();
});

test("battle-royale: someone leaving the party is seen by the rest", async ({ browser }) => {
  const { a, b, fa, fb } = await partyOfTwo(browser);
  await click(fb, "btnLeaveParty");
  await until(fa, "document.querySelectorAll('#partyMemberList li').length === 1");
  await a.context.close(); await b.context.close();
});

test("battle-royale: a child with no play time left is turned away before reaching the lobby", async ({ browser }) => {
  const kid = await joinAsKid(browser, { allowance: { freePlayMin: 0, maxPlayMin: 0 }, enforcement: "hard" });
  await kid.page.goto(`/arcade/${FRAME}/play`);
  await expect(kid.page.locator(".mg-ov")).toContainText(/all the play time for today/i, { timeout: 30_000 });
  expect(kid.net.sockets.length).toBe(0);           // no connection to any game server was ever opened
  await kid.context.close();
});
