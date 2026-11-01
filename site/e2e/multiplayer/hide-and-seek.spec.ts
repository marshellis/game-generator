import { test, expect, joinAsKid, gameFrame, passClaims } from "./harness";

test("hide-and-seek: two kids on separate devices meet in one real room, with real passes", async ({ browser }) => {
  const a = await joinAsKid(browser), b = await joinAsKid(browser);
  for (const k of [a, b]) await k.page.goto("/arcade/hide-and-seek/play");
  const [fa, fb] = [await gameFrame(a.page, "hide-and-seek"), await gameFrame(b.page, "hide-and-seek")];

  // both connect to the (local, real) server with a signed pass
  for (const f of [fa, fb]) await f.waitForFunction("typeof Net !== 'undefined' && Net.connected === true", null, { timeout: 90_000, polling: 500 });
  for (const k of [a, b]) {
    const s = k.net.sockets.find((x) => x.host.startsWith("hide-and-seek"))!;
    expect(s, "the game opened its socket").toBeTruthy();
    const claims = passClaims(s.query.get("pass")!);
    expect(claims.u).toBe(k.fam.child);        // the server was told who this really is
    expect(claims.room).toBe("hide-and-seek");
  }

  // both are in the same lobby and see each other
  for (const f of [fa, fb]) await f.waitForFunction("Net.lobby.players.length >= 2", null, { timeout: 90_000, polling: 500 });
  const lobbyA = await fa.evaluate("JSON.parse(JSON.stringify(Net.lobby))") as { players: { id: string; name?: string }[] };
  console.log("lobby as seen by A:", JSON.stringify(lobbyA).slice(0, 400));
  expect(lobbyA.players.length).toBe(2);
  expect((await fb.evaluate("Net.lobby.players.length"))).toBe(2);
  await a.context.close(); await b.context.close();
});

test("hide-and-seek: when a kid leaves, the other sees them go", async ({ browser }) => {
  const a = await joinAsKid(browser), b = await joinAsKid(browser);
  for (const k of [a, b]) await k.page.goto("/arcade/hide-and-seek/play");
  const [fa, fb] = [await gameFrame(a.page, "hide-and-seek"), await gameFrame(b.page, "hide-and-seek")];
  for (const f of [fa, fb]) await f.waitForFunction("typeof Net !== 'undefined' && Net.lobby.players.length >= 2", null, { timeout: 90_000, polling: 500 });
  await b.context.close();                                   // kid B closes the tab / loses connection
  await fa.waitForFunction("Net.lobby.players.length === 1", null, { timeout: 60_000, polling: 500 });
  expect(await fa.evaluate("Net.lobby.players.length")).toBe(1);
  await a.context.close();
});

test("hide-and-seek: a parent's time limit reaches the room - the server drops the child when their pass runs out", async ({ browser }) => {
  test.setTimeout(240_000);
  const kid = await joinAsKid(browser, { allowance: { freePlayMin: 1, maxPlayMin: 1 }, enforcement: "hard" });
  await kid.page.goto("/arcade/hide-and-seek/play");
  const f = await gameFrame(kid.page, "hide-and-seek");
  await f.waitForFunction("typeof Net !== 'undefined' && Net.connected === true", null, { timeout: 90_000, polling: 500 });
  const sock = kid.net.sockets.find((s) => s.host.startsWith("hide-and-seek"))!;
  const claims = passClaims(sock.query.get("pass")!);
  expect(claims.exp * 1000 - Date.now()).toBeLessThanOrEqual(61_000);   // the pass is as short as the time the child has left
  // ...and when it expires the SERVER closes the connection (not the game: a game could ignore a limit, a server cannot be asked to)
  await expect.poll(() => sock.open, { timeout: 120_000, intervals: [1000] }).toBe(false);
  await f.waitForFunction("Net.connected === false", null, { timeout: 30_000, polling: 500 });
  await kid.context.close();
});
