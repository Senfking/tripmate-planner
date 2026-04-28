/**
 * Test user credentials helpers.
 *
 * Two modes:
 *   1. Persistent test user — credentials supplied via env vars
 *      (TEST_USER_EMAIL / TEST_USER_PASSWORD). Use this for tests
 *      that need a stable account (e.g. trips already populated).
 *      Set them in `.env.local` for local runs, and as CI secrets.
 *
 *   2. Ephemeral signup user — generated per-run via `makeUniqueUser()`.
 *      Use this for the signup flow itself and any test that wants
 *      a clean slate. Pair with `cleanupUser()` in afterAll/afterEach.
 *
 * Test users live under the @junto.pro domain by convention so they
 * are easy to spot and bulk-clean.
 */

const DEFAULT_PASSWORD = "TestPass!2025";
const TEST_EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "junto.pro";

export interface TestUser {
  email: string;
  password: string;
  displayName: string;
}

export function getPersistentTestUser(): TestUser {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Persistent test user not configured. Set TEST_USER_EMAIL and " +
        "TEST_USER_PASSWORD in .env.local (or as CI secrets). See " +
        "tests/e2e/README.md for setup.",
    );
  }
  return {
    email,
    password,
    displayName: process.env.TEST_USER_DISPLAY_NAME ?? "E2E Test User",
  };
}

/**
 * Generate a unique-per-run signup user. Email collisions are
 * astronomically unlikely with timestamp + random suffix.
 */
export function makeUniqueUser(prefix = "e2e"): TestUser {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return {
    email: `${prefix}-${ts}-${rand}@${TEST_EMAIL_DOMAIN}`,
    password: DEFAULT_PASSWORD,
    displayName: `E2E ${prefix} ${ts}`,
  };
}
