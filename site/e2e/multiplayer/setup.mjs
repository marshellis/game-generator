// One-time (idempotent) setup for the multiplayer e2e: fetch the REAL game servers and make them runnable locally.
//   node e2e/multiplayer/setup.mjs            # clones into $MP_SERVERS_DIR (default: <site>/.mp-servers, gitignored)
// Public repos need nothing; the private nexus-server is fetched only if GH_TOKEN is set (otherwise its tests skip).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIR = process.env.MP_SERVERS_DIR ?? path.resolve(HERE, "../../.mp-servers");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
const REPOS = [
  { name: "battle-royale-server", build: ["npx", "tsc"] },
  { name: "hide-and-seek-server" },
  { name: "nexus-server", private: true },
  { name: "galaga", workspace: true },
];

fs.mkdirSync(DIR, { recursive: true });
for (const r of REPOS) {
  const dir = path.join(DIR, r.name);
  if (r.private && !process.env.GH_TOKEN) { console.log(`skip ${r.name} (private; set GH_TOKEN to include it)`); continue; }
  const url = r.private ? `https://x-access-token:${process.env.GH_TOKEN}@github.com/marshellis/${r.name}.git` : `https://github.com/marshellis/${r.name}.git`;
  if (!fs.existsSync(dir)) run("git", ["clone", "--depth", "1", url, dir]);
  else run("git", ["pull", "--ff-only", "-q"], dir);
  if (!fs.existsSync(path.join(dir, "node_modules"))) run("npm", ["ci"], dir);
  if (r.build && !fs.existsSync(path.join(dir, "dist"))) run(r.build[0], r.build.slice(1), dir);
  if (r.workspace && !fs.existsSync(path.join(dir, "server/dist"))) run("npm", ["run", "build", "-w", "server"], dir);
}
console.log("multiplayer servers ready in", DIR);
