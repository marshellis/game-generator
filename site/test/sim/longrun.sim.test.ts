// Long-horizon, seeded simulations. Cheap to run (no real time), reproducible (SIM_SEED), and aimed at
// invariants rather than scripted outcomes. If one fails, re-run with the same SIM_SEED to replay it.
import { describe, it, expect } from "vitest";
import { createWorld, type Res } from "./world";
import { Parent, Cheater } from "./actors";
import { mulberry32 } from "../../src/lib/family/questions";

const SEED = Number(process.env.SIM_SEED ?? 20261031);
const LEAK = /pwHash|pinHash|scrypt\$|GAME_PASS_SECRET|sim-secret/;

/** Every response, from every actor, is checked for secret material as it happens. */
function leakGuard(w: ReturnType<typeof createWorld>) {
  w.tap = (m, url, r: Res) => { expect(JSON.stringify(r.json ?? null), `${m} ${url} leaked`).not.toMatch(LEAK); };
}

describe(`14 days of one family (seed ${SEED})`, () => {
  it("honest, idle and cheating kids all stay inside the parent's rules", async () => {
    const rand = mulberry32(SEED);
    const w = createWorld(); leakGuard(w);
    const mum = await Parent.signup(w, "mum@x.com");
    await mum.upgrade();
    const honest = await mum.addChild("honest", 2016, { allowance: { freePlayMin: 15, maxPlayMin: 45 }, mix: { preset: "balanced", questionsPerBreak: 3 } });
    const cheatKid = await mum.addChild("sneaky", 2015, { allowance: { freePlayMin: 10, maxPlayMin: 40 }, mix: { preset: "balanced", questionsPerBreak: 3 } });
    const cheat = new Cheater(w, cheatKid.b, "sneaky");
    const idle = await mum.addChild("idle", 2018, { allowance: { freePlayMin: 5, maxPlayMin: 20 } });

    for (let day = 0; day < 14; day++) {
      // Honest kid: play in rounds; when the gate says learn, answer ~80% right; stop at the cap.
      let st = await honest.status();
      for (let guard = 0; guard < 200 && (st.ok || st.reason === "learn"); guard++) {
        if (!st.ok) { await honest.learn(3, 0.8, rand); const n = await honest.status(); if (!n.ok && n.remainingSec === st.remainingSec) break; st = n; continue; }
        await honest.play(Math.min(st.remainingSec, 30 + Math.floor(rand() * 90)));
        await honest.roundEnded();
        st = await honest.status();
      }
      // Sneaky kid: farms puzzle completions, bursts ticks, and plays on anyway.
      await cheat.farmPuzzles("sudoku", 40 + Math.floor(rand() * 40));
      for (let i = 0; i < 30; i++) await cheat.tickClaim(30);
      await cheat.play(60);

      const hs = await honest.status(), ss = await cheat.status();
      expect(hs.remainingSec).toBeGreaterThanOrEqual(0);
      expect(ss.remainingSec).toBeGreaterThanOrEqual(0);
      expect(ss.remainingSec).toBeLessThanOrEqual(40 * 60); // farming can never push the budget past the cap
      w.advance(24 * 3600 * 1000); // next family day
    }
    // The allowance resets daily: the idle kid still has the full free time on day 15.
    expect((await idle.status()).remainingSec).toBe(5 * 60);
  });
});

describe(`API fuzz (seed ${SEED})`, () => {
  it("random calls from random states never crash, never 5xx, never leak a secret", async () => {
    const rand = mulberry32(SEED + 1);
    const w = createWorld(); leakGuard(w);
    const mum = await Parent.signup(w, "fuzz@x.com");
    const kid = await mum.addChild("fuzzy", 2017);
    await mum.b.post("/api/family/profiles", { nickname: "pinned", birthYear: 2016, pin: "1234" });
    const legacy = w.browser();
    await legacy.post("/api/auth/signup", { username: "legacy", pin: "9999" });
    const browsers = [mum.b, kid.b, w.browser(), legacy];

    const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
    const junk = () => pick<any>([undefined, null, "", "x", "../../etc/passwd", "<script>", -1, 0, 1.5, 1e21, NaN, "9".repeat(500), [], {}, { a: 1 }, true, "__proto__", "fuzzy", "pinned", "legacy"]);
    const routes: [string, string][] = [
      ["POST", "/api/family/parent/signup"], ["POST", "/api/family/parent/login"], ["POST", "/api/family/parent/lock"],
      ["GET", "/api/family/household"], ["GET", "/api/family/picker"], ["POST", "/api/family/switch"], ["POST", "/api/family/profiles"],
      ["POST", "/api/family/profiles/claim"], ["PATCH", "/api/family/profiles/fuzzy"], ["GET", "/api/family/profiles/fuzzy/export"],
      ["GET", "/api/family/profiles/fuzzy/progress"], ["DELETE", "/api/family/profiles/fuzzy"],
      ["GET", "/api/family/play/status"], ["POST", "/api/family/play/tick"], ["GET", "/api/family/learn/next"], ["POST", "/api/family/learn/answer"],
      ["POST", "/api/family/learn/report"], ["GET", "/api/family/me/progress"], ["GET", "/api/family/billing/subscription"],
      ["POST", "/api/family/billing/checkout"], ["POST", "/api/family/billing/cancel"], ["POST", "/api/family/billing/resume"],
      ["POST", "/api/family/billing/webhook/stripe"], ["POST", "/api/family/billing/webhook/revenuecat"], ["POST", "/api/family/pass"],
      ["POST", "/api/family/store/submit"], ["GET", "/api/family/store/mine"], ["GET", "/api/family/store/queue"], ["POST", "/api/family/store/review"], ["GET", "/api/family/store/games"],
      ["POST", "/api/auth/login"], ["POST", "/api/auth/signup"], ["POST", "/api/auth/logout"], ["GET", "/api/me"], ["GET", "/api/me/completions"], ["POST", "/api/me/completions"],
      ["GET", "/api/me/trophies"], ["POST", "/api/scores"], ["DELETE", "/api/scores"], ["GET", "/api/leaderboard?game=flappy&limit=abc"],
    ];
    const keys = ["email", "password", "username", "nickname", "pin", "birthYear", "game", "score", "partner", "id", "token", "choice", "seconds", "round", "settings", "puzzleId", "room", "consent", "interval", "decision", "notes", "grade", "slug"];
    const failures: string[] = [];
    for (let i = 0; i < 1500; i++) {
      const [m, url] = pick(routes);
      const body: Record<string, unknown> = {};
      for (let k = 0; k < Math.floor(rand() * 5); k++) body[pick(keys)] = junk();
      try {
        const r = await pick(browsers).request(m, url, m === "GET" ? undefined : body);
        if (r.status >= 500 && r.status !== 503) // 503 = a feature that is not configured (billing), a deliberate answer
          failures.push(`${m} ${url} ${JSON.stringify(body)} -> ${r.status}`);
      } catch (e) { failures.push(`${m} ${url} ${JSON.stringify(body)} threw ${(e as Error).message}`); }
      if (rand() < 0.02) w.advance(Math.floor(rand() * 3600) * 1000);
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });
});
