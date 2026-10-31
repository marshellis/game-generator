// Free vs paid is DATA, not code. Ellis and Marshall are researching the right split; until they
// report, these rows are placeholders chosen to be generous. Edit the table (or load it from
// config later) - nothing else needs to change.
import type { KV } from "./kv";

export interface PlanFeatures {
  label: string;
  maxProfiles: number;
  /** Learning questions served per profile per day (Infinity = unlimited). */
  dailyQuestions: number;
  progressReports: boolean;
  /** Publish games into the store. */
  publishing: boolean;
}

export const PLANS: Record<string, PlanFeatures> = {
  free: { label: "Free", maxProfiles: 2, dailyQuestions: 15, progressReports: false, publishing: false },
  family: { label: "Family", maxProfiles: 8, dailyQuestions: Infinity, progressReports: true, publishing: true },
};

export type EntitlementSource = "none" | "stripe" | "apple" | "google" | "manual";

export interface Entitlement {
  plan: keyof typeof PLANS | string;
  status: "active" | "trialing" | "past_due" | "canceled" | "none";
  source: EntitlementSource;
  /** End of the paid period; access continues to here even after cancel. */
  currentPeriodEnd?: number;
  /** User asked to cancel; stays active until currentPeriodEnd, does not renew. */
  cancelAtPeriodEnd?: boolean;
  price?: { amountCents: number; interval: "month" | "year"; currency: string };
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  updatedAt: number;
}

export const entKey = (householdId: string) => `ent:${householdId}`;

export async function getEntitlement(kv: KV, householdId: string): Promise<Entitlement | null> {
  return kv.get<Entitlement>(entKey(householdId));
}

/** The plan a household gets RIGHT NOW. Canceled-but-paid-through stays paid until the period ends. */
export function effectivePlan(e: Entitlement | null, nowMs: number): string {
  if (!e || !PLANS[e.plan]) return "free";
  if (e.status === "active" || e.status === "trialing" || e.status === "past_due") {
    return e.currentPeriodEnd && e.currentPeriodEnd < nowMs && e.status !== "past_due" ? "free" : e.plan;
  }
  if (e.status === "canceled" && e.currentPeriodEnd && e.currentPeriodEnd > nowMs) return e.plan;
  return "free";
}

export async function featuresFor(kv: KV, householdId: string, nowMs: number): Promise<PlanFeatures & { plan: string }> {
  const plan = effectivePlan(await getEntitlement(kv, householdId), nowMs);
  return { ...PLANS[plan], plan };
}
