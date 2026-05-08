// Intent-extraction overrides.
//
// parseIntent's LLM tool emits three optional fields (extracted_group_size,
// extracted_travel_party, extracted_budget_level) when the user's free_text
// makes them explicit or strongly implies them. The form-builder UI sends
// hardcoded defaults (group_size=2, travel_party="couple", budget_level="mid-range")
// even when the user wrote "4 friends, 9 days in Dubai, beach clubs and serious
// nightlife" — those defaults silently neutralize every downstream tier-aware
// fix unless we honor the free_text instead.
//
// Pure helpers split into a sibling module so unit tests can import them
// without loading index.ts.

export type TravelParty = "solo" | "couple" | "friends" | "family" | "group";

// The LLM is allowed to emit "luxury" so we capture the upper end faithfully.
// The system's runtime BudgetLevel only has three tiers; applyIntentOverrides
// maps "luxury" → "premium" when writing back to the request body and intent.
export type ExtractedBudgetLevel = "budget" | "mid-range" | "premium" | "luxury";

export interface IntentOverrides {
  extracted_group_size: number | null;
  extracted_travel_party: TravelParty | null;
  extracted_budget_level: ExtractedBudgetLevel | null;
}

const TRAVEL_PARTY_VALUES: readonly TravelParty[] = [
  "solo",
  "couple",
  "friends",
  "family",
  "group",
];

const BUDGET_LEVEL_VALUES: readonly ExtractedBudgetLevel[] = [
  "budget",
  "mid-range",
  "premium",
  "luxury",
];

// Defensive parser for the LLM tool result. Accepts unknowns and returns
// nulls when a field is missing, the wrong type, or out of the allowed range.
// The model is instructed to omit fields entirely when not specified, but
// also tolerate explicit null and other shapes the caller might pass through.
export function parseIntentOverrides(data: Record<string, unknown>): IntentOverrides {
  const rawSize = data.extracted_group_size;
  const groupSize =
    typeof rawSize === "number" && Number.isFinite(rawSize) && rawSize >= 1 && rawSize <= 50
      ? Math.round(rawSize)
      : null;

  const rawParty = data.extracted_travel_party;
  const travelParty: TravelParty | null =
    typeof rawParty === "string" && (TRAVEL_PARTY_VALUES as readonly string[]).includes(rawParty)
      ? (rawParty as TravelParty)
      : null;

  const rawBudget = data.extracted_budget_level;
  const budgetLevel: ExtractedBudgetLevel | null =
    typeof rawBudget === "string" && (BUDGET_LEVEL_VALUES as readonly string[]).includes(rawBudget)
      ? (rawBudget as ExtractedBudgetLevel)
      : null;

  return {
    extracted_group_size: groupSize,
    extracted_travel_party: travelParty,
    extracted_budget_level: budgetLevel,
  };
}

// Minimal structural typings so this module doesn't depend on index.ts.
export interface OverridableBody {
  group_size?: number;
  budget_level?: "budget" | "mid-range" | "premium";
  travel_party?: TravelParty;
}

export interface OverridableIntent {
  budget_tier: "budget" | "mid-range" | "premium";
  group_composition: string;
}

export interface AppliedOverride {
  field: "group_size" | "travel_party" | "budget_level";
  form_value: string | number | null | undefined;
  free_text_value: string | number;
}

// Mutates `body` and `intent` in place when the LLM extracted a non-null
// override. Callers pass `log` to capture the override events; falls back to
// console.log when omitted. Each override is also pushed to the returned
// `applied[]` for callers that want to inspect them (e.g. tests).
//
// "luxury" budget extraction maps to "premium" on the BudgetLevel-typed
// body/intent fields — the runtime tier system maxes out at premium. The
// log entry preserves the original "luxury" value so the signal isn't lost.
export function applyIntentOverrides(
  body: OverridableBody,
  intent: OverridableIntent,
  overrides: IntentOverrides,
  log: (msg: string) => void = (m) => console.log(m),
): { applied: AppliedOverride[] } {
  const applied: AppliedOverride[] = [];

  if (overrides.extracted_group_size !== null) {
    const before = body.group_size;
    if (before !== overrides.extracted_group_size) {
      body.group_size = overrides.extracted_group_size;
      applied.push({
        field: "group_size",
        form_value: before ?? null,
        free_text_value: overrides.extracted_group_size,
      });
      log(
        `[intent_override] field=group_size form_value=${before ?? "unset"} ` +
        `free_text_value=${overrides.extracted_group_size}`,
      );
    }
  }

  if (overrides.extracted_travel_party !== null) {
    const before = body.travel_party;
    if (before !== overrides.extracted_travel_party) {
      body.travel_party = overrides.extracted_travel_party;
      applied.push({
        field: "travel_party",
        form_value: before ?? null,
        free_text_value: overrides.extracted_travel_party,
      });
      log(
        `[intent_override] field=travel_party form_value=${before ?? "unset"} ` +
        `free_text_value=${overrides.extracted_travel_party}`,
      );
    }
  }

  if (overrides.extracted_budget_level !== null) {
    // BudgetLevel only has three tiers — collapse "luxury" into "premium" for
    // the form-typed body and the intent's budget_tier. Log the original
    // extracted token so the upper-end signal is preserved in production logs.
    const mapped: "budget" | "mid-range" | "premium" =
      overrides.extracted_budget_level === "luxury"
        ? "premium"
        : overrides.extracted_budget_level;
    const before = body.budget_level;
    const intentBefore = intent.budget_tier;
    if (before !== mapped || intentBefore !== mapped) {
      body.budget_level = mapped;
      intent.budget_tier = mapped;
      applied.push({
        field: "budget_level",
        form_value: before ?? null,
        free_text_value: overrides.extracted_budget_level,
      });
      log(
        `[intent_override] field=budget_level form_value=${before ?? "unset"} ` +
        `free_text_value=${overrides.extracted_budget_level}` +
        (overrides.extracted_budget_level === "luxury" ? " (mapped→premium)" : ""),
      );
    }
  }

  return { applied };
}
