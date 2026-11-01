// Backup / restore for the site's Redis (accounts, households, profiles, learning data, scores).
//
// Why: the old database was once simply gone, taking every account and score with it. This produces an ENCRYPTED
// dump (children's data: nicknames, birth years, progress) that only the holder of the private key can read:
// the CI job only ever has the PUBLIC key. Hybrid scheme: a random AES-256-GCM key encrypts the gzip'd dump and is
// wrapped with RSA-OAEP(SHA-256). Pure functions over a tiny Redis-shaped client so they are unit-tested with a fake.
import crypto from "node:crypto";
import zlib from "node:zlib";

// Ephemeral keys we deliberately do not back up: rate-limit counters, replay guards, locks, health pings.
export const SKIP = [/^lockout:/, /^plock:/, /^slock:/, /^stripe-ev:/, /^health:/, /^data:[^:]+:(ans|lock):/, /^data:[^:]+:lock$/, /^data:[^:]+:done:/];
export const shouldSkip = (key) => SKIP.some((re) => re.test(key));

/** client: { scan(cursor,{match,count}), type(k), get(k), hgetall(k), zrange(k,0,-1,{withScores}), pttl(k) } (Upstash shape). */
export async function dump(client, now = Date.now()) {
  const keys = [];
  let cursor = 0;
  do {
    const [next, batch] = await client.scan(cursor, { count: 500 });
    keys.push(...batch); cursor = next;
  } while (String(cursor) !== "0");
  const out = [];
  for (const k of [...new Set(keys)].sort()) {
    if (shouldSkip(k)) continue;
    const t = await client.type(k);
    const ttl = await client.pttl(k);
    let v;
    if (t === "string") v = await client.get(k);
    else if (t === "hash") v = await client.hgetall(k);
    else if (t === "zset") v = await client.zrange(k, 0, -1, { withScores: true });
    else continue; // none (expired between scan and read) or a type we do not use
    out.push({ k, t, v, ttlMs: ttl > 0 ? ttl : null });
  }
  return { version: 1, takenAt: new Date(now).toISOString(), count: out.length, keys: out };
}

/** client: { get, set(k,v,{px}), hset, zadd, pexpire, exists }. Existing keys are kept unless overwrite. */
export async function restore(client, snapshot, { overwrite = false, apply = false } = {}) {
  const plan = { restored: 0, skippedExisting: 0, byType: {} };
  for (const { k, t, v, ttlMs } of snapshot.keys) {
    if (!overwrite && (await client.exists(k))) { plan.skippedExisting++; continue; }
    plan.restored++; plan.byType[t] = (plan.byType[t] ?? 0) + 1;
    if (!apply) continue;
    if (t === "string") await client.set(k, v);
    else if (t === "hash") { for (const [f, val] of Object.entries(v)) await client.hset(k, { [f]: val }); }
    else if (t === "zset") { for (let i = 0; i < v.length; i += 2) await client.zadd(k, { score: Number(v[i + 1]), member: String(v[i]) }); }
    if (ttlMs) await client.pexpire(k, ttlMs);
  }
  return plan;
}

export function encrypt(plain, publicKeyPem) {
  const gz = zlib.gzipSync(Buffer.from(typeof plain === "string" ? plain : JSON.stringify(plain)));
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(gz), c.final()]);
  const wrapped = crypto.publicEncrypt({ key: publicKeyPem, oaepHash: "sha256", padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, key);
  const header = Buffer.from(JSON.stringify({ v: 1, alg: "RSA-OAEP-256+A256GCM", wrapped: wrapped.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64") }));
  const len = Buffer.alloc(4); len.writeUInt32BE(header.length);
  return Buffer.concat([len, header, body]);
}

export function decrypt(blob, privateKeyPem) {
  const hl = blob.readUInt32BE(0);
  const h = JSON.parse(blob.subarray(4, 4 + hl).toString());
  const key = crypto.privateDecrypt({ key: privateKeyPem, oaepHash: "sha256", padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(h.wrapped, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(h.iv, "base64"));
  d.setAuthTag(Buffer.from(h.tag, "base64"));
  const gz = Buffer.concat([d.update(blob.subarray(4 + hl)), d.final()]);
  return JSON.parse(zlib.gunzipSync(gz).toString());
}
