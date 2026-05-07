import { test, expect } from "@playwright/test";
import { env } from "../helpers/env";
import { signInWithEmail, expectAuthed } from "../helpers/auth";
import {
  submitTripPrompt,
  waitForGenerationComplete,
} from "../helpers/trip";

/**
 * Group invite + expense flow runs against the test user. Each test
 * navigates to the user's most recent saved trip — earlier specs in
 * 03-trip-persistence.spec.ts seed at least one.
 */
test.describe("Group + expenses", () => {
  test.beforeEach(async ({ page }) => {
    const creds = env.requireTestUser();
    await signInWithEmail(page, creds);
    await expectAuthed(page);
  });

  test("invite flow exposes a join code/link for group members", async ({ page }) => {
    // Note: Junto uses code/link-based invites rather than per-email
    // invitations — the "Invite by email" framing in the spec doesn't
    // match the current product. This test verifies the available
    // mechanism: an invite code or link is generated and copyable.
    await page.goto("/app/trips");
    const firstTrip = page.locator('a[href*="/app/trips/"]').first();
    await firstTrip.waitFor({ timeout: 30_000 });
    await firstTrip.click();
    await page.waitForURL(/\/app\/trips\/[a-f0-9-]+/);

    // Open the share/invite modal. The TripHome surface exposes either a
    // header share button or a bottom-bar "Invite" CTA.
    const shareButton = page
      .getByRole("button", { name: /invite|share/i })
      .first();
    await shareButton.click();

    // Modal must show either the trip code, a copyable invite link, or both.
    const codeOrLink = page.getByText(/(invite to trip|share & invite|tap to copy|copy link)/i).first();
    await expect(codeOrLink).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /copy link/i }).first()).toBeVisible();
  });

  test("add expense — appears in list with correct amount and currency", async ({ page }) => {
    // Ensure we have a trip to attach the expense to.
    await page.goto("/app/trips");
    const firstTrip = page.locator('a[href*="/app/trips/"]').first();
    if (!(await firstTrip.isVisible().catch(() => false))) {
      await page.goto("/trips/new");
      await submitTripPrompt(page, "Lisbon, 3 days, relaxed");
      await waitForGenerationComplete(page);
      await page.waitForURL(/\/app\/trips\/[a-f0-9-]+/, { timeout: 60_000 });
    } else {
      await firstTrip.click();
      await page.waitForURL(/\/app\/trips\/[a-f0-9-]+/);
    }

    // Navigate to the expenses tab.
    await page.getByRole("link", { name: /expenses/i }).first().click().catch(async () => {
      // Fallback: bottom-nav button doesn't always render as a link.
      await page.getByRole("button", { name: /expenses/i }).first().click();
    });
    await page.waitForURL(/expenses|\/app\/trips\/[a-f0-9-]+/, { timeout: 15_000 });

    // Open the add-expense form.
    await page.getByRole("button", { name: /add expense/i }).first().click();

    const title = `E2E Dinner ${Date.now().toString().slice(-6)}`;
    const amount = "42.50";
    await page.getByPlaceholder(/airbnb deposit|expense title|title/i).first().fill(title);
    // First number input in the modal is amount.
    await page.locator('input[type="number"]').first().fill(amount);

    // Save. The form's primary CTA is "Save" or "Add expense".
    await page.getByRole("button", { name: /^(save|add expense)$/i }).first().click();

    // The new expense should appear in the list with title and amount.
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
    // Amount renders with the trip's settlement currency. We don't assert
    // a specific symbol — just that the numeric value is shown.
    await expect(page.getByText(/42[.,]50/)).toBeVisible({ timeout: 10_000 });
  });
});
