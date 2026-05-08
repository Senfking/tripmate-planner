import { test, expect } from "@playwright/test";
import { env } from "../helpers/env";
import { randomId } from "../helpers/random";
import { signInWithEmail, signUpWithEmail, signOut, expectAuthed } from "../helpers/auth";
import { findMessage, extractFirstLink } from "../helpers/mailtrap";

test.describe("Auth — email/password", () => {
  test("login with the shared test account redirects into /app", async ({ page }) => {
    const creds = env.requireTestUser();
    await signInWithEmail(page, creds);
    await expectAuthed(page);
  });

  test("logout returns the user to the public referral landing", async ({ page }) => {
    const creds = env.requireTestUser();
    await signInWithEmail(page, creds);
    await expectAuthed(page);
    await signOut(page);
    await expect(page).toHaveURL(/\/ref/);
    // Hitting a protected route should bounce back to the public landing.
    await page.goto("/app/trips");
    await expect(page).toHaveURL(/\/ref|\/$/);
  });

  test("signup creates a new account end-to-end", async ({ page }) => {
    test.skip(
      !env.hasMailtrap(),
      "Signup confirmation requires a Mailtrap inbox. Set MAILTRAP_API_TOKEN, MAILTRAP_ACCOUNT_ID, MAILTRAP_INBOX_ID, MAILTRAP_DOMAIN to enable."
    );
    const id = randomId("signup");
    const email = `${id}@${env.mailtrap.domain}`;
    const password = "Pa55word!playwright";
    const displayName = "E2E Signup";

    await signUpWithEmail(page, { email, password, displayName });

    // Two outcomes are both acceptable depending on Supabase project config:
    //   1. Email confirmation OFF → app navigates straight to /app/trips.
    //   2. Email confirmation ON  → user lands on a "check your inbox"
    //      state, we click the link from Mailtrap and that completes auth.
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
      const link = extractFirstLink(msg);
      await page.goto(link);
      await expectAuthed(page);
    } else {
      await expectAuthed(page);
    }
  });
});

test.describe("Auth — OAuth providers", () => {
  // Google OAuth: full automation requires either a service account flow
  // or a long-lived refresh token. We don't have either configured here,
  // so we assert only that the button is wired up to Supabase's auth
  // endpoint (i.e. clicking it issues a redirect to accounts.google.com).
  test("Google button initiates an OAuth redirect", async ({ page, context }) => {
    await page.goto("/ref");
    // Block the actual redirect so we don't end up on Google's domain
    // and stall the test.
    let oauthUrl: string | null = null;
    // Loosened to also catch the Lovable auth-wrapper indirection: the
    // Google CTA now calls `lovable.auth.signInWithOAuth` instead of the
    // bare Supabase auth endpoint, so accept any hop in the redirect chain.
    await context.route(/google\.com|supabase\.co|authorize|lovable/, (route) => {
      oauthUrl = route.request().url();
      return route.abort();
    });
    await page.getByRole("button", { name: /continue with google/i }).click();
    await page.waitForTimeout(2000);
    expect(oauthUrl, "expected Google OAuth redirect to be initiated").toBeTruthy();
    expect(oauthUrl ?? "").toMatch(/google|supabase|authorize|lovable/i);
  });

  // Apple OAuth deliberately resists automation — the consent screen blocks
  // headless browsers, requires a real device for 2FA, and rotates a private
  // relay email per app. We document the manual test plan here and verify
  // only that the entry point exists.
  test("Apple button is rendered (manual verification only)", async ({ page }) => {
    await page.goto("/ref");
    await expect(page.getByRole("button", { name: /continue with apple/i })).toBeVisible();
    test.info().annotations.push({
      type: "manual",
      description:
        "Apple OAuth is exercised manually: open junto.pro/ref on a logged-in Safari/Apple device, " +
        "click Continue with Apple, complete the consent screen, and verify redirect to /app/trips. " +
        "This flow cannot be automated headlessly because Apple blocks WebDriver-controlled browsers.",
    });
  });
});
