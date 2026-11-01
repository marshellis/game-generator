import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
import { checkAnswer } from "../src/lib/family/questions";

export const SESSION_SECRET = "e2e-session-secret-e2e-session-secret";
export const PASSWORD = "e2e correct horse battery";
export const ARCADE_DIR = path.resolve(HERE, "../public/arcade");
export const CONTENT_DIR = path.resolve(HERE, "../src/content");

export const arcadeSlugs = (): string[] =>
  fs.readdirSync(ARCADE_DIR, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name).sort();

let n = 0;
/** A name no other test uses: one in-memory server is shared by the whole run. */
export const uniq = (p: string) => `${p}${Date.now().toString(36).slice(-4)}${(n++).toString(36)}`.toLowerCase().slice(0, 18);

export interface Family { email: string; child: string; parent: APIRequestContext }

/** Create a parent + one managed child through the API (the UI path is covered in learning-flow.spec). */
export async function makeFamily(ctx: BrowserContext, opts: { settings?: object; birthYear?: number; plan?: "free" } = {}): Promise<Family> {
  const email = `${uniq("p")}@example.com`, child = uniq("kid");
  const r = ctx.request;
  const su = await r.post("/api/family/parent/signup", { data: { email, password: PASSWORD, consent: true, householdName: "E2E" } });
  expect(su.ok(), await su.text()).toBe(true);
  const add = await r.post("/api/family/profiles", { data: { nickname: child, birthYear: opts.birthYear ?? 2017 } });
  expect(add.ok(), await add.text()).toBe(true);
  if (opts.settings) expect((await r.patch(`/api/family/profiles/${child}`, { data: { settings: opts.settings } })).ok()).toBe(true);
  return { email, child, parent: r };
}

/** Hand the device to the kid: lock parent mode, switch profile. After this the context is the child. */
export async function becomeKid(ctx: BrowserContext, f: Family) {
  await ctx.request.post("/api/family/parent/lock");
  const sw = await ctx.request.post("/api/family/switch", { data: { username: f.child } });
  expect(sw.ok(), await sw.text()).toBe(true);
}

/** Remember every learning question the server hands this page, so a test can answer like a kid who knows the math. */
export function trackQuestions(page: Page) {
  const items: { id: string; token: string; prompt: string; choices: string[] }[] = [];
  page.on("response", async (res) => {
    if (res.url().includes("/api/family/learn/next") && res.ok()) {
      try { items.push(...(await res.json()).items); } catch { /* ignore */ }
    }
  });
  return items;
}

/** In an open learning-break overlay, answer the question on screen. `right` = pick the correct choice. */
export async function answerBreak(page: Page, items: ReturnType<typeof trackQuestions>, right: boolean) {
  const overlay = page.locator(".mg-ov");
  await expect(overlay.locator(".mg-q")).toBeVisible();
  const prompt = (await overlay.locator(".mg-q").innerText()).trim();
  const it = items.find((i) => i.prompt === prompt);
  expect(it, `no served item for prompt "${prompt}"`).toBeTruthy();
  const correct = it!.choices.find((c) => checkAnswer(SESSION_SECRET, it!.id, it!.token, c))!;
  const wrong = it!.choices.find((c) => c !== correct)!;
  await overlay.locator(".mg-ch button", { hasText: new RegExp(`^${(right ? correct : wrong).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click();
}

export async function status(ctx: BrowserContext) {
  return (await ctx.request.get("/api/family/play/status")).json();
}
