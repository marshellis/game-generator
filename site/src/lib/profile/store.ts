import { Redis } from "@upstash/redis";
import type { Store, UserRecord } from "./types";

let redis: Redis | null = null;
function client(): Redis {
  // Reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from the environment.
  // Lazy so the build never needs these vars (only request time does).
  if (!redis) redis = Redis.fromEnv();
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
      return (await client().hgetall<Record<string, string>>(`completions:${u}`)) ?? {};
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
