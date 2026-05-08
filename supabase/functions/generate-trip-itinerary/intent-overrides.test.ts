// Run with:
//   deno test supabase/functions/generate-trip-itinerary/intent-overrides.test.ts
//
// Covers parseIntent's free-text-derived overrides for the form-supplied
// group_size / travel_party / budget_level. The form-builder UI sends
// hardcoded defaults (group_size=2, travel_party="couple", budget_level="mid-range")
// that silently neutralize every downstream tier-aware fix unless the LLM's
// extraction is honored. These tests cover both:
//   1. parseIntentOverrides — defensive parsing of the LLM tool result.
//   2. applyIntentOverrides — mutation of body + intent + log emission.

import {
  applyIntentOverrides,
  type AppliedOverride,
  type IntentOverrides,
  type OverridableBody,
  type OverridableIntent,
  parseIntentOverrides,
} from "./intent-overrides.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

function assertEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
  }
}

// ---------------------------------------------------------------------------
// parseIntentOverrides — defensive parsing of LLM tool results
// ---------------------------------------------------------------------------

Deno.test("parseIntentOverrides: omitted fields => all null (form defaults flow through)", () => {
  // The LLM is instructed to OMIT the fields when the user's free_text doesn't
  // make them explicit. The parser must surface that as null (not a default
  // value), so applyIntentOverrides leaves form-supplied values alone.
  const out = parseIntentOverrides({
    destination: "Tokyo",
    vibes: ["foodie"],
    must_haves: [],
    must_avoids: [],
    budget_tier: "mid-range",
    pace: "balanced",
    dietary: [],
    group_composition: "group of 2",
  });
  assertEqual(out.extracted_group_size, null, "group_size should be null when omitted");
  assertEqual(out.extracted_travel_party, null, "travel_party should be null when omitted");
  assertEqual(out.extracted_budget_level, null, "budget_level should be null when omitted");
});

Deno.test("parseIntentOverrides: explicit nulls also resolve to null", () => {
  const out = parseIntentOverrides({
    extracted_group_size: null,
    extracted_travel_party: null,
    extracted_budget_level: null,
  });
  assertEqual(out.extracted_group_size, null, "explicit null group_size");
  assertEqual(out.extracted_travel_party, null, "explicit null travel_party");
  assertEqual(out.extracted_budget_level, null, "explicit null budget_level");
});

Deno.test("parseIntentOverrides: '4 friends' shape extracts group=4 + party=friends", () => {
  // Test 1 from the upstream task — Dubai prompt.
  const out = parseIntentOverrides({
    extracted_group_size: 4,
    extracted_travel_party: "friends",
    extracted_budget_level: "premium",
  });
  assertEqual(out.extracted_group_size, 4, "group=4");
  assertEqual(out.extracted_travel_party, "friends", "party=friends");
  assertEqual(out.extracted_budget_level, "premium", "budget=premium");
});

Deno.test("parseIntentOverrides: 'romantic anniversary, Michelin' shape => couple/luxury", () => {
  // Test 2 — Paris luxury prompt.
  const out = parseIntentOverrides({
    extracted_group_size: 2,
    extracted_travel_party: "couple",
    extracted_budget_level: "luxury",
  });
  assertEqual(out.extracted_group_size, 2, "group=2");
  assertEqual(out.extracted_travel_party, "couple", "party=couple");
  assertEqual(out.extracted_budget_level, "luxury", "budget=luxury");
});

Deno.test("parseIntentOverrides: 'backpacking solo' shape => solo/budget/1", () => {
  // Test 3 — Vietnam backpacking.
  const out = parseIntentOverrides({
    extracted_group_size: 1,
    extracted_travel_party: "solo",
    extracted_budget_level: "budget",
  });
  assertEqual(out.extracted_group_size, 1, "group=1");
  assertEqual(out.extracted_travel_party, "solo", "party=solo");
  assertEqual(out.extracted_budget_level, "budget", "budget=budget");
});

