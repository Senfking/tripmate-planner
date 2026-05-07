import { test, expect } from "@playwright/test";
import { env } from "../helpers/env";
import { signInWithEmail, expectAuthed } from "../helpers/auth";
import {
  submitTripPrompt,
  waitForGenerationComplete,
  snapshotTripPreview,
} from "../helpers/trip";

test.beforeEach(async ({ page }) => {
  const creds = env.requireTestUser();
  await signInWithEmail(page, creds);
  await expectAuthed(page);
});

test.describe("Trip generation", () => {
  test("city-scope trip (Tokyo, 5 days, balanced)", async ({ page }) => {
    await page.goto("/trips/new");
    await submitTripPrompt(page, "Tokyo, 5 days, balanced pace, foodie focus");
    await waitForGenerationComplete(page);

    const snap = await snapshotTripPreview(page);
    expect(snap.title, "trip should have a title").toBeTruthy();
    expect(snap.dayCount).toBeGreaterThanOrEqual(5);
    expect(snap.activityCount, "city trip should have multiple activities").toBeGreaterThanOrEqual(8);
    expect(snap.hasHotel, "trip preview should mention a hotel/stay").toBe(true);
    expect(snap.hasMap, "trip preview should render a map").toBe(true);
    expect(
      snap.brokenImageCount,
      "all activity photos must load (regression test for get-place-details 401)"
    ).toBe(0);
    expect(snap.imageCount, "trip should have activity photos, not just placeholders").toBeGreaterThan(0);
  });

  // Regression test for PR #280: country-scope generation must produce ≥15
  // activities. Pre-PR the model would return ~6 and tail off.
  test("country-scope trip (Italy, 7 days, adventure) produces ≥15 activities", async ({ page }) => {
    await page.goto("/trips/new");
    await submitTripPrompt(page, "Italy, 7 days, adventure focus, hiking and outdoor");
    await waitForGenerationComplete(page);

    const snap = await snapshotTripPreview(page);
    expect(snap.dayCount).toBeGreaterThanOrEqual(7);
    expect(
      snap.activityCount,
      "regression for PR #280 — country-scope must produce ≥15 activities"
    ).toBeGreaterThanOrEqual(15);
    expect(snap.brokenImageCount).toBe(0);
  });
});
