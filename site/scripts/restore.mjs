// node scripts/restore.mjs <backup.enc> [--apply] [--overwrite]
//   env: BACKUP_PRIVATE_KEY_FILE (PEM, never commit it), and for --apply: KV_REST_API_URL, KV_REST_API_TOKEN
// Dry-run by default: prints what WOULD be restored. Existing keys are kept unless --overwrite.
import fs from "node:fs";
import { Redis } from "@upstash/redis";
import { decrypt, restore } from "../src/lib/backup.mjs";

const [file, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply"), overwrite = flags.includes("--overwrite");
if (!file || !process.env.BACKUP_PRIVATE_KEY_FILE) { console.error("usage: restore.mjs <file> [--apply] [--overwrite]; set BACKUP_PRIVATE_KEY_FILE"); process.exit(2); }
const snap = decrypt(fs.readFileSync(file), fs.readFileSync(process.env.BACKUP_PRIVATE_KEY_FILE, "utf8"));
console.log(`backup taken ${snap.takenAt}, ${snap.count} keys`);
const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
if (!apply && !(url && token)) { console.log("(dry run without a database: nothing to compare against) types:", snap.keys.reduce((a, k) => ({ ...a, [k.t]: (a[k.t] ?? 0) + 1 }), {})); process.exit(0); }
const plan = await restore(new Redis({ url, token }), snap, { apply, overwrite });
console.log(apply ? "RESTORED" : "DRY RUN (add --apply)", plan);
