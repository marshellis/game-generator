// Multiplayer e2e: the normal site + the REAL game servers running locally.  npm run e2e:mp
// First time: node e2e/multiplayer/setup.mjs  (clones/builds the servers into .mp-servers/)
import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import base from "./playwright.config";

const DIR = process.env.MP_SERVERS_DIR ?? path.resolve(__dirname, ".mp-servers");
const secret = "e2e-pass-secret-e2e-pass-secret";
const srv = (name: string, cwd: string, cmd: string, port: number, url: string) => ({
  command: cmd, cwd: path.join(DIR, cwd), url, timeout: 60_000, reuseExistingServer: !process.env.CI,
  env: { PORT: String(port), GAME_PASS_SECRET: secret, LOBBY_MS: "2000" },
});

export default defineConfig({
  ...base,
  testDir: "./e2e/multiplayer",
  testMatch: /.*\.spec\.ts/,
  testIgnore: [],
  timeout: 180_000,
  webServer: [
    ...(Array.isArray(base.webServer) ? base.webServer : [base.webServer!]),
    // only servers that setup.mjs actually fetched (nexus-server is private and needs GH_TOKEN)
    ...[
      srv("battle-royale", "battle-royale-server", "node dist/index.js", 2567, "http://127.0.0.1:2567/health"),
      srv("hide-and-seek", "hide-and-seek-server", "node server.js", 8083, "http://127.0.0.1:8083/"),
      srv("nexus", "nexus-server", "node server.js", 8081, "http://127.0.0.1:8081/"),
    ].filter((s) => fs.existsSync(s.cwd)),
  ],
});
