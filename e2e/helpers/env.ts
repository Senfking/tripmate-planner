/**
 * Environment knobs for the E2E suite. Reads from process.env so the same
 * config works in CI, local runs, and the throwaway-account specs that
 * refuse to touch shared accounts.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  baseURL: process.env.E2E_BASE_URL ?? "https://junto.pro",

  // Long-lived shared test account. Used by login/logout/trip-generation/
  // expenses tests so they don't have to wait on email confirmation.
  // Set up once on the target environment and reuse.
  testUser: {
    email: optional("E2E_TEST_USER_EMAIL"),
    password: optional("E2E_TEST_USER_PASSWORD"),
  },
  requireTestUser(): { email: string; password: string } {
    return { email: required("E2E_TEST_USER_EMAIL"), password: required("E2E_TEST_USER_PASSWORD") };
  },

  // Mailtrap (or any inbox-API service) used by the signup + account-deletion
  // specs that need to read confirmation emails for fresh throwaway accounts.
  // When unset, those specs skip gracefully.
  mailtrap: {
    apiToken: optional("MAILTRAP_API_TOKEN"),
    accountId: optional("MAILTRAP_ACCOUNT_ID"),
    inboxId: optional("MAILTRAP_INBOX_ID"),
    // The catch-all domain configured on the Mailtrap inbox. Throwaway
    // signups use addresses like e2e-{random}@{domain}.
    domain: optional("MAILTRAP_DOMAIN"),
  },
  hasMailtrap(): boolean {
    return Boolean(
      this.mailtrap.apiToken &&
        this.mailtrap.accountId &&
        this.mailtrap.inboxId &&
        this.mailtrap.domain
    );
  },
};
