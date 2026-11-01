import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { redisClient } from "../../../lib/family/kv";
import { e2eMemory } from "../../../lib/e2e";
// @ts-ignore plain .mjs module
import { dump, encrypt } from "../../../lib/backup.mjs";

export const prerender = false;

const json = (status: number, o: unknown) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * Nightly encrypted backup (called by .github/workflows/backup.yml). Auth: `Authorization: Bearer $BACKUP_TOKEN`.
 * The response is ciphertext only - encrypted to BACKUP_PUBLIC_KEY, whose private half is NOT on the server or in
 * GitHub - so even a leaked token reveals nothing readable. Refuses to emit an empty backup (that would hide a lost DB).
 */
export const GET: APIRoute = async ({ request }) => {
  const token = process.env.BACKUP_TOKEN ?? "", pub = process.env.BACKUP_PUBLIC_KEY ?? "";
  if (!token || !pub) return json(503, { error: "backup-not-configured" });
  const got = Buffer.from(request.headers.get("authorization") ?? ""), want = Buffer.from(`Bearer ${token}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return json(401, { error: "unauthorized" });
  if (e2eMemory()) return json(501, { error: "not-available-in-e2e" });
  const snap = await dump(redisClient());
  if (snap.count === 0) return json(500, { error: "empty-database" });
  return new Response(encrypt(JSON.stringify(snap), pub), {
    status: 200,
    headers: { "content-type": "application/octet-stream", "cache-control": "no-store", "x-backup-keys": String(snap.count), "x-backup-taken-at": snap.takenAt },
  });
};
