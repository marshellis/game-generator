// A fake browser tab (jsdom) running the REAL SDK against the REAL handlers, with manual time.
//   const tab = openTab(world, browser, { html });
//   tab.fire(15)           // run every setInterval due in the next 15 world-seconds, advancing the clock
// Timers and Date.now both follow the world clock, so a 90-minute play session simulates in milliseconds.
import fs from "node:fs";
import { JSDOM } from "jsdom";
import type { Browser, World } from "./world";

const sdkSrc = fs.readFileSync(new URL("../../public/arcade/_sdk/marshellis.js", import.meta.url), "utf8");
export const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export interface Tab { w: any; doc: Document; fire(sec: number): Promise<void>; sdk(opts: object): any; close(): void }

export function openTab(world: World, browser: Browser, o: { html?: string; url?: string; parent?: Tab } = {}): Tab {
  const dom = new JSDOM(o.html ?? "<body></body>", { url: o.url ?? "https://games.marshellis.com/arcade/x/play", runScripts: "outside-only", pretendToBeVisual: true });
  const w: any = dom.window;
  const timers: { id: number; every: number; next: number; fn: () => void }[] = [];
  let nid = 1;
  w.Date.now = () => world.now;
  w.setInterval = (fn: () => void, every: number) => { const t = { id: nid++, every, next: world.now + every, fn }; timers.push(t); return t.id; };
  w.clearInterval = (id: number) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  w.fetch = async (url: string, init: any = {}) => {
    const r = await browser.request(init.method ?? "GET", url, init.body ? JSON.parse(init.body) : undefined);
    return { ok: r.ok, status: r.status, json: async () => r.json };
  };
  w.prompt = () => null; w.alert = () => {};
  if (o.parent) Object.defineProperty(w, "parent", { value: o.parent.w });
  w.eval(sdkSrc);
  return {
    w, doc: w.document,
    sdk: (opts: object) => w.Marshellis.init(opts),
    async fire(sec: number) {
      const end = world.now + sec * 1000;
      for (;;) {
        const due = timers.filter((t) => t.next <= end).sort((a, b) => a.next - b.next)[0];
        if (!due) break;
        world.setTime(Math.max(world.now, due.next)); due.next += due.every;
        due.fn(); await flush(5);
      }
      world.setTime(end); await flush(5);
    },
    close() { dom.window.close(); },
  };
}
