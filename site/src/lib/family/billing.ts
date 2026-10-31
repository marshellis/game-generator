// Subscriptions. One household entitlement (see plans.ts) fed by several sources:
//   - Stripe, bought on the marshellis website (Checkout), managed + cancelled on /family
//   - RevenueCat webhooks, which carry Apple App Store and Google Play purchases
// Apps and web only ever read the entitlement, so a subscription bought anywhere works everywhere.
//
// Cancelling is ONE call and keeps access to the end of the paid period (no calls, no surveys, no
// retention maze). Not configured (no keys) => billing endpoints answer 503 and everyone stays on free.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { FamilyDeps, FamilyResult } from "./accounts";
import { parentFrom } from "./accounts";
import { entKey, getEntitlement, PLANS, type Entitlement } from "./plans";
import { register, type Req } from "./router";

const err = (status: number, error: string): FamilyResult => ({ status, json: { error } });
const STRIPE = "https://api.stripe.com/v1";
export type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Tests inject a fake network. */
export function setFetch(f: Fetch): void { fetchImpl = f; }

const env = (k: string) => process.env[k] ?? "";
const configured = () => !!env("STRIPE_SECRET_KEY") && !!env("STRIPE_PRICE_FAMILY_MONTHLY");

async function stripe(path: string, params: Record<string, string> = {}, method = "POST"): Promise<any> {
  const r = await fetchImpl(`${STRIPE}${path}`, {
    method, headers: { authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "content-type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : new URLSearchParams(params).toString(),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `stripe ${r.status}`);
  return j;
}

/** What the subscription page shows: plan, price, renewal date, and whether it is set to cancel. */
export async function subscription(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const p = await parentFrom(r.tokens, d);
  if (!p) return err(401, "parent-required");
  const e = await getEntitlement(d.kv, p.householdId);
  return {
    status: 200,
    json: {
      entitlement: e, plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, dailyQuestions: Number.isFinite(v.dailyQuestions) ? v.dailyQuestions : null }])),
      billingEnabled: configured(),
      prices: { month: env("PRICE_LABEL_MONTHLY") || null, year: env("PRICE_LABEL_YEARLY") || null },
    },
  };
}

export async function checkout(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const p = await parentFrom(r.tokens, d);
  if (!p) return err(401, "parent-required");
  if (!configured()) return err(503, "billing-not-configured");
  const interval = r.body.interval === "year" ? "year" : "month";
  const price = interval === "year" ? env("STRIPE_PRICE_FAMILY_YEARLY") : env("STRIPE_PRICE_FAMILY_MONTHLY");
  if (!price) return err(503, "billing-not-configured");
  const site = env("SITE_URL") || "https://games.marshellis.com";
  const e = await getEntitlement(d.kv, p.householdId);
  const s = await stripe("/checkout/sessions", {
    mode: "subscription", "line_items[0][price]": price, "line_items[0][quantity]": "1",
    client_reference_id: p.householdId, "subscription_data[metadata][household]": p.householdId,
    success_url: `${site}/family?subscribed=1`, cancel_url: `${site}/family`,
    ...(e?.stripeCustomerId ? { customer: e.stripeCustomerId } : { customer_email: p.email }),
  });
  return { status: 200, json: { url: s.url } };
}

