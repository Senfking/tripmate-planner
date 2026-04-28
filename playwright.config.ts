import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Junto E2E tests.
 *
 * - Local dev: TEST_BASE_URL unset → Playwright starts `npm run dev`
 *   on the Vite dev server (port 8080, see vite.config.ts) and runs
 *   tests against it.
 * - Smoke against prod: TEST_BASE_URL=https://junto.pro → no local
 *   server, tests hit the deployed app.
 *
 * Vite's default port is 5173, but this project overrides it to 8080
 * in vite.config.ts. We follow the actual server config rather than
 * fighting it from the test side.
 */
const DEFAULT_BASE_URL = "http://localhost:8080";
const BASE_URL = process.env.TEST_BASE_URL ?? DEFAULT_BASE_URL;
const isExternalBaseUrl = !!process.env.TEST_BASE_URL;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: isCI ? 2 : undefined,
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["list"],
  ],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: "en-US",
    timezoneId: "America/New_York",
  },

  projects: [
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 375, height: 667 },
        // Pixel 7 device descriptor sets a custom UA; keep that and just
        // pin the viewport to our mobile-first reference (375x667 = iPhone SE).
      },
    },
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  // Only spin up a local dev server when running against the default
  // localhost URL. If TEST_BASE_URL points elsewhere (e.g. junto.pro)
  // we assume the target is already up.
  webServer: isExternalBaseUrl
    ? undefined
    : {
        // Force-clear VITE_SENTRY_DSN so the dev server we start for tests
        // doesn't ship events to Sentry. Sentry is a no-op without a DSN.
        // Pass `--host 127.0.0.1` so the server doesn't try to bind to
        // IPv6 (vite.config.ts uses `::` which fails in some sandboxes
        // and CI runners).
        command: "VITE_SENTRY_DSN= npm run dev -- --host 127.0.0.1",
        url: BASE_URL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
