import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "https://junto.pro";

export default defineConfig({
  testDir: "./e2e",
  // Trip generation streams for 60-90s; give individual tests headroom.
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  // Trip-persistence and account-deletion specs share state with the
  // generation specs, so we run sequentially. Cheap parallelism isn't
  // worth the flakiness on a real Supabase backend.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
