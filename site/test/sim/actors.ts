// Actors: reusable behaviours built on a Browser. Scenarios read like stories:
//   const mum = await Parent.signup(world, "mum@x.com");
//   const kid = await mum.addChild("ava", 2017);   // kid is a Kid on its own browser (the child's device)
import { checkAnswer, type Item } from "../../src/lib/family/questions";
import { PARENT_COOKIE, HOUSEHOLD_COOKIE } from "../../src/lib/family/accounts";
import { entKey } from "../../src/lib/family/plans";
import type { Browser, World } from "./world";

export const PASSWORD = "correct horse battery staple";

export class Parent {
  constructor(readonly world: World, readonly b: Browser, readonly email: string) {}
  static async signup(world: World, email = "parent@example.com", password = PASSWORD): Promise<Parent> {
    const b = world.browser();
    const r = await b.post("/api/family/parent/signup", { email, password, consent: true, householdName: "Sim family" });
    if (!r.ok) throw new Error(`signup failed: ${JSON.stringify(r.json)}`);
    return new Parent(world, b, email);
  }
  /** Put the household on the Family plan (what a successful Stripe checkout would write). */
  async upgrade() {
    const hh = (await this.household()).json.household.id;
    await this.world.kv.set(entKey(hh), { plan: "family", status: "active", source: "manual", currentPeriodEnd: this.world.now + 365 * 86400_000, updatedAt: this.world.now });
  }
  async login(password = PASSWORD) { return this.b.post("/api/family/parent/login", { email: this.email, password }); }
  lock() { return this.b.post("/api/family/parent/lock"); }
  settings(username: string, settings: object) { return this.b.patch(`/api/family/profiles/${username}`, { settings }); }
  /** Create a managed child and hand back that child's own device, already switched to them. */
  async addChild(nickname: string, birthYear = 2017, settings?: object): Promise<Kid> {
    const r = await this.b.post("/api/family/profiles", { nickname, birthYear });
    if (!r.ok) throw new Error(`addChild failed: ${JSON.stringify(r.json)}`);
    if (settings) await this.settings(nickname, settings);
    return this.handDevice(nickname);
  }
  /** The kid's device: shares the household cookie (a linked device) but NOT the parent unlock. */
  async handDevice(nickname: string): Promise<Kid> {
    const dev = this.world.browser();
    const hh = this.b.cookie(HOUSEHOLD_COOKIE);
    if (hh) dev.setCookie(HOUSEHOLD_COOKIE, hh);
    const kid = new Kid(this.world, dev, nickname);
    const r = await dev.post("/api/family/switch", { username: nickname });
    if (!r.ok) throw new Error(`switch failed: ${JSON.stringify(r.json)}`);
    return kid;
  }
  household() { return this.b.get("/api/family/household"); }
  hasParentUnlock() { return !!this.b.cookie(PARENT_COOKIE); }
}

export class Kid {
  /** Items the server has served and not yet answered, so an "honest" kid can answer correctly. */
  items: Item[] = [];
  constructor(readonly world: World, readonly b: Browser, readonly name: string) {}
  status() { return this.b.get("/api/family/play/status").then((r) => r.json); }
  /** Play for `sec` seconds the way the SDK does: a tick every 15s, then advance the world clock. */
  private primed = false;
  async play(sec: number) {
    // The server credits at most 10s for a first/stale tick; a real session is primed by its first tick.
    if (!this.primed) { await this.b.post("/api/family/play/tick", { seconds: 0 }); this.primed = true; }
    let left = sec;
    while (left > 0) {
      const step = Math.min(15, left);
      this.world.advance(step * 1000);
      await this.b.post("/api/family/play/tick", { seconds: step });
      left -= step;
    }
  }
  async roundEnded() { return this.b.post("/api/family/play/tick", { seconds: 0, round: true }); }
  /** Answer one learning break. `accuracy` 1 = always right. Returns how many were answered correctly. */
  async learn(count = 3, accuracy = 1, pick: () => number = () => 0): Promise<number> {
    const r = await this.b.get(`/api/family/learn/next?count=${count}`);
    if (!r.ok) return 0;
    let right = 0;
    for (const it of r.json.items as Item[]) {
      const good = it.choices.find((c) => checkAnswer(this.world.secret, it.id, it.token, c))!;
      const bad = it.choices.find((c) => c !== good)!;
      const choice = pick() < accuracy ? good : bad;
      const a = await this.b.post("/api/family/learn/answer", { id: it.id, token: it.token, choice });
      if (a.json?.correct) right++;
    }
    return right;
  }
  /** Reports a finished puzzle the way a game page does. */
  reportPuzzle(game: string, puzzleId: string) { return this.b.post("/api/family/learn/report", { game, puzzleId }); }
  score(game: string, score: number) { return this.b.post("/api/scores", { game, score }); }
}

/** A kid who knows how to use devtools: calls the API directly instead of through the SDK. */
export class Cheater extends Kid {
  /** Report a lot of "finished puzzles" with fresh ids. */
  async farmPuzzles(game: string, n: number) { const out = []; for (let i = 0; i < n; i++) out.push(await this.reportPuzzle(game, `farm-${i}`)); return out; }
  /** Skip the SDK's clock entirely (never tick) and just keep playing. */
  async playWithoutTicks(sec: number) { this.world.advance(sec * 1000); }
  /** Claim huge elapsed time or negative time in a tick. */
  tickClaim(seconds: number) { return this.b.post("/api/family/play/tick", { seconds }); }
}
