// sessionStorage handoff for the Hero prompt across navigations.
// Only used for cross-page handoff (e.g. logged-out user submits on /,
// gets sent to /ref to sign up, then lands on /trips/new and the builder
// consumes the stashed prompt). In-page handoff (Hero → builder on the
// same /trips/new page when authed) goes via React state, NOT this helper.

const KEY = "junto:pending_trip_prompt";

export function stashPendingPrompt(prompt: string): void {
  try {
    sessionStorage.setItem(KEY, prompt);
  } catch {
    // sessionStorage can throw in private mode / disabled storage —
    // silently no-op. The user can still type the prompt again post-signup.
  }
}

/** Reads and clears the stashed prompt. Returns null if nothing was stashed. */
export function consumePendingPrompt(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