Deno.test("parseIntentOverrides: 'family of 5' shape => 5/family, budget OMITTED", () => {
  // Test 5 — Disney World family. budget_level not explicit → must remain null.
  const out = parseIntentOverrides({
    extracted_group_size: 5,
    extracted_travel_party: "family",
    // extracted_budget_level intentionally omitted
  });
  assertEqual(out.extracted_group_size, 5, "group=5");
  assertEqual(out.extracted_travel_party, "family", "party=family");
  assertEqual(out.extracted_budget_level, null, "budget=null (omitted)");
});

Deno.test("parseIntentOverrides: rounds + clamps invalid numerics to null", () => {
  const fractional = parseIntentOverrides({ extracted_group_size: 4.6 });
  assertEqual(fractional.extracted_group_size, 5, "4.6 → 5 (rounds)");

  const zero = parseIntentOverrides({ extracted_group_size: 0 });
  assertEqual(zero.extracted_group_size, null, "0 below minimum → null");

  const huge = parseIntentOverrides({ extracted_group_size: 9999 });
  assertEqual(huge.extracted_group_size, null, "above max → null");

  const nan = parseIntentOverrides({ extracted_group_size: Number.NaN });
  assertEqual(nan.extracted_group_size, null, "NaN → null");

  const str = parseIntentOverrides({ extracted_group_size: "4" });
  assertEqual(str.extracted_group_size, null, "string → null (strict number check)");
});

Deno.test("parseIntentOverrides: rejects out-of-enum strings", () => {
  const bogusParty = parseIntentOverrides({ extracted_travel_party: "platonic" });
  assertEqual(bogusParty.extracted_travel_party, null, "non-enum party → null");

  const bogusBudget = parseIntentOverrides({ extracted_budget_level: "yolo" });
  assertEqual(bogusBudget.extracted_budget_level, null, "non-enum budget → null");

  const numericParty = parseIntentOverrides({ extracted_travel_party: 4 as unknown });
  assertEqual(numericParty.extracted_travel_party, null, "numeric party → null");
});

Deno.test("parseIntentOverrides: solo/group/group_size=1 round-trips correctly", () => {
  const out = parseIntentOverrides({
    extracted_group_size: 1,
    extracted_travel_party: "solo",
  });
  assertEqual(out.extracted_group_size, 1, "solo → 1");
  assertEqual(out.extracted_travel_party, "solo", "solo party");
});

Deno.test("parseIntentOverrides: 'group' enum (8-of-us bachelor party) survives", () => {
  const out = parseIntentOverrides({
    extracted_group_size: 8,
    extracted_travel_party: "group",
    extracted_budget_level: "luxury",
  });
  assertEqual(out.extracted_group_size, 8, "group=8");
  assertEqual(out.extracted_travel_party, "group", "party=group");
  assertEqual(out.extracted_budget_level, "luxury", "budget=luxury");
});

Deno.test("parseIntentOverrides: edge case — 'budget word wins' shape (10)", () => {
  // Test 10 from the prompt — "Shoestring backpacking trip but I want one
  // night at Atlantis" should yield budget=budget despite the premium venue.
  // The system prompt instructs the LLM to take the explicit budget word;
  // the parser just faithfully relays whatever the LLM emits.
  const out = parseIntentOverrides({
    extracted_budget_level: "budget",
  });
  assertEqual(out.extracted_budget_level, "budget", "explicit budget word wins");
  assertEqual(out.extracted_group_size, null, "no count given → null");
  assertEqual(out.extracted_travel_party, null, "ambiguous party → null");
});

// ---------------------------------------------------------------------------
// applyIntentOverrides — mutation of body + intent + log capture
// ---------------------------------------------------------------------------

function captureLog(): { messages: string[]; log: (m: string) => void } {
  const messages: string[] = [];
  return { messages, log: (m: string) => messages.push(m) };
}

function freshState(): { body: OverridableBody; intent: OverridableIntent } {
  // The form-builder defaults the upstream task calls out as silently
  // neutralizing downstream fixes.
  return {
    body: { group_size: 2, budget_level: "mid-range", travel_party: "couple" },
    intent: { budget_tier: "mid-range", group_composition: "couple" },
  };
}

