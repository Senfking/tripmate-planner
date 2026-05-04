// Centralized feature flags. Flip to re-enable.
//
// Concierge: temporarily hidden from the UI for launch due to a known
// venue-name hallucination bug. Backend (edge function, DB tables) is
// intentionally left in place so we can flip this to `true` to reactivate.
export const CONCIERGE_ENABLED = false;
