import type { KV } from "./family/kv";

export interface Health {
  ok: boolean;
  checks: {
    /** Can we write and read back through the real store? (The Redis database was lost once; this notices.) */
    storage: "ok" | "failed";
    storageMs: number;
    /** Presence/shape of secrets only - never a value. */
    sessionSecret: "ok" | "weak" | "missing";
    passSecret: "ok" | "missing" | "same-as-session";
  };
  version: string;
}

export async function healthCheck(kv: KV, env: Record<string, string | undefined>, now = Date.now()): Promise<Health> {
  const t0 = Date.now();
  let storage: Health["checks"]["storage"] = "failed";
  try {
    // Not a numeric string: Redis clients auto-parse "123" into the number 123 on read, which is not a failure.
    const key = "health:ping", val = `ping-${now}`;
    await kv.set(key, val, { ttlSec: 120 });
    storage = String(await kv.get<string>(key)) === val ? "ok" : "failed";
  } catch { /* leave failed */ }
  const s = env.SESSION_SECRET ?? "", p = env.GAME_PASS_SECRET ?? "";
  const sessionSecret = !s ? "missing" : s.length < 32 ? "weak" : "ok";
  const passSecret = !p ? "missing" : p === s ? "same-as-session" : "ok";
  return {
    ok: storage === "ok" && sessionSecret !== "missing",
    checks: { storage, storageMs: Date.now() - t0, sessionSecret, passSecret },
    version: (env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
  };
}
