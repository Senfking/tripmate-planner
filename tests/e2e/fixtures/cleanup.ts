import { getAdminClient, warnNoAdminClientOnce } from "./supabase-admin";

/**
 * Delete a user (and their cascading rows) by email. Used in
 * afterAll/afterEach to keep the test project clean.
 *
 * No-op when the service-role key isn't configured — surfaces
 * a single console warning so the developer knows to set it up.
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  const admin = getAdminClient();
  if (!admin) {
    warnNoAdminClientOnce(`deleteUserByEmail(${email})`);
    return;
  }

  // Supabase admin API supports listUsers with filter only via paging,
  // not a direct lookup by email. The accounts we create in tests are
  // unique-per-run so we just walk the first page; if you ever need
  // bulk cleanup, page through with `page` until empty.
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e cleanup] listUsers failed: ${error.message}`);
    return;
  }
  const user = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!user) return;

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    // eslint-disable-next-line no-console
    console.warn(
      `[e2e cleanup] deleteUser(${user.id}) failed: ${delErr.message}`,
    );
  }
}
