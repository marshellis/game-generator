import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { memoryKV } from "../src/lib/family/kv";
import * as A from "../src/lib/family/accounts";
import "../src/lib/family/register";
import { handle, type Req } from "../src/lib/family/router";
import { setFetch, verifyStripeSignature } from "../src/lib/family/billing";
import { effectivePlan, entKey, getEntitlement } from "../src/lib/family/plans";

const users = new Map<string, any>();
const store: any = { async getUser(u: string) { return users.get(u) ?? null; }, async createUser(u: string, r: any) { if (users.has(u)) return false; users.set(u, r); return true; } };
let d: A.FamilyDeps, parent: A.Tokens, hid: string, stripeCalls: { url: string; body: string; method: string }[];
const call = (method: string, path: string, body: object = {}, over: Partial<Req> = {}) =>
  handle({ method, path: path.split("/"), body: body as never, tokens: parent, query: {}, ...over }, d);

beforeEach(async () => {
  users.clear(); stripeCalls = [];
  process.env.STRIPE_SECRET_KEY = "sk"; process.env.STRIPE_PRICE_FAMILY_MONTHLY = "price_m"; process.env.STRIPE_PRICE_FAMILY_YEARLY = "price_y";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec"; process.env.REVENUECAT_WEBHOOK_SECRET = "rc";
  d = { kv: memoryKV(), store, secret: "sec", now: Date.UTC(2026, 9, 30) };
  const s = await A.signupParent({ email: "m@x.com", password: "correct horse battery", consent: true }, d);
  parent = { parent: s.cookies![0].value, household: s.cookies![1].value };
  hid = ((s.json as any).household.id);
  setFetch((async (url: string, init: any) => {
    stripeCalls.push({ url, body: String(init?.body ?? ""), method: init?.method });
    if (url.includes("/checkout/sessions")) return { ok: true, json: async () => ({ url: "https://checkout.stripe.test/s1" }) };
    return { ok: true, json: async () => ({ id: "sub_1", customer: "cus_1", status: "active", current_period_end: 1_900_000_000, cancel_at_period_end: false, items: { data: [{ price: { unit_amount: 599, currency: "usd", recurring: { interval: "month" } } }] } }) };
  }) as never);
});

const signed = (raw: string, t = Math.floor(d.now / 1000)) => ({ "stripe-signature": `t=${t},v1=${createHmac("sha256", "whsec").update(`${t}.${raw}`).digest("hex")}` });
const stripeEvent = (type: string, object: object, id = "evt_" + Math.random()) => JSON.stringify({ id, type, data: { object } });

describe("plans", () => {
  it("free by default; paid only while the period or status says so", () => {
    expect(effectivePlan(null, 1)).toBe("free");
    const e: any = { plan: "family", status: "active", source: "stripe", currentPeriodEnd: 100, updatedAt: 0 };
    expect(effectivePlan(e, 50)).toBe("family");
    expect(effectivePlan(e, 200)).toBe("free");
    expect(effectivePlan({ ...e, status: "canceled" }, 50)).toBe("family"); // paid through the period
    expect(effectivePlan({ ...e, status: "canceled" }, 200)).toBe("free");
  });
});

