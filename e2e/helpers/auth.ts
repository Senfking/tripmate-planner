import { Page, expect } from "@playwright/test";

/**
 * Open the auth landing page and choose a mode. The site lazy-loads the
 * referral landing route, so we wait for the email input before returning.
 */
async function openAuthForm(page: Page, mode: "signup" | "signin") {
  await page.goto("/ref");
  // The form opens by default in signup mode. Switch via the underlined
  // toggle link in the bottom paragraph if we want sign-in instead.
  await page.getByPlaceholder(/email/i).waitFor({ timeout: 30_000 });
  const toggleLabel = mode === "signup" ? "Create account" : "Sign in";
  const toggle = page.locator(`button.underline:has-text("${toggleLabel}")`);
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
}

export async function signUpWithEmail(
  page: Page,
  opts: { email: string; password: string; displayName: string }
): Promise<void> {
  await openAuthForm(page, "signup");
  await page.getByPlaceholder(/display name/i).fill(opts.displayName);
  await page.getByPlaceholder(/email/i).fill(opts.email);
  await page.getByPlaceholder(/password/i).fill(opts.password);
  await page.getByRole("button", { name: /create account/i }).first().click();
}

export async function signInWithEmail(
  page: Page,
  opts: { email: string; password: string }
): Promise<void> {
  await openAuthForm(page, "signin");
  await page.getByPlaceholder(/email/i).fill(opts.email);
  await page.getByPlaceholder(/password/i).fill(opts.password);
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
}

/**
 * Wait until the app routes the user into the authenticated shell. The
 * sign-in handler navigates to `/app/trips` (or the stashed redirect),
 * which is reachable only behind the ProtectedRoute.
 */
export async function expectAuthed(page: Page): Promise<void> {
  await page.waitForURL(/\/app\//, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\//);
}

/**
 * Sign out via the More page. /app/more is the canonical settings hub
 * and contains a "Sign out" button at the bottom.
 */
export async function signOut(page: Page): Promise<void> {
  await page.goto("/app/more");
  await page.getByRole("button", { name: /^sign out$/i }).click();
  await page.waitForURL(/\/ref/, { timeout: 15_000 });
}
