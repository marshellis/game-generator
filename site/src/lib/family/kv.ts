// Minimal key-value surface the family platform needs. Handlers depend on this interface only,
// so tests use memoryKV() and production uses upstashKV(). Values are JSON-serialisable.
import { Redis } from "@upstash/redis";
import { e2eMemory } from "../e2e";

export interface KV {
  get<T>(key: string): Promise<T | null>;
  /** Returns false when `nx` is set and the key already exists. */
  set(key: string, value: unknown, opts?: { nx?: boolean; ttlSec?: number }): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Atomic increment; sets the TTL on first hit. */
  incr(key: string, ttlSec?: number): Promise<number>;
  /** Keys with this prefix (small sets only - used for per-household cleanup). */
  keys(prefix: string): Promise<string[]>;
}

export function memoryKV(): KV & { dump(): Record<string, unknown> } {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return (m.has(k) ? (structuredClone(m.get(k)) as T) : null); },
    async set(k, v, o) {
      if (o?.nx && m.has(k)) return false;
      m.set(k, structuredClone(v)); return true;
    },
    async del(k) { m.delete(k); },
    async incr(k) { const n = (Number(m.get(k)) || 0) + 1; m.set(k, n); return n; },
    async keys(p) { return [...m.keys()].filter((k) => k.startsWith(p)); },
    dump() { return Object.fromEntries(m); },
  };
}

let redis: Redis | null = null;
/** The raw client, for admin tooling (backup) that needs SCAN/TYPE which the KV interface deliberately does not expose. */
export function redisClient(): Redis { return client(); }
function client(): Redis {
  if (!redis) {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("Missing Redis env (KV_REST_API_URL/TOKEN)");
    redis = new Redis({ url, token });
  }
  return redis;
}

let e2eKv: KV | null = null;
export function upstashKV(): KV {
  if (e2eMemory()) return (e2eKv ??= memoryKV()); // local e2e only; see lib/e2e.ts
  return {
    async get<T>(k: string) { return (await client().get<T>(k)) ?? null; },
    async set(k, v, o) {
      const res = await client().set(k, v as never, { ...(o?.nx ? { nx: true } : {}), ...(o?.ttlSec ? { ex: o.ttlSec } : {}) });
      return res === "OK";
    },
    async del(k) { await client().del(k); },
    async incr(k, ttl) {
      const n = await client().incr(k);
      if (ttl) await client().expire(k, ttl); // always re-arm, so a lost first expire cannot make a counter permanent
      return n;
    },
    async keys(p) {
      const out: string[] = []; let cursor: string | number = 0;
      do {
        const [next, batch] = (await client().scan(cursor, { match: `${p}*`, count: 200 })) as [string | number, string[]];
        out.push(...batch); cursor = next;
      } while (String(cursor) !== "0");
      return out;
    },
  };
}
