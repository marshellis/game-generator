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
  const r = client();
  return {
    async getUser(u) {
      return (await r.get<UserRecord>(`user:${u}`)) ?? null;
    },
    async createUser(u, rec) {
      const res = await r.set(`user:${u}`, rec, { nx: true });
      return res === "OK";
    },
    async getCompletions(u) {
      return (await r.hgetall<Record<string, string>>(`completions:${u}`)) ?? {};
    },
    async putCompletion(u, field, value) {
      await r.hset(`completions:${u}`, { [field]: value });
    },
    async bumpLockout(u, ttlSec) {
      const n = await r.incr(`lockout:${u}`);
      if (n === 1) await r.expire(`lockout:${u}`, ttlSec);
      return n;
    },
    async getLockout(u) {
      return Number(await r.get(`lockout:${u}`)) || 0;
    },
  };
}
