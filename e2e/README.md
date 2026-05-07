# Junto E2E Tests

Playwright end-to-end tests covering the critical user flows on `junto.pro`.

By default the suite runs against the deployed production site. Override via
`E2E_BASE_URL` to point at a preview deploy or local dev server.

## Quick start

```bash
npm install
npx playwright install chromium

# Required for any test that signs in.
export E2E_TEST_USER_EMAIL="..."
export E2E_TEST_USER_PASSWORD="..."

npm run test:e2e
```

Other scripts:

- `npm run test:e2e:ui` — Playwright UI mode (interactive runner)
- `npm run test:e2e:headed` — run in a visible browser
- `npm run test:e2e:report` — open the last HTML report

## What's covered

| Spec                            | Coverage                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-auth.spec.ts`               | Email/password login + logout (always run). Email signup (Mailtrap-gated). Google OAuth (asserts redirect is wired up). Apple OAuth (manual).  |
| `02-trip-generation.spec.ts`    | City-scope trip (Tokyo, 5 days). Country-scope trip (Italy, 7 days, ≥15 activities — regression for PR #280). Activity-photo regression check. |
| `03-trip-persistence.spec.ts`   | Generated trip is saved, appears in `/app/trips`, and re-opens with day-by-day data intact.                                                    |
| `04-group-expenses.spec.ts`     | Trip invite code/link is generated. Expense form adds a row with the correct amount.                                                           |
| `05-account-deletion.spec.ts`   | Throwaway signup → trip → delete from `/app/more` → cannot re-login (Mailtrap-gated).                                                          |

Tests run **serially** (`workers: 1`) by design: they share a single test
account against a real Supabase backend, and parallel runs cause cross-test
RLS contention.

## Required environment variables

### Always required

| Var                       | Purpose                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `E2E_TEST_USER_EMAIL`     | Long-lived shared test account email.                                |
| `E2E_TEST_USER_PASSWORD`  | Password for the same.                                               |

Provision the test user once via the standard signup flow on the target
environment. Re-confirm the email via Mailtrap or your inbox of choice. The
account does not need any special privileges.

### Optional (signup + account-deletion)

| Var                  | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `MAILTRAP_API_TOKEN` | Mailtrap [Email Testing](https://api-docs.mailtrap.io/) API token.   |
| `MAILTRAP_ACCOUNT_ID`| Numeric Mailtrap account id.                                         |
| `MAILTRAP_INBOX_ID`  | Inbox id that receives confirmation emails.                          |
| `MAILTRAP_DOMAIN`    | Catch-all domain configured on the inbox (e.g. `inbox.example.com`). |

When unset, `01-auth.spec.ts > signup creates a new account` and
`05-account-deletion.spec.ts` skip with a message explaining how to enable
them. Login/logout/trip-generation tests still run fully.

To switch from Mailtrap to a different inbox provider, replace
`e2e/helpers/mailtrap.ts` — the rest of the suite consumes only the
`findMessage` / `extractFirstLink` exports.

### Optional (target override)

| Var            | Default            | Purpose                                |
| -------------- | ------------------ | -------------------------------------- |
| `E2E_BASE_URL` | `https://junto.pro` | Run against a preview / local server. |

## Manual-only flows

- **Apple OAuth** — Apple deliberately blocks WebDriver-controlled browsers.
  The spec verifies the entry point exists and annotates the test with the
  manual verification recipe. To run manually: open Junto in Safari on an
  Apple device signed in to iCloud, click *Continue with Apple*, complete the
  consent screen, and confirm landing on `/app/trips`.
- **Google OAuth (full account creation)** — automating Google login in CI
  requires either a service-account flow or a long-lived refresh token, both
  of which are outside the scope of this suite. The spec asserts that
  clicking *Continue with Google* fires the Supabase authorize redirect,
  which is the part we own.

## CI

A GitHub Actions workflow at `.github/workflows/e2e.yml` runs the suite on
PRs targeting `main` (and on demand via `workflow_dispatch`). The required
secrets are read from the repo's Actions secrets.

## Troubleshooting

- **"Missing required env var E2E_TEST_USER_EMAIL"** — set the test user
  credentials before running anything beyond a smoke test.
- **Tests time out at 90s waiting for `Day 1`** — trip generation can take
  60-90s in production; the 150s expect timeout in `waitForGenerationComplete`
  is the cap. Bumping it further usually means the model itself stalled —
  re-run, or check the Supabase function logs.
- **Selectors miss after a UI refactor** — selectors avoid `data-testid`
  (none exist in the codebase yet) and rely on roles/text. If a button is
  renamed, update the helper in `e2e/helpers/`.
- **403 on `/app/trips` after sign-in** — token-refresh race; rerun. If it
  reproduces, look at `AuthContext.tsx` and `ensureFreshSession`.
