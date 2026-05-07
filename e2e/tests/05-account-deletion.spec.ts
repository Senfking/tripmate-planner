import { test, expect } from "@playwright/test";
import { env } from "../helpers/env";
import { randomId } from "../helpers/random";
import {
  signInWithEmail,
  signUpWithEmail,
  expectAuthed,
} from "../helpers/auth";
import { findMessage, extractFirstLink } from "../helpers/mailtrap";
import {
  submitTripPrompt,
  waitForGenerationComplete,
} from "../helpers/trip";

/**
 * Full account-deletion flow against a throwaway account. Mailtrap is
 * required to read the signup confirmation email when the Supabase
 * project enforces email verification.
 *
 * Verified properties post-deletion:
 *  - the user is signed out and lands on /ref
 *  - re-attempting sign-in with the same credentials fails
 *
 * Server-side data cleanup (profile row deleted, expenses anonymised,
 * trips reassigned per spec) is asserted indirectly through the failed
 * re-login. Direct DB inspection would require a service-role key, which
 * we deliberately don't expose to the e2e suite.
 */
test("account deletion — throwaway account is fully removed", async ({ page }) => {
  test.skip(
    !env.hasMailtrap(),
    "Account deletion needs a throwaway signup, which needs Mailtrap. Set MAILTRAP_* env vars."
  );

  const id = randomId("delete");
  const email = `${id}@${env.mailtrap.domain}`;
  const password = "Pa55word!playwright";
  const displayName = "E2E Deletion";

  // 1. Sign up the throwaway.
  await signUpWithEmail(page, { email, password, displayName });
  const navigated = await page
    .waitForURL(/\/app\//, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!navigated) {
    const msg = await findMessage({
      to: email,
      subjectPattern: /confirm|verify|junto/i,
      timeoutMs: 90_000,
    });
    await page.goto(extractFirstLink(msg));
    await expectAuthed(page);
  }

  // 2. Generate a small trip so there's data to clean up.
  await page.goto("/trips/new");
  await submitTripPrompt(page, "Porto, 2 days, relaxed");
  await waitForGenerationComplete(page);
  // Allow auto-save / save to settle if the variant requires it.
  await page.waitForTimeout(2000);

  // 3. Open settings and trigger the delete flow.
  await page.goto("/app/more");
  // Expand the danger zone collapsible.
  await page.getByRole("button", { name: /danger zone/i }).click();
  await page.getByRole("button", { name: /^delete account$/i }).click();
  // Two-step confirmation drawer with a 500ms arming delay between steps.
  await page.getByRole("button", { name: /^delete account$/i }).last().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /yes, delete forever/i }).click();

  // 4. After deletion the app navigates to /ref and shows a toast.
  await page.waitForURL(/\/ref/, { timeout: 30_000 });

  // 5. Verify that the same credentials no longer authenticate.
  await signInWithEmail(page, { email, password });
  // Sign-in should fail — either we stay on /ref with an error, or we
  // bounce back without ever reaching /app.
  await page.waitForTimeout(3000);
  expect(page.url(), "deleted account must not be able to log back in").not.toMatch(/\/app\//);
  // A friendly error should be visible somewhere on the page.
  const errorVisible = await page
    .getByText(/invalid|incorrect|not.*found|unable/i)
    .first()
    .isVisible()
    .catch(() => false);
  expect(errorVisible, "expected an error message after re-login attempt").toBe(true);
});