/** One-step cancel: stops renewal, keeps access until the period ends. */
export async function cancel(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  return setCancel(r, d, true);
}
export async function resume(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  return setCancel(r, d, false);
}
async function setCancel(r: Req, d: FamilyDeps, cancelIt: boolean): Promise<FamilyResult> {
  const p = await parentFrom(r.tokens, d);
  if (!p) return err(401, "parent-required");
  const e = await getEntitlement(d.kv, p.householdId);
  if (!e || e.status === "none" || e.status === "canceled" && !cancelIt) return err(404, "no-subscription");
  if (e.source !== "stripe") {
    // Apple/Google subscriptions can only be cancelled inside the store that billed them.
    return { status: 409, json: { error: "managed-by-store", source: e.source, help: e.source === "apple" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions" } };
  }
  if (!e.stripeSubscriptionId) return err(409, "no-subscription-id");
  if (!configured()) return err(503, "billing-not-configured");
  await stripe(`/subscriptions/${e.stripeSubscriptionId}`, { cancel_at_period_end: String(cancelIt) });
  const next: Entitlement = { ...e, cancelAtPeriodEnd: cancelIt, updatedAt: d.now };
  await d.kv.set(entKey(p.householdId), next);
  return { status: 200, json: { entitlement: next } };
}

// ---- webhooks ----------------------------------------------------------------------------------
export function verifyStripeSignature(raw: string, header: string | undefined, secret: string, nowSec: number): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > 300 || !parts.v1) return false;
  const want = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  const a = Buffer.from(want), b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

function fromStripeSub(sub: any, prev: Entitlement | null, now: number): Entitlement {
  const item = sub.items?.data?.[0]?.price;
  const status = ({ active: "active", trialing: "trialing", past_due: "past_due", unpaid: "past_due", canceled: "canceled" } as Record<string, Entitlement["status"]>)[sub.status] ?? "none";
  return {
    plan: "family", status, source: "stripe", stripeCustomerId: sub.customer, stripeSubscriptionId: sub.id,
    currentPeriodEnd: sub.current_period_end ? sub.current_period_end * 1000 : prev?.currentPeriodEnd,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    price: item ? { amountCents: item.unit_amount, interval: item.recurring?.interval === "year" ? "year" : "month", currency: item.currency } : prev?.price,
    updatedAt: now,
  };
}

export async function stripeWebhook(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  if (!verifyStripeSignature(r.raw ?? "", r.headers?.["stripe-signature"], env("STRIPE_WEBHOOK_SECRET"), Math.floor(d.now / 1000))) return err(400, "bad-signature");
  const ev = JSON.parse(r.raw ?? "{}");
  if (!(await d.kv.set(`stripe-ev:${ev.id}`, 1, { nx: true, ttlSec: 7 * 86400 }))) return { status: 200, json: { duplicate: true } };
  const obj = ev.data?.object ?? {};
  if (ev.type === "checkout.session.completed" && obj.subscription && obj.client_reference_id) {
    const sub = await stripe(`/subscriptions/${obj.subscription}`, {}, "GET");
    await d.kv.set(entKey(obj.client_reference_id), fromStripeSub(sub, null, d.now));
  } else if (ev.type?.startsWith("customer.subscription.")) {
    const hid = obj.metadata?.household;
    if (hid) await d.kv.set(entKey(hid), fromStripeSub(obj, await getEntitlement(d.kv, hid), d.now));
  }
  return { status: 200, json: { ok: true } };
}

/** RevenueCat -> Apple/Google. Authorization header must equal REVENUECAT_WEBHOOK_SECRET; app_user_id is the household id. */
export async function revenueCatWebhook(r: Req, d: FamilyDeps): Promise<FamilyResult> {
  const secret = env("REVENUECAT_WEBHOOK_SECRET");
  const got = r.headers?.authorization ?? "";
  const a = Buffer.from(got), b = Buffer.from(`Bearer ${secret}`);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return err(401, "unauthorized");
  const ev: any = (r.body as any).event ?? {};
  const hid = String(ev.app_user_id ?? "");
  if (!hid) return err(400, "no-user");
  const prev = await getEntitlement(d.kv, hid);
  const store = ev.store === "APP_STORE" || ev.store === "MAC_APP_STORE" ? "apple" : "google";
  const end = Number(ev.expiration_at_ms) || prev?.currentPeriodEnd;
  const base = { plan: "family", source: store as Entitlement["source"], currentPeriodEnd: end, updatedAt: d.now };
  switch (ev.type) {
    case "INITIAL_PURCHASE": case "RENEWAL": case "UNCANCELLATION": case "PRODUCT_CHANGE":
      await d.kv.set(entKey(hid), { ...base, status: "active", cancelAtPeriodEnd: false }); break;
    case "CANCELLATION":
      await d.kv.set(entKey(hid), { ...base, status: "active", cancelAtPeriodEnd: true }); break; // paid through period end
    case "BILLING_ISSUE":
      await d.kv.set(entKey(hid), { ...base, status: "past_due" }); break;
    case "EXPIRATION":
      await d.kv.set(entKey(hid), { ...base, status: "canceled" }); break;
  }
  return { status: 200, json: { ok: true } };
}

register({
  "GET billing/subscription": subscription,
  "POST billing/checkout": checkout,
  "POST billing/cancel": cancel,
  "POST billing/resume": resume,
  "POST billing/webhook/stripe": stripeWebhook,
  "POST billing/webhook/revenuecat": revenueCatWebhook,
});
