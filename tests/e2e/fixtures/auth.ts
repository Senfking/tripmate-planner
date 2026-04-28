import { expect, type BrowserContext, type Page } from "@playwright/test";
import type { TestUser } from "./test-user";

/**
 * UI-driven auth helpers. We deliberately drive the real signup/login
 * forms instead of seeding sessions via the Supabase client — these
 * tests double as smoke tests for the auth UI itself.
 *
 * If you need a logged-in context across many tests without paying the
 * UI cost every time, run `signInViaUI` once in a global setup file
 * and dump `context.storageState({ path })` to a JSON file, then point
 * `use.storageState` at it in playwright.config.ts.
 */

/**
 * Land on the auth screen with the form expanded.
 * Root (`/`) redirects unauthenticated users to `/ref` (ReferralLanding).
 * That page hides the form behind a "Get Started" button by default.
 */
export async function openAuthForm(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL(/\/ref/);

  // The form is collapsed until the user taps "Get Started".
  // If a referral code is in the URL it auto-opens, but we don't rely on that.
  const getStarted = page.getByRole("button", { name: /^get started$/i });
  if (await getStarted.isVisible().catch(() => false)) {
    await getStarted.click();
  }

  // Form should now be visible — wait for the email input to confirm.
  await expect(page.getByPlaceholder("Email")).toBeVisible();
}

/**
 * Whether the form is currently in signup mode (display-name field visible)
 * vs sign-in mode.
 */
async function isInSignupMode(page: Page): Promise<boolean> {
  return page.getByPlaceholder("Display name").isVisible().catch(() => false);
}

/**
 * Complete the email/password signup form. Lands on /app/trips on success.
 */
export async function signUpViaUI(page: Page, user: TestUser): Promise<void> {
  await openAuthForm(page);

  if (!(await isInSignupMode(page))) {
    // We're in sign-in mode — flip to signup via the toggle below the form.
    await page
      .getByRole("button", { name: /^create account$/i })
      .last()
      .click();
    await expect(page.getByPlaceholder("Display name")).toBeVisible();
  }

  await page.getByPlaceholder("Display name").fill(user.displayName);
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);

  // The form has exactly one submit button; in signup mode it reads
  // "Create account".
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL(/\/app\/trips/, { timeout: 30_000 });
}

/**
 * Sign in an existing user via the UI. Lands on /app/trips on success.
 */
export async function signInViaUI(page: Page, user: TestUser): Promise<void> {
  await openAuthForm(page);

  if (await isInSignupMode(page)) {
    // Flip to sign-in mode via the toggle below the form.
    await page.getByRole("button", { name: /^sign in$/i }).last().click();
    await expect(page.getByPlaceholder("Display name")).toBeHidden();
  }

  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL(/\/app\/trips/, { timeout: 30_000 });
}

/**
 * Returns the storage state of an authenticated browser context so it
 * can be reused across tests.
 */
export async function storageStateFor(
  context: BrowserContext,
): Promise<Awaited<ReturnType<BrowserContext["storageState"]>>> {
  return context.storageState();
}
