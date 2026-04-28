import { expect, type Page } from "@playwright/test";
import { getAdminClient, warnNoAdminClientOnce } from "./supabase-admin";

/**
 * Test-data helpers. Trip creation goes through the UI by default so
 * the helper itself doubles as smoke coverage for the new-trip flow.
 *
 * Cleanup uses the service-role client (no UI cost) and is a no-op
 * when the service-role key isn't configured.
 */

export interface CreatedTrip {
  id: string;
  name: string;
}

/**
 * Drive the UI to create a basic trip. Assumes the user is already
 * authenticated and on /app/trips.
 *
 * NOTE: this is a placeholder for the next round of tests. The
 * signup smoke test does NOT use it — keeping it here so the
 * fixture surface is in place when we add the trip-creation spec.
 */
export async function createTripViaUI(
  page: Page,
  opts: { name: string },
): Promise<CreatedTrip> {
  await page.goto("/app/trips/new");
  await page.getByLabel(/trip name/i).fill(opts.name);
  // The exact submit copy will be tightened up in the next session
  // when we write the trip-creation spec for real.
  await page.getByRole("button", { name: /create|next|continue/i }).click();
  await expect(page).toHaveURL(/\/app\/trips\/[0-9a-f-]+/i);

  const match = page.url().match(/\/app\/trips\/([0-9a-f-]+)/i);
  const id = match?.[1];
  if (!id) throw new Error(`Could not extract trip id from URL: ${page.url()}`);
  return { id, name: opts.name };
}

/**
 * Hard-delete a trip by id (skips RLS via service role).
 */
export async function deleteTripById(tripId: string): Promise<void> {
  const admin = getAdminClient();
  if (!admin) {
    warnNoAdminClientOnce(`deleteTripById(${tripId})`);
    return;
  }
  const { error } = await admin.from("trips").delete().eq("id", tripId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e cleanup] deleteTripById(${tripId}) failed: ${error.message}`);
  }
}
