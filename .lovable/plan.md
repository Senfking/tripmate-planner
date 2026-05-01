# Admin bypass for trip generation rate limit

## Change

In `supabase/functions/generate-trip-itinerary/index.ts` around line 4273, modify the rate limit check so the admin user (`1d5b21fe-f74c-429b-8d9d-938a4f295013`) skips it entirely. Regular users keep the current 5/hour cap (`DEFAULT_RATE_LIMIT_PER_HOUR`, env-overridable via `RATE_LIMIT_TRIPS_PER_HOUR`).

## Implementation

Replace the existing block:

```ts
const rateLimit = Number.parseInt(Deno.env.get("RATE_LIMIT_TRIPS_PER_HOUR") ?? "", 10);
const effectiveRateLimit = Number.isFinite(rateLimit) && rateLimit > 0 ? rateLimit : DEFAULT_RATE_LIMIT_PER_HOUR;
const recentCount = await userGenerationsInLastHour(svcClient, user.id);
if (recentCount >= effectiveRateLimit) {
  return jsonResponse(...429...);
}
```

with:

```ts
// Admin bypass: skip rate limit entirely for the admin user so dev/testing
// isn't blocked by the per-user hourly cap.
const ADMIN_USER_ID = "1d5b21fe-f74c-429b-8d9d-938a4f295013";
const rateLimit = Number.parseInt(Deno.env.get("RATE_LIMIT_TRIPS_PER_HOUR") ?? "", 10);
const effectiveRateLimit = Number.isFinite(rateLimit) && rateLimit > 0 ? rateLimit : DEFAULT_RATE_LIMIT_PER_HOUR;
if (user.id !== ADMIN_USER_ID) {
  const recentCount = await userGenerationsInLastHour(svcClient, user.id);
  if (recentCount >= effectiveRateLimit) {
    return jsonResponse(
      {
        success: false,
        error: "rate_limited",
        message: `Slow down — you've kicked off ${recentCount} generations in the last hour. Please try again in a few minutes.`,
      },
      429,
    );
  }
}
```

The 24h project-wide Places spend circuit breaker (a few lines below) is left untouched — it protects against a runaway loop burning the daily budget regardless of who triggered it, which still applies in dev.

## Deploy

After the edit, redeploy `generate-trip-itinerary`.

## Notes

- Admin ID is hardcoded as a const to keep it visible in code review; not pulled from env. Matches the pattern already in use elsewhere (e.g. `ADMIN_USER_ID` secret exists but the code-level bypass is more explicit).
- No frontend changes needed.
