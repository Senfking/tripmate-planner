// get-tier-budgets
// Returns destination-aware per-person daily budgets for the four tiers
// (budget / mid-range / premium / luxury) used in the Refine your plan modal.
//
// Caches results in ai_response_cache keyed by destination + currency + duration
// so repeated opens of the modal don't re-bill the LLM. Falls back gracefully
// (returns success:false) if the AI gateway is unreachable or the response
// can't be parsed — the frontend then hides the auto-populate behavior.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface TierBudgets {
  budget: number;
  midRange: number;
  premium: number;
  luxury: number;
}

const TIER_BUDGETS_TOOL = {
  name: "return_tier_budgets",
  description:
    "Return realistic per-person daily budgets for a trip across four tiers. Numbers must reflect actual market prices for the destination — luxury in expensive cities should be 10-20x the budget tier, not 4x.",
  parameters: {
    type: "object",
    properties: {
      budget: {
        type: "number",
        description:
          "Per-person daily budget in the requested currency for hostels/cheap guesthouses, street food, public transit. Whole number.",
      },
      midRange: {
        type: "number",
        description:
          "Per-person daily budget for 3-star hotels, casual sit-down dining, mix of paid attractions and walking. Whole number.",
      },
      premium: {
        type: "number",
        description:
          "Per-person daily budget for 4-star hotels, well-reviewed restaurants, private day tours, occasional taxis. Whole number.",
      },
      luxury: {
        type: "number",
        description:
          "Per-person daily budget for 5-star hotels, fine dining (often Michelin-class), private transfers, premium experiences. Whole number.",
      },
    },
    required: ["budget", "midRange", "premium", "luxury"],
  },
} as const;

function buildSystemPrompt() {
  return [
    "You are a travel budgeting expert. Estimate realistic per-person daily spending for trips at four service levels.",
    "Anchor numbers to actual market prices for the destination — local cost of living, hotel rates, restaurant pricing, transport.",
    "Critical: luxury is NOT a small multiple of budget. In Western European or North American cities, luxury (5-star + fine dining + private transfers) is typically 10-20x the backpacker budget in absolute terms. In Southeast Asia the spread is even wider.",
    "Examples of realistic luxury daily per-person budgets: Hamburg ~EUR 500, Paris ~EUR 700, Tokyo ~JPY 90000, Bangkok ~THB 12000, New York ~USD 800, Reykjavik ~EUR 750.",
    "Return whole numbers in the requested currency. Do not return ranges, do not include text — only call the return_tier_budgets tool.",
  ].join(" ");
}

function buildUserPrompt(destination: string, numDays: number, currency: string) {
  return `Destination: ${destination}\nTrip length: ${numDays} day(s)\nCurrency: ${currency}\n\nReturn realistic per-person daily budgets for the four tiers in ${currency}.`;
}

async function callAI(
  apiKey: string,
  destination: string,
  numDays: number,
  currency: string,
): Promise<TierBudgets | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(destination, numDays, currency) },
        ],
        tools: [{ type: "function", function: TIER_BUDGETS_TOOL }],
        tool_choice: { type: "function", function: { name: TIER_BUDGETS_TOOL.name } },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("get-tier-budgets AI error:", res.status, errText.slice(0, 500));
      return null;
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      console.error("get-tier-budgets: no tool call in AI response");
      return null;
    }

    const parsed = JSON.parse(argsRaw);
    const out: TierBudgets = {
      budget: Math.round(Number(parsed.budget)),
      midRange: Math.round(Number(parsed.midRange)),
      premium: Math.round(Number(parsed.premium)),
      luxury: Math.round(Number(parsed.luxury)),
    };

    // Sanity check: tiers must be monotonically increasing and positive.
    if (
      !Number.isFinite(out.budget) || out.budget <= 0 ||
      !(out.midRange > out.budget) ||
      !(out.premium > out.midRange) ||
      !(out.luxury > out.premium)
    ) {
      console.error("get-tier-budgets: AI returned implausible tiers", out);
      return null;
    }

    return out;
  } catch (err) {
    console.error("get-tier-budgets AI call failed:", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return jsonResponse({ success: false, error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const destination = String(body.destination || "").trim();
    const currency = String(body.currency || "USD").trim().toUpperCase().slice(0, 8);
    const numDays = Math.max(1, Math.min(60, Number(body.numDays) || 1));

    if (!destination) {
      return jsonResponse({ success: false, error: "destination required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey)
      : null;

    // Cache key — destination + currency dominate; bucket numDays loosely so
    // a 3-day and 5-day Hamburg trip share the same lookup.
    const dayBucket = numDays <= 2 ? "short" : numDays <= 7 ? "med" : "long";
    const cacheKey = `tier_budgets:${destination.toLowerCase()}:${currency}:${dayBucket}`;

    if (supabase) {
      const { data: cached } = await supabase
        .from("ai_response_cache")
        .select("response_json, expires_at")
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached?.response_json) {
        return jsonResponse({
          success: true,
          cached: true,
          tiers: cached.response_json,
        });
      }
    }

    const tiers = await callAI(apiKey, destination, numDays, currency);
    if (!tiers) {
      return jsonResponse({ success: false, error: "ai_unavailable" }, 502);
    }

    if (supabase) {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: cacheErr } = await supabase
        .from("ai_response_cache")
        .upsert(
          {
            cache_key: cacheKey,
            response_json: tiers as unknown as Record<string, unknown>,
            expires_at: expiresAt,
          },
          { onConflict: "cache_key" },
        );
      if (cacheErr) console.error("get-tier-budgets cache write failed:", cacheErr.message);
    }

    return jsonResponse({ success: true, cached: false, tiers });
  } catch (err) {
    console.error("get-tier-budgets fatal:", (err as Error).message);
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
