// Colyseus + Phaser (canvas, keyboard menus): create a room with a code, a friend types the code, both are in the same server room.
import { test, expect, joinAsKid, gameFrame, colyseusRooms, virtualKid, colyseusJoin, type Kid } from "./harness";

const PORT = 2567;
async function open(kid: Kid) {
  await kid.page.setViewportSize({ width: 800, height: 1000 });   // tall enough that the game canvas is on screen to receive keystrokes
  await kid.page.goto("/arcade/galaga/play");
  const f = await gameFrame(kid.page, "galaga");
  await kid.page.waitForTimeout(6000);                     // Phaser boots and shows the menu
  await kid.page.locator("#game-frame").scrollIntoViewIfNeeded();
  await kid.page.frameLocator("#game-frame").locator("canvas").first().click({ force: true });   // focus the game so it gets keystrokes
  return f;
}

test("galaga: a real kid creates a room; friends (scripted players with real passes) fill it; the server holds them all and the kid can start", async ({ browser }) => {
  const a = await joinAsKid(browser);
  const before = (await colyseusRooms(PORT, "galaga")).map((r) => r.roomId);
  await open(a);
  await a.page.keyboard.press("c");                        // CREATE ROOM
  await a.page.waitForTimeout(500);
  await a.page.keyboard.press("Enter");                    // with the default mode (co-op, shared lives)
  await expect.poll(async () => (await colyseusRooms(PORT, "galaga")).filter((r) => !before.includes(r.roomId)).length, { timeout: 60_000, intervals: [1000] }).toBe(1);
  const room = (await colyseusRooms(PORT, "galaga")).find((r) => !before.includes(r.roomId))!;
  expect(String(room.metadata?.roomCode)).toMatch(/^[A-Z0-9]{6}$/);

  // three friends on other devices join with the code the kid reads out; each has their own family + pass
  const friends = await Promise.all([0, 1, 2].map(() => virtualKid(browser)));
  const joined = await Promise.all(friends.map(async (f) => colyseusJoin(PORT, room.roomId, await f.pass("galaga"))));
  await expect.poll(async () => (await colyseusRooms(PORT, "galaga")).find((r) => r.roomId === room.roomId)?.clients, { timeout: 30_000, intervals: [500] }).toBe(4);

  // the server knows everyone by their REAL nickname (taken from the signed pass, not typed by the browser)
  const names = (await Promise.all(joined.map(async (r) => { await new Promise((x) => setTimeout(x, 1500)); return [...r.state.players.values()].map((p: any) => p.displayName); })))[0]!;
  expect(names).toEqual(expect.arrayContaining([a.fam.child, ...friends.map((f) => f.fam.child)]));
  expect(new Set(names).size).toBe(4);

  // the host (the real kid, first in) starts the game: everyone's room moves to Playing
  await a.page.keyboard.press("Enter");
  await expect.poll(() => String(joined[0]!.state.phase), { timeout: 30_000, intervals: [500] }).toMatch(/playing/i);

  // a friend leaves mid-game: the others' view of the room shrinks (a started room is locked, so it no longer appears in the public list)
  expect(await colyseusRooms(PORT, "galaga").then((rs) => rs.some((r) => r.roomId === room.roomId))).toBe(false);
  await joined[2]!.leave();
  await expect.poll(() => joined[0]!.state.players.size, { timeout: 30_000, intervals: [500] }).toBe(3);
  await Promise.all(joined.slice(0, 2).map((r) => r.leave()));
  await a.context.close(); await Promise.all(friends.map((f) => f.context.close()));
});

test("galaga: a scripted player whose pass runs out is dropped by the SERVER (the parent's limit holds online)", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await joinAsKid(browser);
  const before = (await colyseusRooms(PORT, "galaga")).map((r) => r.roomId);
  await open(a);
  await a.page.keyboard.press("c"); await a.page.waitForTimeout(500); await a.page.keyboard.press("Enter");
  await expect.poll(async () => (await colyseusRooms(PORT, "galaga")).filter((r) => !before.includes(r.roomId)).length, { timeout: 60_000, intervals: [1000] }).toBe(1);
  const room = (await colyseusRooms(PORT, "galaga")).find((r) => !before.includes(r.roomId))!;
  const limited = await virtualKid(browser, { allowance: { freePlayMin: 1, maxPlayMin: 1 }, enforcement: "hard" });
  const r = await colyseusJoin(PORT, room.roomId, await limited.pass("galaga"));
  await expect.poll(() => r.leftWith, { timeout: 120_000, intervals: [1000] }).toBeDefined();   // dropped when the ~60s pass expired
  expect(r.leftWith).toBe(4003);
  await a.context.close(); await limited.context.close();
});

test("galaga: the room empties when the last kid leaves, and a no-time child never connects", async ({ browser }) => {
  const a = await joinAsKid(browser);
  const before = (await colyseusRooms(PORT, "galaga")).map((r) => r.roomId);
  await open(a);
  await a.page.keyboard.press("c"); await a.page.waitForTimeout(500); await a.page.keyboard.press("Enter");
  await expect.poll(async () => (await colyseusRooms(PORT, "galaga")).filter((r) => !before.includes(r.roomId)).length, { timeout: 60_000, intervals: [1000] }).toBe(1);
  await a.context.close();                                  // the kid closes the tab
  await expect.poll(async () => (await colyseusRooms(PORT, "galaga")).filter((r) => !before.includes(r.roomId)).length, { timeout: 60_000, intervals: [1000] }).toBe(0);

  const none = await joinAsKid(browser, { allowance: { freePlayMin: 0, maxPlayMin: 0 }, enforcement: "hard" });
  await none.page.goto("/arcade/galaga/play");
  await expect(none.page.locator(".mg-ov")).toContainText(/all the play time for today/i, { timeout: 30_000 });
  expect(none.net.sockets.length).toBe(0);
  await none.context.close();
});