Deno.test("applyIntentOverrides: all-null overrides leave form defaults intact", () => {
  const { body, intent } = freshState();
  const { log, messages } = captureLog();
  const overrides: IntentOverrides = {
    extracted_group_size: null,
    extracted_travel_party: null,
    extracted_budget_level: null,
  };
  const { applied } = applyIntentOverrides(body, intent, overrides, log);
  assertEqual(applied.length, 0, "no overrides applied");
  assertEqual(messages.length, 0, "no log lines emitted");
  assertEqual(body.group_size, 2, "group_size default preserved");
  assertEqual(body.budget_level, "mid-range", "budget_level default preserved");
  assertEqual(body.travel_party, "couple", "travel_party default preserved");
  assertEqual(intent.budget_tier, "mid-range", "intent.budget_tier preserved");
});

Deno.test("applyIntentOverrides: Dubai 4-friends-premium overrides all three fields", () => {
  // Test 1 (upstream task): "4 friends, 9 days in Dubai, beach clubs and
  // serious nightlife" → premium-tier group of 4 friends. The form sent
  // (2, couple, mid-range). Override must replace all three.
  const { body, intent } = freshState();
  const { log, messages } = captureLog();
  applyIntentOverrides(
    body,
    intent,
    {
      extracted_group_size: 4,
      extracted_travel_party: "friends",
      extracted_budget_level: "premium",
    },
    log,
  );
  assertEqual(body.group_size, 4, "group_size → 4");
  assertEqual(body.travel_party, "friends", "travel_party → friends");
  assertEqual(body.budget_level, "premium", "budget_level → premium");
  assertEqual(intent.budget_tier, "premium", "intent.budget_tier → premium");
  assertEqual(messages.length, 3, "3 override log lines");
  assert(
    messages[0].includes("[intent_override] field=group_size form_value=2 free_text_value=4"),
    "group_size log shape",
  );
  assert(
    messages[1].includes("field=travel_party form_value=couple free_text_value=friends"),
    "travel_party log shape",
  );
  assert(
    messages[2].includes("field=budget_level form_value=mid-range free_text_value=premium"),
    "budget_level log shape",
  );
});

Deno.test("applyIntentOverrides: 'luxury' maps to 'premium' on body + intent, log keeps 'luxury'", () => {
  // Test 2 — Paris Michelin anniversary. BudgetLevel only has three tiers,
  // so "luxury" collapses to "premium" on the runtime types. The log entry
  // must preserve the original "luxury" signal so production logs don't
  // lose the upper-end intent.
  const { body, intent } = freshState();
  const { log, messages } = captureLog();
  applyIntentOverrides(
    body,
    intent,
    {
      extracted_group_size: 2,
      extracted_travel_party: "couple",
      extracted_budget_level: "luxury",
    },
    log,
  );
  assertEqual(body.budget_level, "premium", "luxury collapses to premium on body");
  assertEqual(intent.budget_tier, "premium", "luxury collapses to premium on intent");
  // group_size and travel_party already match the form defaults — no override
  // log line for those (only budget_level changes here).
  assertEqual(messages.length, 1, "only budget_level overridden");
  assert(
    messages[0].includes("free_text_value=luxury"),
    "log keeps the original 'luxury' token",
  );
  assert(messages[0].includes("(mapped→premium)"), "log notes the luxury→premium mapping");
});

Deno.test("applyIntentOverrides: solo backpacker (1/solo/budget) lowers all three fields", () => {
  // Test 3 — Vietnam backpacking. Form sent (2, couple, mid-range) defaults;
  // free_text contradicts every one of them.
  const { body, intent } = freshState();
  const { log, messages } = captureLog();
  applyIntentOverrides(
    body,
    intent,
    {
      extracted_group_size: 1,
      extracted_travel_party: "solo",
      extracted_budget_level: "budget",
    },
    log,
  );
  assertEqual(body.group_size, 1, "group_size → 1");
  assertEqual(body.travel_party, "solo", "travel_party → solo");
  assertEqual(body.budget_level, "budget", "budget_level → budget");
  assertEqual(intent.budget_tier, "budget", "intent.budget_tier → budget");
  assertEqual(messages.length, 3, "3 log lines for 3 changes");
});

