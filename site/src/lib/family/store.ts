// The app store: outside publishers submit games, a reviewer approves them, approved games are listed.
//
// Safety model (why this is safe to open up gradually):
//  - Publishing needs a parent account on a plan with the `publishing` feature (Family).
//  - Every game is reviewed before it is listed; nothing goes live on submit.
//  - Games run in a sandboxed iframe WITHOUT allow-same-origin: they cannot read our cookies,
//    storage or the child's account. They get only what the host bridge (host-bridge.js) hands them:
//    nickname/avatar, a score channel and the play-time gate.
//  - A game may only embed from https hosts; age rating is required and shown to parents.
//  - The first phase is invite-only: STORE_INVITE_ONLY (default on) limits publishing to emails in STORE_PUBLISHER_EMAILS.
import { randomBytes } from "node:crypto";
import type { FamilyDeps, FamilyResult } from "./accounts";
import { parentFrom } from "./accounts";
import { featuresFor } from "./plans";
import { register, type Req } from "./router";

export type Status = "submitted" | "approved" | "rejected" | "withdrawn";
export interface Submission {
  id: string; publisherHousehold: string; publisherEmail: string; slug: string; title: string; description: string;
  url: string; minAge: number; categories: string[]; status: Status; notes?: string; createdAt: number; reviewedAt?: number;
}
const err = (status: number, error: string): FamilyResult => ({ status, json: { error } });
const subKey = (id: string) => `store:sub:${id}`;
const INDEX = "store:index"; // JSON array of submission ids (small; fine for a family-scale store)

const env = (k: string) => process.env[k] ?? "";
const csv = (k: string) => env(k).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const isAdmin = (email: string) => csv("STORE_ADMIN_EMAILS").includes(email.toLowerCase());

export const CATEGORIES = ["puzzle", "action", "arcade", "strategy", "learning", "creative", "multiplayer"];
export function validateSubmission(b: Record<string, unknown>): { ok: true; v: Pick<Submission, "slug" | "title" | "description" | "url" | "minAge" | "categories"> } | { ok: false; error: string } {
  const slug = String(b.slug ?? "").toLowerCase(), title = String(b.title ?? "").trim(), description = String(b.description ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) return { ok: false, error: "invalid-slug" };
  if (title.length < 2 || title.length > 60) return { ok: false, error: "invalid-title" };
  if (description.length < 10 || description.length > 500) return { ok: false, error: "invalid-description" };
  let url: URL; try { url = new URL(String(b.url)); } catch { return { ok: false, error: "invalid-url" }; }
  if (url.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname)) return { ok: false, error: "invalid-url" };
  const minAge = Number(b.minAge);
  if (![3, 5, 7, 10, 13].includes(minAge)) return { ok: false, error: "invalid-age-rating" };
  const categories = (Array.isArray(b.categories) ? b.categories : []).map(String).filter((c) => CATEGORIES.includes(c)).slice(0, 3);
  if (!categories.length) return { ok: false, error: "invalid-category" };
  return { ok: true, v: { slug, title, description, url: url.toString(), minAge, categories } };
}

async function index(d: FamilyDeps): Promise<string[]> { return (await d.kv.get<string[]>(INDEX)) ?? []; }
async function all(d: FamilyDeps): Promise<Submission[]> { return (await Promise.all((await index(d)).map((id) => d.kv.get<Submission>(subKey(id))))).filter(Boolean) as Submission[]; }

export async function submit(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const p = await parentFrom(r.tokens, d);
  if (!p) return err(401, "parent-required");
  if (env("STORE_INVITE_ONLY") !== "off" && !csv("STORE_PUBLISHER_EMAILS").includes(p.email)) return err(403, "invite-only");
  if (!(await featuresFor(d.kv, p.householdId, d.now)).publishing) return err(402, "plan-required");
  const v = validateSubmission(r.body);
  if (!v.ok) return err(400, v.error);
  const existing = await all(d);
  if (existing.some((s) => s.slug === v.v.slug && s.status !== "rejected" && s.status !== "withdrawn" && s.publisherHousehold !== p.householdId)) return err(409, "slug-taken");
  const sub: Submission = { ...v.v, id: randomBytes(6).toString("hex"), publisherHousehold: p.householdId, publisherEmail: p.email, status: "submitted", createdAt: d.now };
  await d.kv.set(subKey(sub.id), sub);
  await d.kv.set(INDEX, [...(await index(d)), sub.id]);
  return { status: 201, json: { id: sub.id, status: sub.status } };
}

export async function mine(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const p = await parentFrom(r.tokens, d);
  if (!p) return err(401, "parent-required");
  return { status: 200, json: { submissions: (await all(d)).filter((s) => s.publisherHousehold === p.householdId) } };
}

export async function queue(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const p = await parentFrom(r.tokens, d);
  if (!p || !isAdmin(p.email)) return err(403, "forbidden");
  return { status: 200, json: { submissions: (await all(d)).filter((s) => s.status === "submitted") } };
}

export async function review(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const p = await parentFrom(r.tokens, d);
  if (!p || !isAdmin(p.email)) return err(403, "forbidden");
  const s = await d.kv.get<Submission>(subKey(String(r.body.id ?? "")));
  if (!s) return err(404, "not-found");
  const decision = r.body.decision;
  if (decision !== "approved" && decision !== "rejected") return err(400, "invalid-decision");
  if (decision === "rejected" && !String(r.body.notes ?? "").trim()) return err(400, "notes-required"); // publishers deserve a reason
  const next: Submission = { ...s, status: decision, notes: String(r.body.notes ?? "").slice(0, 500), reviewedAt: d.now };
  await d.kv.set(subKey(s.id), next);
  return { status: 200, json: { id: s.id, status: next.status } };
}

/** Public listing: approved games only, never the publisher's email. */
export async function list(_r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const games = (await all(d)).filter((s) => s.status === "approved")
    .map(({ slug, title, description, url, minAge, categories }) => ({ slug, title, description, url, minAge, categories }));
  return { status: 200, json: { games } };
}

register({
  "POST store/submit": submit, "GET store/mine": mine, "GET store/queue": queue, "POST store/review": review, "GET store/games": list,
});
