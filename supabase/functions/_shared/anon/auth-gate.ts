// Decides whether a generate-trip-itinerary request is authorized to proceed,
// and along which path (authenticated, anonymous, or rejected with a specific
// 401/400 reason). Pulled out of the Edge Function entry point so it can be
// unit-tested without booting the whole pipeline.

import { isValidAnonSessionId } from "./rate-limit.ts";

export interface GateRequestBody {
  trip_id?: string | null;
  alternatives_mode?: boolean;
  anon_session_id?: string | null;
}

export type GateDecision =
  | { kind: "authenticated"; userId: string }
  | { kind: "anonymous"; anonSessionId: string }
  | {
      kind: "reject";
      status: 400 | 401;
      code: "auth_required" | "invalid_body";
      message: string;
    };

export interface GateInput {
  // Already-resolved identity. The caller does the JWT exchange and passes
  // the resulting user id (or null on no/invalid bearer).
  authenticatedUserId: string | null;
  body: GateRequestBody;
}

export function decideAuthGate(input: GateInput): GateDecision {
  if (input.authenticatedUserId) {
    return { kind: "authenticated", userId: input.authenticatedUserId };
  }

  // No bearer / invalid bearer: anonymous path is conditional.
  const anonSessionId = isValidAnonSessionId(input.body?.anon_session_id)
    ? (input.body.anon_session_id as string)
    : null;

  if (!anonSessionId) {
    return {
      kind: "reject",
      status: 401,
      code: "auth_required",
      message: "Unauthorized",
    };
  }
  if (input.body.alternatives_mode) {
    return {
      kind: "reject",
      status: 401,
      code: "auth_required",
      message: "Sign up to refine activities.",
    };
  }
  if (typeof input.body.trip_id === "string" && input.body.trip_id.trim()) {
    return {
      kind: "reject",
      status: 401,
      code: "auth_required",
      message: "Sign up to save or regenerate.",
    };
  }
  return { kind: "anonymous", anonSessionId };
}
