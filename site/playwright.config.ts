// Full end-to-end suite: the REAL site (astro dev) with in-memory storage, driven in real browsers.
//   npm run e2e                     # chromium
//   BROWSER=webkit npm run e2e      # Safari engine (needs system libs; CI installs them)
// Two origins on one server model production: the site on localhost, games on 127.0.0.1 (cross-origin, no cookies).
import { defineConfig, devices } from "@playwright/test";

const SITE = "http://localhost:4321";
const PLAY = "http://127.0.0.1:4321";
const browser = process.env.BROWSER ?? "chromium";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // one in-memory server: tests share state, so each creates its own uniquely named family
  workers: process.env.CI ? 2 : 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: SITE, launchOptions: browser === "chromium" ? { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] } : {}, ...devices[browser === "webkit" ? "Desktop Safari" : browser === "firefox" ? "Desktop Firefox" : "Desktop Chrome"], trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "npx astro dev --port 4321 --host 0.0.0.0 --ignore-lock",
    url: SITE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      E2E_MEMORY: "1", SESSION_SECRET: "e2e-session-secret-e2e-session-secret", GAME_PASS_SECRET: "e2e-pass-secret-e2e-pass-secret",
      PUBLIC_ARCADE_ORIGIN: PLAY, SITE_URL: SITE,
    },
  },
});
export const ORIGINS = { SITE, PLAY };
