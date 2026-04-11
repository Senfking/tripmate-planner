

## Diagnosis

The app crashes with `TypeError: r is not a function` during React rendering when the user triggers AI trip generation from the TripHome page. Based on extensive code analysis:

1. **The edge function uses Anthropic API directly** (`ANTHROPIC_API_KEY`) and is timing out (confirmed by test calls returning "context canceled"). This means the generation fails, but the crash is a separate frontend rendering issue.

2. **The frontend crash** occurs in the TripBuilderFlow component tree during step transitions after free-text submission. The minified error makes exact tracing difficult, but the most likely cause is a rendering issue when the GeneratingScreen or TripResultsView mounts — potentially from the `react-leaflet` map components or a stale component reference in the bundle.

## Plan

### 1. Migrate edge function from Anthropic to Lovable AI Gateway
The `generate-trip-itinerary` edge function calls Anthropic directly with `ANTHROPIC_API_KEY`. This should use the Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) with `LOVABLE_API_KEY` (already provisioned). This fixes the timeout issue and removes the need for a separate API key.

**File:** `supabase/functions/generate-trip-itinerary/index.ts`
- Replace `callAnthropicApi` with a call to the Lovable AI Gateway
- Use `google/gemini-2.5-flash` model for speed (itinerary generation is structured output)
- Use tool calling for structured JSON output instead of asking the model to return raw JSON
- Keep the same prompt structure and response normalization

### 2. Add error boundary around TripBuilderFlow
Wrap the builder in its own error boundary so a crash in the builder doesn't take down the entire TripHome page.

**File:** `src/components/trip/TripDashboard.tsx`
- Wrap `<TripBuilderFlow>` in an error boundary with a "Try again" fallback that closes the builder

### 3. Add defensive rendering in GeneratingScreen and TripResultsView
Add null checks and try-catch around potentially failing renders.

**Files:**
- `src/components/trip-builder/GeneratingScreen.tsx` — add safe defaults for all props
- `src/components/trip-results/TripResultsView.tsx` — wrap map rendering in error boundary, add fallback for when `react-leaflet` fails to load
- `src/components/trip-results/ResultsMap.tsx` — add try-catch wrapper

### 4. Fix handleFreeText to use functional state update
The current `handleFreeText` reads from a stale `answers` closure. Switch to functional update to prevent race conditions with the defaults `useEffect`.

**File:** `src/components/trip-builder/TripBuilderFlow.tsx`
- Change `setAnswers(merged as Answers)` to use `setAnswers(prev => ({ ...prev, ...updates }))`

