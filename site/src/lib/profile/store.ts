import { Redis } from "@upstash/redis";
import type { Store, UserRecord, ScoreEntry } from "./types";

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
    async bumpScore(game, u, score) {
      const key = `leaderboard:${game}`;
      // gt: only raise an existing entry, never lower it. Then read it back.
      await client().zadd(key, { gt: true }, { score, member: u });
      return Number(await client().zscore(key, u)) || score;
    },
    async topScores(game, limit) {
      // rev + withScores → a flat [member, score, member, score, …] array.
      const flat = (await client().zrange(`leaderboard:${game}`, 0, limit - 1, {
        rev: true,
        withScores: true,
      })) as (string | number)[];
      const out: ScoreEntry[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        out.push({ username: String(flat[i]), score: Number(flat[i + 1]) });
      }
      return out;
    },
    async userBest(game, u) {
      return Number(await client().zscore(`leaderboard:${game}`, u)) || 0;
    },
    async userRank(game, u) {
      // zrevrank is 0-based and null for a member that isn't on the board.
      const i = await client().zrevrank(`leaderboard:${game}`, u);
      return i === null || i === undefined ? null : Number(i) + 1;
    },
    async playerCount(game) {
      return Number(await client().zcard(`leaderboard:${game}`)) || 0;
    },
    async removeScore(game, u) {
      await client().zrem(`leaderboard:${game}`, u);
    },
  };
}
