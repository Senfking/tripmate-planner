import { test, expect } from "@playwright/test";
import { env } from "../helpers/env";
import { signInWithEmail, expectAuthed } from "../helpers/auth";
import {
  submitTripPrompt,
  waitForGenerationComplete,
} from "../helpers/trip";

/**
 * Save a generated trip and verify it appears in the trip list, then
 * re-open it and verify the same data is still there.
 */
test("generated trip persists into trip list and can be re-opened", async ({ page }) => {
  const creds = env.requireTestUser();
  await signInWithEmail(page, creds);
  await expectAuthed(page);

  const tripPrompt = `E2E Lisbon weekend ${Date.now()}`; // unique-enough to find later
  await page.goto("/trips/new");
  await submitTripPrompt(page, `${tripPrompt}, 3 days, relaxed`);
  await waitForGenerationComplete(page);

  // Trigger save. The signed-in flow exposes a "Save trip" CTA on the
  // streaming preview. Some variants name it "Save & continue" or similar.
  const saveBtn = page
    .getByRole("button", { name: /save( trip| & continue| and continue)?\b/i })
    .first();
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
  }

  // After save, the app routes to /app/trips/:id (TripHome). The preview
  // for in-flight signed-in generation also auto-saves in some variants —
  // either way, by this point the trip should exist.
  await page.waitForURL(/\/app\/trips\/[a-f0-9-]+/, { timeout: 30_000 });
  const tripUrl = page.url();
  const tripId = tripUrl.match(/\/app\/trips\/([a-f0-9-]+)/)?.[1];
  expect(tripId, "trip URL should expose an id").toBeTruthy();

  // Trip list should now include the trip.
  await page.goto("/app/trips");
  // Either the trip name (model-generated) or a recently-created card
  // appears. Confirm at least one trip card links to the saved id.
  await expect(page.locator(`a[href*="/app/trips/${tripId}"]`).first()).toBeVisible({ timeout: 15_000 });

  // Re-open and verify the trip data renders again.
  await page.locator(`a[href*="/app/trips/${tripId}"]`).first().click();
  await page.waitForURL(new RegExp(`/app/trips/${tripId}`));
  await expect(page.getByText(/^day\s*1\b/i).first()).toBeVisible({ timeout: 30_000 });
});