Deno.test("applyIntentOverrides: family-of-5 leaves budget_level alone (null)", () => {
  // Test 5 — Disney World family. Group + party override, but budget signal
  // is absent; the form's mid-range default must flow through unchanged.
  const { body, intent } = freshState();
  const { log, messages } = captureLog();
  applyIntentOverrides(
    body,
    intent,
    {
      extracted_group_size: 5,
      extracted_travel_party: "family",
      extracted_budget_level: null,
    },
    log,
  );
  assertEqual(body.group_size, 5, "group_size → 5");
  assertEqual(body.travel_party, "family", "travel_party → family");
  assertEqual(body.budget_level, "mid-range", "budget_level untouched (form default)");
  assertEqual(intent.budget_tier, "mid-range", "intent.budget_tier untouched");
  assertEqual(messages.length, 2, "only group_size + travel_party logged");
});

Deno.test("applyIntentOverrides: same-as-form values produce no log noise", () => {
  // When the LLM extracts a value that happens to equal the form's value
  // (e.g. user wrote "with my wife" — extracted couple, form already couple),
  // applying the override should be a no-op. No log line, applied[] empty
  // for that field.
  const { body, intent } = freshState();
  const { log, messages } = captureLog();
  const { applied } = applyIntentOverrides(
    body,
    intent,
    {
      extracted_group_size: 2,
      extracted_travel_party: "couple",
      extracted_budget_level: "mid-range",
    },
    log,
  );
  assertEqual(applied.length, 0, "no overrides since values match form");
  assertEqual(messages.length, 0, "no log noise for no-op overrides");
});

Deno.test("applyIntentOverrides: respects form-supplied non-default values too", () => {
  // If the form already sent group_size=10 (e.g. group trip selector) and
  // free_text doesn't extract a count, we must preserve the 10. This guards
  // against the override accidentally clobbering form-supplied non-defaults.
  const body: OverridableBody = { group_size: 10, budget_level: "premium", travel_party: "group" };
  const intent: OverridableIntent = { budget_tier: "premium", group_composition: "group of 10" };
  const { log, messages } = captureLog();
  applyIntentOverrides(
    body,
    intent,
    {
      extracted_group_size: null,
      extracted_travel_party: null,
      extracted_budget_level: null,
    },
    log,
  );
  assertEqual(body.group_size, 10, "form-supplied 10 preserved");
  assertEqual(body.budget_level, "premium", "form-supplied premium preserved");
  assertEqual(body.travel_party, "group", "form-supplied group preserved");
  assertEqual(intent.budget_tier, "premium", "intent unchanged");
  assertEqual(messages.length, 0, "no log lines");
});

Deno.test("applyIntentOverrides: budget edge case — explicit budget word wins over premium venue", () => {
  // Test from prompt rule: "Shoestring backpacking trip but I want one night
  // at Atlantis" — the LLM is told to extract "budget" as the winner. The
  // override applies that to body.budget_level + intent.budget_tier, even
  // when the form sent "mid-range" or "premium".
  const body: OverridableBody = { group_size: 2, budget_level: "premium", travel_party: "couple" };
  const intent: OverridableIntent = { budget_tier: "premium", group_composition: "couple" };
  const { log } = captureLog();
  applyIntentOverrides(
    body,
    intent,
    {
      extracted_group_size: null,
      extracted_travel_party: null,
      extracted_budget_level: "budget",
    },
    log,
  );
  assertEqual(body.budget_level, "budget", "explicit budget word forces body to budget");
  assertEqual(intent.budget_tier, "budget", "explicit budget word forces intent to budget");
});

Deno.test("applied[] return value matches the emitted log lines exactly", () => {
  const { body, intent } = freshState();
  const { log } = captureLog();
  const { applied } = applyIntentOverrides(
    body,
    intent,
    {
      extracted_group_size: 4,
      extracted_travel_party: "friends",
      extracted_budget_level: "premium",
    },
    log,
  );
  const fields = applied.map((a: AppliedOverride) => a.field).sort();
  assert(
    JSON.stringify(fields) === JSON.stringify(["budget_level", "group_size", "travel_party"]),
    `applied[] should list all three fields, got ${JSON.stringify(fields)}`,
  );
});
