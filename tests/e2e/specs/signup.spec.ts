import { expect, test } from "@playwright/test";
import { signUpViaUI } from "../fixtures/auth";
import { deleteUserByEmail } from "../fixtures/cleanup";
import { makeUniqueUser, type TestUser } from "../fixtures/test-user";

/**
 * Signup smoke test.
 *
 * Today: signup lands directly on /app/trips. There is no separate
 * post-signup onboarding wizard (TripOnboarding lives at
 * /app/trips/:tripId/onboarding and is per-trip, not per-account).
 * If a global onboarding flow is added later, extend this spec to
 * walk through it before asserting the trips landing.
 */

const createdUsers: TestUser[] = [];

test.afterAll(async () => {
  // Best-effort cleanup. Skipped silently if no service-role key is
  // configured — see tests/e2e/README.md for setup.
  for (const user of createdUsers) {
    await deleteUserByEmail(user.email).catch(() => {});
  }
});

test.describe("signup flow", () => {
  test("new user can sign up and lands on /app/trips @smoke", async ({
    page,
  }) => {
    const user = makeUniqueUser("signup");
    createdUsers.push(user);

    await signUpViaUI(page, user);

    // Landed on the trips list (the post-signup destination).
    await expect(page).toHaveURL(/\/app\/trips(\?|#|$)/);

    // First-time user: the empty-state copy should be present somewhere
    // in the trips landing. This is a soft check — any of the known
    // empty-state strings is enough — so a copy tweak doesn't break the
    // smoke test.
    const emptyStateMarker = page
      .getByText(/no trips yet|where do you want to go/i)
      .first();
    await expect(emptyStateMarker).toBeVisible({ timeout: 15_000 });
  });
});
