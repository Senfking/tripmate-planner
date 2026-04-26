// Cross-component channel for opening the feedback widget with pre-filled
// context. Used by the error toast's "Send to support" button so a user can
// report an issue without losing the technical context the toast already has.
//
// The widget mounts globally and listens for OPEN_FEEDBACK_EVENT; any caller
// can fire requestOpenFeedback() to surface it.

export interface FeedbackErrorContext {
  friendly?: string;
  code?: string | null;
  status?: number | null;
  name?: string | null;
  message?: string | null;
  hint?: string | null;
  route?: string | null;
  capturedAt?: string;
  extra?: Record<string, unknown>;
}

export interface OpenFeedbackOptions {
  category?: "bug" | "suggestion";
  /** Pre-filled message body (user can edit before sending). */
  prefill?: string;
  /** Structured error context attached to the feedback row's metadata. */
  errorContext?: FeedbackErrorContext;
}

export const OPEN_FEEDBACK_EVENT = "junto:open-feedback";

export function requestOpenFeedback(options: OpenFeedbackOptions = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenFeedbackOptions>(OPEN_FEEDBACK_EVENT, { detail: options }),
  );
}
