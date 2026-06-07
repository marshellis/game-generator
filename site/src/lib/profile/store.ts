import { Redis } from "@upstash/redis";
import type { Store, UserRecord } from "./types";

let redis: Redis | null = null;
function client(): Redis {
  // The Vercel "Upstash for Redis" integration injects KV_REST_API_URL/TOKEN;
  // a manual Upstash setup uses UPSTASH_REDIS_REST_URL/TOKEN. Accept either.
  // Lazy so the build never needs these vars (only request time does).
  if (!redis) {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("Missing Redis env (KV_REST_API_URL/TOKEN)");
    redis = new Redis({ url, token });
  }
  return redis;
}

export function upstashStore(): Store {
  // client() is called per-method (not once up front) so building the store is
  // free: routes that never touch Redis (e.g. an unauthenticated /api/me) don't
  // trigger Redis.fromEnv() and so return a clean 401 even if env is missing.
  return {
    async getUser(u) {
      return (await client().get<UserRecord>(`user:${u}`)) ?? null;
    },
    async createUser(u, rec) {
      const res = await client().set(`user:${u}`, rec, { nx: true });
      return res === "OK";
    },
    async getCompletions(u) {
      return (await client().hgetall<Record<string, unknown>>(`completions:${u}`)) ?? {};
    },
    async putCompletion(u, field, value) {
      await client().hset(`completions:${u}`, { [field]: value });
    },
    async bumpLockout(u, ttlSec) {
      const n = await client().incr(`lockout:${u}`);
      if (n === 1) await client().expire(`lockout:${u}`, ttlSec);
      return n;
    },
    async getLockout(u) {
      return Number(await client().get(`lockout:${u}`)) || 0;
    },
  };
}
