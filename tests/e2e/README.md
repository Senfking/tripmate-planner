# Junto E2E tests

Playwright-driven end-to-end tests. Mobile-first (375x667 viewport),
chromium + webkit by default, optional desktop project.

## Quick start

```bash
# One-time: install browser binaries (chromium + webkit)
npx playwright install chromium webkit

# Run everything
npm run test:e2e

# Run only the smoke subset (tagged @smoke)
npm run test:e2e:smoke

# Open Playwright's interactive UI mode
npm run test:e2e:ui

# Open the last HTML report
npm run test:e2e:report
```

`npm run test:e2e` starts a local Vite dev server automatically (port
8080) and runs tests against it. To target a different environment,
set `TEST_BASE_URL`:

```bash
TEST_BASE_URL=https://junto.pro npm run test:e2e:smoke
```

When `TEST_BASE_URL` is set, no local server is started.

## Projects

| Project          | Browser  | Viewport     | Notes                          |
| ---------------- | -------- | ------------ | ------------------------------ |
| `mobile-chrome`  | Chromium | 375x667      | Default. Pixel 7 device UA.    |
| `mobile-safari`  | WebKit   | 375x667      | iPhone 13 device UA.           |
| `desktop-chrome` | Chromium | 1280x800     | Desktop smoke check.           |

Run a single project with `--project`:

```bash
npm run test:e2e -- --project=mobile-chrome
```

## Required env vars

Set these in `.env.local` for local runs (gitignored), and as CI
secrets when wiring up CI. See `.env.example` for the full list.

| Var                              | Required?            | Purpose                                                        |
| -------------------------------- | -------------------- | -------------------------------------------------------------- |
| `TEST_BASE_URL`                  | optional             | Override target URL. Default: `http://localhost:8080`.         |
| `TEST_USER_EMAIL`                | only for re-use      | Persistent test user email (tests that need a seeded account). |
| `TEST_USER_PASSWORD`             | only for re-use      | Persistent test user password.                                 |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | recommended          | Used by cleanup helpers to delete test users/trips.            |
| `TEST_SUPABASE_URL`              | optional             | Override Supabase URL for cleanup. Falls back to `VITE_SUPABASE_URL`. |
| `TEST_EMAIL_DOMAIN`              | optional             | Domain for generated test emails. Default: `junto.pro`.        |

The signup smoke test creates its own ephemeral user — it does NOT
need `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`. Other tests that
need a stable, pre-populated account will read those vars.

### Set up a test user (when adding tests that need one)

1. Sign up an account through the live app (e.g. `e2e@junto.pro`).
2. Confirm the email if signup confirmation is enabled in your Supabase project.
3. Drop the credentials in `.env.local`:
   ```
   TEST_USER_EMAIL=e2e@junto.pro
   TEST_USER_PASSWORD=<chosen password>
   ```

### Get the service-role key

Supabase Dashboard → **Project Settings → API → `service_role` key**.
Treat it like a secret — never commit, never bundle into client code.
The admin client in `tests/e2e/fixtures/supabase-admin.ts` is the
only place it's read.

If `TEST_SUPABASE_SERVICE_ROLE_KEY` is unset, cleanup helpers no-op
with a single console warning. Tests still run, but every signup
test leaves an orphan user behind.

## Sentry

Tests must NOT submit events to Sentry. The webServer entry in
`playwright.config.ts` clears `VITE_SENTRY_DSN` before launching the
dev server, so Sentry stays a no-op for the test build. If you point
tests at an external `TEST_BASE_URL`, the deployed app will use its
own Sentry config — that's fine for prod smoke runs but be aware.

## Layout

```
tests/e2e/
├── README.md            # ← you are here
├── fixtures/
│   ├── auth.ts          # signUpViaUI / signInViaUI helpers
│   ├── cleanup.ts       # deleteUserByEmail (service-role)
│   ├── supabase-admin.ts# Supabase admin client (test-only)
│   ├── test-data.ts     # createTripViaUI / deleteTripById
│   └── test-user.ts     # makeUniqueUser / getPersistentTestUser
└── specs/
    └── signup.spec.ts   # @smoke: signup → /app/trips
```

## Writing new tests

1. Put specs in `tests/e2e/specs/` with `.spec.ts` extension.
2. Tag fast/critical-path tests with `@smoke` in the test name so
   they show up in `npm run test:e2e:smoke`.
3. Reach for fixtures before duplicating UI-driving code:
   - Need an authed page? `signInViaUI(page, getPersistentTestUser())`.
   - Creating a trip? Extend `createTripViaUI` rather than inlining.
4. Always register cleanup in `afterAll` / `afterEach`. Mutations
   without cleanup fill the test project with junk and eventually
   make tests flaky.
5. Don't depend on LLM responses. For tests that exercise the AI
   trip builder (coming next), mock the edge function with
   `page.route()` so we don't burn API credits in CI.
6. Tests adapt to the app, not the other way around. Don't add
   `data-testid` attributes to production components purely for
   tests — prefer role/text selectors that match what real users see.

## Screenshot review workflow

On any test failure, Playwright writes:

- `test-results/<test>/test-failed-1.png` — screenshot at failure
- `test-results/<test>/error-context.md` — accessibility tree snapshot
- `test-results/<test>/video.webm` — only on first retry
- `test-results/<test>/trace.zip` — only on first retry

Inspect with:

```bash
# Open the trace in the Playwright UI (best for debugging)
npx playwright show-trace test-results/<test>/trace.zip

# Or browse the full HTML report
npm run test:e2e:report
```

CI can upload `test-results/` and `playwright-report/` as artifacts so
failures are debuggable without re-running.

## Troubleshooting

- **`EAFNOSUPPORT` when starting webServer.** The dev server tries to
  bind to IPv6 (`::`). The Playwright config forces `--host 127.0.0.1`
  to work around this in IPv4-only sandboxes; if you've changed the
  vite host config, sync the override.
- **Tests can't reach Supabase.** Confirm your network isn't blocking
  `*.supabase.co`. Some restricted sandboxes (incl. some CI runners)
  return 403 with `x-deny-reason: host_not_allowed`; allowlist the
  Supabase host or run from an unrestricted network.
- **`webkit` fails to launch.** Run `npx playwright install webkit` —
  the binary needs to be downloaded before the first run.
