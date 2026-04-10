

# AI Trip Builder — Smart Pre-filling Refinements

## Overview
Make the Trip Builder questionnaire smarter by pulling existing trip context (polls, vibe board, trip metadata, member count) and offering a free-text NLP entry point. No structural changes to the 6-step flow — these are additive enhancements.

## Files to Create

1. **`src/components/trip-builder/useTripBuilderDefaults.ts`** — Custom hook that queries all available context for a trip and returns smart defaults:
   - Trip name, destination, dates from `trips` table
   - Member count from `trip_members`
   - Poll winners from `polls` + `poll_options` + vote counts (via `get_poll_vote_counts` RPC)
   - Vibe Board aggregates from `get_vibe_aggregates` RPC — map musthave answers to the questionnaire's vibe pills (e.g. "Beach & sun" → "Beach", "Food & drinks" → "Food")
   - Returns a `defaults` object matching the questionnaire state shape, plus metadata like `{ pollSource: "Based on your group's vote" }`

2. **`src/components/trip-builder/StepEntryChoice.tsx`** — New "Step 0" screen shown before Step 1:
   - Two large cards: "Tell us about your dream trip" (opens textarea) and "Answer step by step" (skips to Step 1)
   - If "free text" is chosen, show a large textarea with placeholder example
   - On "Continue", run client-side parsing: regex for numbers (group size, days, budget), date patterns, known destination names, keywords matching vibes (beach, food, nightlife, etc.)
   - Parsed values pre-fill the questionnaire state; raw text stored in `notes` field
   - User then proceeds through normal steps to review/adjust

## Files to Modify

1. **`src/components/trip-builder/TripBuilderFlow.tsx`** — Main orchestrator:
   - Accept `tripId` prop and call `useTripBuilderDefaults(tripId)`
   - Initialize questionnaire state from defaults (destination, dates, budget, vibes, pace)
   - Add Step 0 (StepEntryChoice) before current Step 1; adjust step index math and progress dots
   - Pass `groupSize` from member count to the Edge Function payload
   - Show "Based on your group's vote" or "From your Vibe Board" subtle notes on pre-filled steps

2. **`src/components/trip-builder/StepDestination.tsx`** — Show info badge when destination was pre-filled from a poll result

3. **`src/components/trip-builder/StepDates.tsx`** — Show info badge when dates were pre-filled from a poll or trip metadata

4. **`src/components/trip-builder/StepVibes.tsx`** — Pre-select pills matching Vibe Board musthave aggregates; show note "Pre-selected from your Vibe Board"

5. **`src/components/trip-builder/StepBudget.tsx`** — If Vibe Board "budget" question has a clear winner, pre-select matching budget level

6. **`src/components/trip-builder/StepPace.tsx`** — If Vibe Board "energy" question has a clear winner, map to pace (e.g. "Full send" → packed, "Slow & easy" → relaxed)

## Technical Approach

**Smart Defaults Hook (`useTripBuilderDefaults`):**
- Single hook with multiple `useQuery` calls (trip data, members, polls with options + votes, vibe aggregates)
- For polls: find polls with type "preference" that have location-related or date-related titles, get vote counts, pick the option with most votes
- For vibe mapping: aggregate musthave responses, pick top answers by count, map labels to questionnaire vibe pills using a lookup table:
  ```
  "Food & drinks" → "Food"
  "Beach & sun" → "Beach"  
  "Culture & history" → "Culture"
  "Nightlife" → "Nightlife"
  "Nature & hiking" → "Adventure"
  "Wellness & spa" → "Relaxation"
  "Shopping" → "Shopping"
  ```
- For budget: map vibe board "budget" winner to questionnaire budget level:
  ```
  "Treat ourselves" → "premium"
  "Mid-range" → "mid-range"
  "Budget-friendly" / "As cheap as possible" → "budget"
  ```
- For pace: map "energy" winner:
  ```
  "Full send" → "packed"
  "Balanced" → "balanced"
  "Slow & easy" → "relaxed"
  "Go with the flow" → "balanced"
  ```

**Free-text NLP Parsing (client-side):**
- Regex for group size: `/(\d+)\s*(friends|people|of us|persons)/i`
- Regex for budget: `/€?\$?(\d+)\s*\/?\s*(day|per day|a day)/i` → map to budget level
- Regex for duration: `/(\d+)\s*(days?|weeks?|nights?)/i`
- Keyword matching for vibes: scan for "beach", "food", "nightlife", "culture", etc.
- Destination: first capitalized multi-word phrase not matching known keywords, or after "to" / "in" prepositions
- All parsing is best-effort; user reviews each step after

**Info Badges:** Small `text-muted-foreground` text below step titles like "📊 Based on your group's vote" or "✨ From your Vibe Board" — subtle, not intrusive.

**No database changes needed.** All data comes from existing tables via existing queries/RPCs.

