

## Plan: Implement hybrid photo system with safe dynamic fallback

**File:** `src/pages/TripList.tsx` (only file changed)

### Changes

**1. Replace `PHOTO_DB` with expanded curated list (~70 entries)**
Swap current array with the comprehensive database from the approved plan.

**2. Update `resolvePhoto` with dynamic fallback**
When no curated match: extract best search term (first route stop destination or cleaned trip name), build `https://source.unsplash.com/800x500/?${encodeURIComponent(term)}+travel`. Return `DEFAULT_PHOTO` only if no meaningful term exists.

**3. Add `onError` fallback on all `<img>` elements**
```tsx
onError={(e) => { e.currentTarget.src = DEFAULT_PHOTO; }}
```

**4. Ensure no blocking attributes on img elements**
- Do NOT set `referrerPolicy` or `crossOrigin` on any img — these block the `source.unsplash.com` redirect chain on mobile Safari.
- Keep img elements simple: just `src`, `alt`, `className`, `loading`, `onError`, and `style` where needed.