describe("checkout + webhooks", () => {
  it("creates a Stripe Checkout session tagged with the household", async () => {
    const r: any = await call("POST", "billing/checkout", { interval: "year" });
    expect(r.json.url).toMatch(/checkout/);
    expect(stripeCalls[0].body).toContain("price_y");
    expect(decodeURIComponent(stripeCalls[0].body)).toContain(`client_reference_id=${hid}`);
  });
  it("needs a parent and configuration", async () => {
    expect((await call("POST", "billing/checkout", {}, { tokens: {} })).status).toBe(401);
    delete process.env.STRIPE_SECRET_KEY;
    expect((await call("POST", "billing/checkout", {})).status).toBe(503);
  });
  it("rejects unsigned, wrongly signed and stale webhooks", async () => {
    const raw = stripeEvent("customer.subscription.updated", {});
    expect((await call("POST", "billing/webhook/stripe", {}, { raw, headers: {} })).status).toBe(400);
    expect((await call("POST", "billing/webhook/stripe", {}, { raw, headers: { "stripe-signature": "t=1,v1=bad" } })).status).toBe(400);
    expect(verifyStripeSignature(raw, signed(raw, 1)["stripe-signature"], "whsec", Math.floor(d.now / 1000))).toBe(false);
  });
  it("checkout.session.completed grants the family plan; duplicates are ignored", async () => {
    const raw = stripeEvent("checkout.session.completed", { subscription: "sub_1", client_reference_id: hid }, "evt_1");
    expect((await call("POST", "billing/webhook/stripe", {}, { raw, headers: signed(raw) })).status).toBe(200);
    const e = await getEntitlement(d.kv, hid);
    expect(e).toMatchObject({ plan: "family", status: "active", source: "stripe", price: { amountCents: 599, interval: "month" } });
    expect(((await call("POST", "billing/webhook/stripe", {}, { raw, headers: signed(raw) })) as any).json.duplicate).toBe(true);
    // the paid plan now lifts the free profile limit
    for (const n of ["kida", "kidb", "kidc"]) expect((await A.addProfile(parent, { nickname: n, birthYear: 2017 }, d)).status).toBe(201);
  });
  it("subscription deleted/updated events flow through by household metadata", async () => {
    await d.kv.set(entKey(hid), { plan: "family", status: "active", source: "stripe", updatedAt: 0 });
    const raw = stripeEvent("customer.subscription.deleted", { id: "sub_1", customer: "cus_1", status: "canceled", current_period_end: 1, metadata: { household: hid }, items: { data: [] } });
    await call("POST", "billing/webhook/stripe", {}, { raw, headers: signed(raw) });
    expect((await getEntitlement(d.kv, hid))!.status).toBe("canceled");
  });
});

describe("cancel + resume", () => {
  beforeEach(async () => { await d.kv.set(entKey(hid), { plan: "family", status: "active", source: "stripe", stripeSubscriptionId: "sub_1", currentPeriodEnd: Date.UTC(2026, 10, 30), updatedAt: 0 }); });
  it("one call cancels at period end and keeps access until then", async () => {
    const r: any = await call("POST", "billing/cancel");
    expect(r.status).toBe(200);
    expect(stripeCalls[0].body).toContain("cancel_at_period_end=true");
    expect(r.json.entitlement.cancelAtPeriodEnd).toBe(true);
    expect(effectivePlan(r.json.entitlement, d.now)).toBe("family");
  });
  it("can be undone", async () => {
    await call("POST", "billing/cancel");
    const r: any = await call("POST", "billing/resume");
    expect(r.json.entitlement.cancelAtPeriodEnd).toBe(false);
    expect(stripeCalls[1].body).toContain("cancel_at_period_end=false");
  });
  it("store-billed subscriptions point to the store instead of pretending", async () => {
    await d.kv.set(entKey(hid), { plan: "family", status: "active", source: "apple", updatedAt: 0 });
    expect(((await call("POST", "billing/cancel")) as any).json).toMatchObject({ error: "managed-by-store", source: "apple" });
  });
  it("no subscription -> 404; needs a parent", async () => {
    await d.kv.del(entKey(hid));
    expect((await call("POST", "billing/cancel")).status).toBe(404);
    expect((await call("POST", "billing/cancel", {}, { tokens: {} })).status).toBe(401);
  });
});

describe("RevenueCat (Apple + Google)", () => {
  const rc = (event: object, auth = "Bearer rc") => call("POST", "billing/webhook/revenuecat", { event }, { headers: { authorization: auth } });
  it("requires the shared secret", async () => { expect((await rc({ type: "RENEWAL", app_user_id: hid }, "Bearer nope")).status).toBe(401); });
  it("purchase -> active, cancellation -> paid through period, expiration -> canceled", async () => {
    await rc({ type: "INITIAL_PURCHASE", app_user_id: hid, store: "APP_STORE", expiration_at_ms: d.now + 1e9 });
    expect(await getEntitlement(d.kv, hid)).toMatchObject({ status: "active", source: "apple" });
    await rc({ type: "CANCELLATION", app_user_id: hid, store: "APP_STORE", expiration_at_ms: d.now + 1e9 });
    expect(effectivePlan(await getEntitlement(d.kv, hid), d.now)).toBe("family");
    expect((await getEntitlement(d.kv, hid))!.cancelAtPeriodEnd).toBe(true);
    await rc({ type: "EXPIRATION", app_user_id: hid, store: "PLAY_STORE", expiration_at_ms: d.now - 1 });
    expect(effectivePlan(await getEntitlement(d.kv, hid), d.now)).toBe("free");
  });
});
